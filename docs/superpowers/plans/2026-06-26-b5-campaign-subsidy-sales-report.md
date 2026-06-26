# B5 — Campaign subsidy in the sales report — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show each sale's `campaignSubsidySnapshot` in the sales-summary PDF — a new `เงินสนับสนุน` column, a net car-discount subline (`carDiscount − subsidy`), footer totals, and fold the subsidy into `กำไรสุทธิ` (net profit).

**Architecture:** Extract the per-sale money math into a pure, exported helper in the existing `sales-summary.helpers.ts` (alongside `buildSalespersonBreakdown`) so it is unit-tested against the *real* code rather than a mirror. `reports.service.ts` calls the helper and emits two new per-sale fields plus two footer totals. The Handlebars PDF template renders the new column, the conditional subline, and the footer cells. No web/shared-type/Excel changes — those surfaces don't show per-sale financials.

**Tech Stack:** Bun test runner, TypeScript, Prisma `Decimal`, Handlebars (PDF templates), ElysiaJS.

## Global Constraints

- Reports render in **A4 landscape** (already set in this template; keep it). Portrait only on explicit request.
- Thai-language UI strings, English code identifiers.
- Biome formatting: single quotes, semicolons, 2-space indent, 100-char width.
- Decimal fields come from Prisma as `Decimal`; convert with the existing `toNumber()` (returns `0` for null/undefined).
- `campaignSubsidySnapshot` is frozen at sale create/update; sales predating it are `null` → treat as `0`. No backfill.
- Known dense-table PDF gotcha: the base layout has `th, td { font-size: 13px }` and `@page` can double-margin/clip — this template already pins cell `font-size: 8px` and `@page margin: 0`; keep the table within 100% colgroup width to avoid right-edge clipping.
- Do not curve-fit tests: assert against independently computed ground-truth numbers, import the real helper.

---

## File Structure

- **Modify** `apps/api/src/modules/reports/sales-summary.helpers.ts` — add pure helper `computeSaleMoney` + its input/result types.
- **Modify** `apps/api/src/__tests__/reports-helpers.test.ts` — unit tests for `computeSaleMoney` (real import).
- **Modify** `apps/api/src/__tests__/sales-summary-report-fields.test.ts` — remove the now-redundant local `computeNetProfit` mirror + its 3 cases (re-homed to the helper test); keep the unrelated `computeTransportFee` tests.
- **Modify** `apps/api/src/modules/reports/reports.service.ts` — call `computeSaleMoney` in the `saleItems.map`; add `campaignSubsidy` + `netCarDiscount` to each row; add `totalCampaignSubsidy` + `totalNetCarDiscount` footer totals.
- **Modify** `apps/api/src/modules/pdf/templates/sales-summary-report.hbs` — new `เงินสนับสนุน` column, conditional `สุทธิ` subline, footer cells, updated `<colgroup>`.

---

## Task 1: Pure money helper `computeSaleMoney` (TDD)

**Files:**
- Modify: `apps/api/src/modules/reports/sales-summary.helpers.ts`
- Test: `apps/api/src/__tests__/reports-helpers.test.ts`
- Test (cleanup): `apps/api/src/__tests__/sales-summary-report-fields.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface SaleMoneyInput {
    sellingPrice: number;
    totalCostWithInterest: number;
    carDiscount: number;            // already-resolved discountAmount
    campaignSubsidy?: number | null;
    financeCommission?: number | null;
    salesCommission?: number | null;
    salesExpense?: number | null;
  }
  export interface SaleMoneyResult {
    campaignSubsidy: number;        // input subsidy, null → 0
    netCarDiscount: number;         // carDiscount − campaignSubsidy (may be negative)
    netProfit: number;              // sellingPrice − totalCostWithInterest
                                    //   + financeCommission − salesCommission
                                    //   − salesExpense + campaignSubsidy
  }
  export function computeSaleMoney(input: SaleMoneyInput): SaleMoneyResult;
  ```

- [ ] **Step 1: Write the failing tests**

Add to the end of `apps/api/src/__tests__/reports-helpers.test.ts` (the file already `import { describe, expect, it } from 'bun:test'`):

```ts
import { computeSaleMoney } from '../modules/reports/sales-summary.helpers';

describe('computeSaleMoney', () => {
  it('folds the subsidy into net profit and nets the car discount', () => {
    const r = computeSaleMoney({
      sellingPrice: 1_000_000,
      totalCostWithInterest: 900_000,
      carDiscount: 30_000,
      campaignSubsidy: 20_000,
      financeCommission: 15_000,
      salesCommission: 5_000,
      salesExpense: 3_000,
    });
    // 1,000,000 − 900,000 + 15,000 − 5,000 − 3,000 + 20,000 = 127,000
    expect(r.netProfit).toBe(127_000);
    expect(r.netCarDiscount).toBe(10_000); // 30,000 − 20,000
    expect(r.campaignSubsidy).toBe(20_000);
  });

  it('treats a null subsidy as 0 (no campaign / historical sale)', () => {
    const r = computeSaleMoney({
      sellingPrice: 1_000_000,
      totalCostWithInterest: 900_000,
      carDiscount: 30_000,
      campaignSubsidy: null,
      financeCommission: null,
      salesCommission: null,
      salesExpense: null,
    });
    expect(r.netProfit).toBe(100_000); // unchanged by subsidy
    expect(r.netCarDiscount).toBe(30_000); // equals gross discount
    expect(r.campaignSubsidy).toBe(0);
  });

  it('allows a negative net car-discount when subsidy exceeds the discount', () => {
    const r = computeSaleMoney({
      sellingPrice: 500_000,
      totalCostWithInterest: 450_000,
      carDiscount: 10_000,
      campaignSubsidy: 25_000,
    });
    expect(r.netCarDiscount).toBe(-15_000); // 10,000 − 25,000
    expect(r.netProfit).toBe(75_000); // 50,000 + 25,000
    expect(r.campaignSubsidy).toBe(25_000);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/api && bun test src/__tests__/reports-helpers.test.ts`
Expected: FAIL — `computeSaleMoney` is not exported / undefined import.

- [ ] **Step 3: Implement the helper**

Append to `apps/api/src/modules/reports/sales-summary.helpers.ts`:

```ts
/** One sale's money inputs needed for the report's net-discount + profit math. */
export interface SaleMoneyInput {
  sellingPrice: number;
  totalCostWithInterest: number;
  /** Already-resolved car discount (carDiscount ?? discountSnapshot ?? 0). */
  carDiscount: number;
  /** Per-car campaign subsidy snapshot; null/undefined → 0. */
  campaignSubsidy?: number | null;
  financeCommission?: number | null;
  salesCommission?: number | null;
  salesExpense?: number | null;
}

export interface SaleMoneyResult {
  campaignSubsidy: number;
  netCarDiscount: number;
  netProfit: number;
}

/**
 * Per-sale money math for the sales-summary report.
 *
 * The selling price is already post-discount, so the car discount is NOT
 * subtracted again here. The campaign subsidy is brand money the dealership
 * receives back, so it is ADDED to net profit. `netCarDiscount` is a display
 * figure (carDiscount − subsidy) and may be negative when the subsidy exceeds
 * the discount given.
 */
export function computeSaleMoney(input: SaleMoneyInput): SaleMoneyResult {
  const campaignSubsidy = input.campaignSubsidy || 0;
  const netCarDiscount = input.carDiscount - campaignSubsidy;
  const netProfit =
    input.sellingPrice -
    input.totalCostWithInterest +
    (input.financeCommission || 0) -
    (input.salesCommission || 0) -
    (input.salesExpense || 0) +
    campaignSubsidy;
  return { campaignSubsidy, netCarDiscount, netProfit };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd apps/api && bun test src/__tests__/reports-helpers.test.ts`
Expected: PASS (all `computeSaleMoney` cases green, existing `splitVat`/breakdown tests still green).

- [ ] **Step 5: Re-home the redundant mirror tests**

In `apps/api/src/__tests__/sales-summary-report-fields.test.ts`, the local `computeNetProfit` now duplicates the real helper. Delete the `computeNetProfit` function (lines defining it) and its three `it(...)` cases (`'netProfit = gross profit ...'`, `'null dealer-side fields behave as 0 ...'`, `'buyer-charged fees are pass-through ...'`). Keep the `computeTransportFee` function and its test (separate concern, not part of B5). Update the file's top comment to point at the helper:

Replace the netProfit `describe(...)` body so the file reads:

```ts
import { describe, expect, it } from 'bun:test';

function computeTransportFee(input: {
  registrationFee?: number | null;
  compulsoryInsuranceFee?: number | null;
}): number {
  return (input.registrationFee || 0) + (input.compulsoryInsuranceFee || 0);
}

describe('monthly sales report — per-sale money mapping', () => {
  // netProfit / net-discount / subsidy math now lives in computeSaleMoney and is
  // tested against the real helper in reports-helpers.test.ts (no mirror here).

  it('ทะเบียน/พรบ/ขนส่ง column = registrationFee + compulsoryInsuranceFee', () => {
    expect(computeTransportFee({ registrationFee: 2_400, compulsoryInsuranceFee: 600 })).toBe(3_000);
    expect(computeTransportFee({})).toBe(0);
  });
});
```

- [ ] **Step 6: Run both test files**

Run: `cd apps/api && bun test src/__tests__/reports-helpers.test.ts src/__tests__/sales-summary-report-fields.test.ts`
Expected: PASS, no leftover references to `computeNetProfit`.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/modules/reports/sales-summary.helpers.ts \
        apps/api/src/__tests__/reports-helpers.test.ts \
        apps/api/src/__tests__/sales-summary-report-fields.test.ts
git commit -m "feat(reports): computeSaleMoney helper folds campaign subsidy into net profit"
```

---

## Task 2: Wire the helper into the sales-summary builder + footer totals

**Files:**
- Modify: `apps/api/src/modules/reports/reports.service.ts` (the `saleItems.map` near line 681–807, the footer totals near line 816–830, and the `return` summary near line 929+)

**Interfaces:**
- Consumes: `computeSaleMoney` from Task 1.
- Produces (on each sale row object): `campaignSubsidy: number`, `netCarDiscount: number`; (on `summary`): `totalCampaignSubsidy: number`, `totalNetCarDiscount: number`. The PDF template (Task 3) relies on these names.

- [ ] **Step 1: Import the helper**

In `apps/api/src/modules/reports/reports.service.ts`, extend the existing import (line 13):

```ts
import { buildSalespersonBreakdown, computeSaleMoney } from './sales-summary.helpers';
```

- [ ] **Step 2: Replace the inline netProfit block with the helper**

The `discountAmount` value is currently computed only inside the returned object (lines 769–772). Compute it as a local first, then call the helper. Replace the existing block (lines ~742–749):

```ts
    const totalCostWithInterest = totalCost + accumulatedInterest;
    const financeCommission = toNumber(sale.financeCommission) || 0;
    const salesCommission = toNumber(sale.salesCommission) || 0;
    const salesExpense = toNumber(sale.salesExpense) || 0;
    // Spec: netProfit = gross profit + finance commission − staff commission − sales expense.
    // Buyer-charged fees are pass-through and excluded.
    const netProfit =
      sellingPrice - totalCostWithInterest + financeCommission - salesCommission - salesExpense;
    const interestCost = Math.round(accumulatedInterest * 100) / 100;
```

with:

```ts
    const totalCostWithInterest = totalCost + accumulatedInterest;
    const financeCommission = toNumber(sale.financeCommission) || 0;
    const salesCommission = toNumber(sale.salesCommission) || 0;
    const salesExpense = toNumber(sale.salesExpense) || 0;
    const discountAmount =
      sale.carDiscount != null ? toNumber(sale.carDiscount) : toNumber(sale.discountSnapshot) || 0;
    // Per-car campaign subsidy folds into net profit (brand reimbursement) and
    // offsets the car discount for display. See computeSaleMoney + B5 spec.
    const { campaignSubsidy, netCarDiscount, netProfit } = computeSaleMoney({
      sellingPrice,
      totalCostWithInterest,
      carDiscount: discountAmount,
      campaignSubsidy: toNumber(sale.campaignSubsidySnapshot),
      financeCommission,
      salesCommission,
      salesExpense,
    });
    const interestCost = Math.round(accumulatedInterest * 100) / 100;
```

- [ ] **Step 3: Use the local `discountAmount` and add the new fields in the returned row**

In the returned object, replace the inline `discountAmount` expression (lines 769–772):

```ts
      discountAmount:
        sale.carDiscount != null
          ? toNumber(sale.carDiscount)
          : toNumber(sale.discountSnapshot) || 0,
```

with the local plus the two new fields:

```ts
      discountAmount,
      campaignSubsidy,
      netCarDiscount,
```

Leave the existing `netProfit: Math.round(netProfit * 100) / 100,` line as-is — it now reflects the subsidy automatically.

- [ ] **Step 4: Add footer totals**

After the existing `const totalNetProfit = sumField('netProfit');` line (near line 830), add:

```ts
  const totalCampaignSubsidy = sumField('campaignSubsidy');
  const totalNetCarDiscount = sumField('netCarDiscount');
```

Then in the `return { ... summary: { ... } }` block, alongside `totalCarDiscount` (near line 945), add:

```ts
      totalCampaignSubsidy,
      totalNetCarDiscount,
```

- [ ] **Step 5: Verify the API test suite still passes**

Run: `cd apps/api && bun test`
Expected: PASS (no behavior regressions; the report function is exercised by existing tests + the new helper tests).

> Note: a full `tsc --noEmit` on `apps/api` OOMs (known caveat) — rely on `bun test` plus careful editing here. The edits are local and mechanical.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/reports/reports.service.ts
git commit -m "feat(reports): emit campaign subsidy + net car-discount per sale and in totals"
```

---

## Task 3: Render the subsidy column, subline, and footer in the PDF

**Files:**
- Modify: `apps/api/src/modules/pdf/templates/sales-summary-report.hbs`

**Interfaces:**
- Consumes: per-row `campaignSubsidy`, `netCarDiscount`, `discountAmount`; `summary.totalCampaignSubsidy`, `summary.totalNetCarDiscount`, `summary.totalCarDiscount`. Built-in `{{#if}}` (0 is falsy) and existing `formatInt` helper — no new helper needed.

- [ ] **Step 1: Widen the colgroup for one extra column (still sums to 100%)**

Replace the `<colgroup>` (line 81) with 22 cols. The new `เงินสนับสนุน` col (4%) sits right after `ส่วนลดตัวรถ` (bumped 3→4 to hold its subline); 5% is reclaimed from ชื่อ-สกุล (8→7), เลขเครื่อง (7→6), ราคารถ (6→5), ต้นทุน (6→5), กำไรสุทธิ (6→5):

```html
    <colgroup>
      <col style="width: 3%"><col style="width: 7%"><col style="width: 6%"><col style="width: 5%"><col style="width: 4%"><col style="width: 4%"><col style="width: 3%"><col style="width: 5%"><col style="width: 3%"><col style="width: 5%"><col style="width: 5%"><col style="width: 5%"><col style="width: 5%"><col style="width: 6%"><col style="width: 5%"><col style="width: 5%"><col style="width: 5%"><col style="width: 5%"><col style="width: 3%"><col style="width: 3%"><col style="width: 3%"><col style="width: 5%">
    </colgroup>
```

- [ ] **Step 2: Add the header cell**

In the `<tr class="header-row">`, immediately after the `ส่วนลด<br>ตัวรถ` `<th>` (line 89), add:

```html
        <th rowspan="2" style="width: 4%">เงินสนับสนุน</th>
```

(The `sub-header-row` is unaffected — the new column is a `rowspan="2"` header like its neighbours.)

- [ ] **Step 3: Add the subline to the car-discount cell + the new subsidy cell**

In the `{{#each sales}}` body row, replace the car-discount cell (line 127):

```html
        <td class="text-right">{{formatInt discountAmount}}</td>
```

with the discount cell (now carrying a conditional net subline) followed by the new subsidy cell:

```html
        <td class="text-right">
          {{formatInt discountAmount}}
          {{#if campaignSubsidy}}<br><span style="color: #888; font-size: 7px;">สุทธิ {{formatInt netCarDiscount}}</span>{{/if}}
        </td>
        <td class="text-right">{{formatInt campaignSubsidy}}</td>
```

- [ ] **Step 4: Add the footer total cells**

In the totals row, replace the car-discount footer cell (line 149):

```html
        <td class="text-right">{{formatInt summary.totalCarDiscount}}</td>
```

with the discount total (plus its net subline) and the new subsidy total cell:

```html
        <td class="text-right">
          {{formatInt summary.totalCarDiscount}}
          {{#if summary.totalCampaignSubsidy}}<br><span style="color: #888; font-size: 7px;">สุทธิ {{formatInt summary.totalNetCarDiscount}}</span>{{/if}}
        </td>
        <td class="text-right">{{formatInt summary.totalCampaignSubsidy}}</td>
```

(The footer's leading `<td colspan="3">` plus the cells now total 22 columns, matching the body. `summary.totalNetProfit` already includes the subsidy.)

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/pdf/templates/sales-summary-report.hbs
git commit -m "feat(reports): subsidy column + net car-discount subline in sales PDF"
```

---

## Task 4: Visual verification of the rendered PDF

**Files:** none (verification only).

- [ ] **Step 1: Bring up a local DB + API**

Per the local smoke-test note: `orb start`, point `DATABASE_URL` at the OrbStack `car-stock-db` (postgres/postgres/car_stock), run the API from source with `PDF_ASSETS_DIR` set, and mint an ADMIN JWT.

- [ ] **Step 2: Fetch the sales-summary PDF for a date range containing a campaign sale**

Call `GET /api/reports/sales-summary/pdf?startDate=...&endDate=...` with the ADMIN bearer token; save to a file (e.g. `scratchpad/b5-sales-summary.pdf`).

- [ ] **Step 3: Read the PDF and confirm**

Read the PDF and verify:
- The `เงินสนับสนุน` column appears right after `ส่วนลดตัวรถ`, with the snapshot value.
- A muted `สุทธิ {net}` subline shows **only** on subsidised sales (not on non-campaign rows).
- The footer shows the subsidy total and the net-discount subline.
- `กำไรสุทธิ` for a subsidised sale is higher by exactly the subsidy.
- No right-edge clipping; the table stays within the A4-landscape page.

> If the DB is unreachable (common), record this step as blocked-pending and proceed; the helper unit tests already lock the math.

- [ ] **Step 4 (if anything renders wrong): iterate on Task 3 widths/markup, re-render, re-commit.**

---

## Self-Review

**Spec coverage:**
- Subsidy column → Task 3 Steps 2–3. ✓
- Net car-discount subline (per-row + footer) → Task 3 Steps 3–4. ✓
- Subsidy folds into net profit → Task 1 helper + Task 2 wiring. ✓
- Footer totals (subsidy + net discount) → Task 2 Step 4 + Task 3 Step 4. ✓
- Null snapshot → 0; negative net discount → Task 1 Steps 1/3 (tests) + helper. ✓
- Out-of-scope (Excel, on-screen, gross profit, shared types) → untouched. ✓
- A4 landscape preserved → Global Constraints + Task 3 colgroup sums to 100%. ✓

**Placeholder scan:** No TBD/TODO; every code step shows full code. ✓

**Type consistency:** `computeSaleMoney` / `SaleMoneyInput` / `SaleMoneyResult` and field names (`campaignSubsidy`, `netCarDiscount`, `totalCampaignSubsidy`, `totalNetCarDiscount`) are used identically across Tasks 1–3. ✓
