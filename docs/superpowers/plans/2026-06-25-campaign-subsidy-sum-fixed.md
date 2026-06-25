# Campaign Subsidy — Sum + Fixed Formulas → Sale Snapshot — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make editable campaign formulas compute an independent per-car subsidy **sum** (plus a `FIXED` flat-amount row), snapshot that total onto each Sale, and show it on the sales page.

**Architecture:** Add pure `formulaSubsidyAmount` / `sumCampaignSubsidies` to `@car-stock/shared/formulas` (single source of truth for API + web). `sales.service` computes the snapshot on create/update from `stock.baseCost` + `vehicleModel.price` and stores it in a new `Sale.campaignSubsidySnapshot` column. The existing chain engine (`applyLoadedFormulas`) and the brand-claim report are **untouched**.

**Tech Stack:** Bun (`bun test`), Prisma + PostgreSQL (ElysiaJS API), React 19 + Tailwind v4 (web), Biome, `@car-stock/shared` workspace package.

## Global Constraints

- **Keep the claim report + chain engine untouched.** Do not modify `applyLoadedFormulas` math or `computeCampaignSubsidies`. Existing tests must stay green.
- **MSRP ≡ `SELLING_PRICE`.** No new price-target enum, no `÷1.07`.
- **Snapshot bases:** `cost = stock.baseCost`, `selling = vehicleModel.price` (list price, not negotiated).
- **Rounding:** each row rounded to 2dp, sum rounded to 2dp.
- **Biome style:** single quotes, semicolons, 2-space indent, 100-char width.
- **UI copy is Thai.** Tests run with `bun test <path>`.
- **Branch first:** all work on `feat/campaign-subsidy-sum`. Commit trailer: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
- **DB may be down** (remote often unreachable). Schema + `db:generate` now; `db:migrate` applies when a DB is reachable (see `reference_local_db_smoke_test`).

---

### Task 0: Branch

- [ ] **Step 1: Create the feature branch**

Run:
```bash
git checkout -b feat/campaign-subsidy-sum
```
Expected: `Switched to a new branch 'feat/campaign-subsidy-sum'` (starts from `main`, which already has the design doc commit `9b76984`).

---

### Task 1: Shared subsidy math (`FIXED` + sum)

**Files:**
- Modify: `packages/shared/src/formulas/index.ts`
- Test: `packages/shared/src/formulas/index.test.ts` (exists — append)

**Interfaces:**
- Produces: `type FormulaOperator` gains `'FIXED'`; `formulaSubsidyAmount(operator, value, priceTarget, bases)`; `sumCampaignSubsidies(formulas, bases)` — from `@car-stock/shared/formulas`.

- [ ] **Step 1: Write the failing tests**

Append to `packages/shared/src/formulas/index.test.ts`:
```ts
import { formulaSubsidyAmount, sumCampaignSubsidies } from './index';

describe('formulaSubsidyAmount', () => {
  const bases = { cost: 500_000, selling: 700_000 };
  test('PERCENT is % of the chosen base (cost)', () =>
    expect(formulaSubsidyAmount('PERCENT', 1, 'COST_PRICE', bases)).toBe(5_000));
  test('PERCENT_SUBTRACT is also magnitude % of base (selling)', () =>
    expect(formulaSubsidyAmount('PERCENT_SUBTRACT', 2, 'SELLING_PRICE', bases)).toBe(14_000));
  test('FIXED is the flat value, base-independent', () =>
    expect(formulaSubsidyAmount('FIXED', 20_000, 'COST_PRICE', bases)).toBe(20_000));
  test('ADD/SUBTRACT are flat values too', () => {
    expect(formulaSubsidyAmount('ADD', 8_000, 'COST_PRICE', bases)).toBe(8_000);
    expect(formulaSubsidyAmount('SUBTRACT', 8_000, 'COST_PRICE', bases)).toBe(8_000);
  });
  test('MULTIPLY contributes nothing to a subsidy', () =>
    expect(formulaSubsidyAmount('MULTIPLY', 1.5, 'COST_PRICE', bases)).toBe(0));
});

describe('sumCampaignSubsidies', () => {
  test('sums independent rows: 1% + 2% of cost + FIXED 20,000 = 35,000', () => {
    const total = sumCampaignSubsidies(
      [
        { operator: 'PERCENT', value: 1, priceTarget: 'COST_PRICE' },
        { operator: 'PERCENT', value: 2, priceTarget: 'COST_PRICE' },
        { operator: 'FIXED', value: 20_000, priceTarget: 'COST_PRICE' },
      ],
      { cost: 500_000, selling: 700_000 }
    );
    expect(total).toBe(35_000);
  });
  test('empty list is 0', () =>
    expect(sumCampaignSubsidies([], { cost: 1, selling: 1 })).toBe(0));
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bun test packages/shared/src/formulas/index.test.ts`
Expected: FAIL — `formulaSubsidyAmount`/`sumCampaignSubsidies` are not exported.

- [ ] **Step 3: Implement**

In `packages/shared/src/formulas/index.ts`, change the first line to add `FIXED`:
```ts
export type FormulaOperator =
  | 'ADD'
  | 'SUBTRACT'
  | 'MULTIPLY'
  | 'PERCENT'
  | 'PERCENT_SUBTRACT'
  | 'FIXED';
```
Then append at the end of the file:
```ts
const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Per-row campaign SUBSIDY amount (a positive per-car amount), used by the
 * sale snapshot + campaign-detail total. Distinct from applyFormulaStep:
 * here rows do NOT chain — each is an independent amount that callers sum.
 *  - PERCENT / PERCENT_SUBTRACT → magnitude % of the chosen base
 *  - FIXED / ADD / SUBTRACT     → the flat value (base-independent)
 *  - MULTIPLY                   → 0 (not meaningful as a subsidy)
 */
export function formulaSubsidyAmount(
  operator: FormulaOperator,
  value: number,
  priceTarget: FormulaPriceTarget,
  bases: { cost: number; selling: number }
): number {
  const v = Number.isFinite(value) ? value : 0;
  switch (operator) {
    case 'PERCENT':
    case 'PERCENT_SUBTRACT': {
      const base = priceTarget === 'COST_PRICE' ? bases.cost : bases.selling;
      return round2((base * v) / 100);
    }
    case 'FIXED':
    case 'ADD':
    case 'SUBTRACT':
      return round2(v);
    default:
      return 0; // MULTIPLY and any future operator contribute nothing
  }
}

/** Sum of every row's subsidy amount for one vehicle model. */
export function sumCampaignSubsidies(
  formulas: Array<{ operator: FormulaOperator; value: number; priceTarget: FormulaPriceTarget }>,
  bases: { cost: number; selling: number }
): number {
  return round2(
    formulas.reduce(
      (sum, f) => sum + formulaSubsidyAmount(f.operator, f.value, f.priceTarget, bases),
      0
    )
  );
}
```
(`applyFormulaStep` keeps its `default: return baseValue`, so a `FIXED` row is a harmless no-op in the chain/claim path.)

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun test packages/shared/src/formulas/index.test.ts`
Expected: PASS — all existing + new tests (the original 5 `applyFormulaStep` tests stay green).

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/formulas/index.ts packages/shared/src/formulas/index.test.ts
git commit -m "feat(shared): per-car campaign subsidy amount + sum (incl FIXED rows)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Prisma schema — `FIXED` operator + `Sale.campaignSubsidySnapshot`

**Files:**
- Modify: `apps/api/prisma/schema.prisma` (`enum FormulaOperator` ~line 557; `model Sale` ~line 225)

**Interfaces:**
- Produces: Prisma `FormulaOperator.FIXED`; `Sale.campaignSubsidySnapshot: Decimal?`.

- [ ] **Step 1: Add the `FIXED` enum value**

In `enum FormulaOperator` (after `PERCENT_SUBTRACT`):
```prisma
  PERCENT          // + n% of base
  PERCENT_SUBTRACT // - n% of base
  FIXED            // flat baht/car subsidy (no base) — campaign subsidy sum only
```

- [ ] **Step 2: Add the snapshot column to `Sale`**

In `model Sale`, immediately after the `discountSnapshot` line (~226):
```prisma
  discountSnapshot       Decimal?      @map("discount_snapshot") @db.Decimal(15, 2)
  // Per-car campaign subsidy total, frozen at sale create/update (sum of the
  // campaign's editable formulas for this model). Null when no campaign.
  campaignSubsidySnapshot Decimal?     @map("campaign_subsidy_snapshot") @db.Decimal(15, 2)
```

- [ ] **Step 3: Regenerate the Prisma client**

Run: `bun run db:generate`
Expected: exit 0; `@prisma/client` now types `FormulaOperator.FIXED` and `Sale.campaignSubsidySnapshot`.

- [ ] **Step 4: Create the migration (best-effort; skip body if DB unreachable)**

If a database is reachable:
Run: `bun run db:migrate -- --name campaign_subsidy_snapshot_and_fixed_operator`
Expected: a new folder under `apps/api/prisma/migrations/` and the schema applied.
If the DB is down (`Can't reach database server`), skip the apply — the generated client is enough to build/test; record that the migration must be run when a DB is up.

- [ ] **Step 5: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations 2>/dev/null; git add apps/api/prisma/schema.prisma
git commit -m "feat(db): FIXED formula operator + Sale.campaignSubsidySnapshot

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: API — compute + store the snapshot on the sale

**Files:**
- Modify: `apps/api/src/modules/campaigns/campaign-formulas.service.ts` (add a DB helper; import the shared sum)
- Modify: `apps/api/src/modules/sales/sales.service.ts` (`serializeSale` ~line 23; `createSale` ~line 402/420; `updateSale` ~line 580)
- Test: `apps/api/src/__tests__/campaign-subsidy-snapshot.test.ts` (new — pure helper boundary)

**Interfaces:**
- Consumes: `sumCampaignSubsidies` (Task 1).
- Produces: `campaignFormulasService.computeSaleSubsidySnapshot({ campaignId, vehicleModelId, stockId }): Promise<number | null>`; `serializeSale` includes `campaignSubsidySnapshot`.

- [ ] **Step 1: Write the failing test for the pure aggregation the helper uses**

Create `apps/api/src/__tests__/campaign-subsidy-snapshot.test.ts`:
```ts
import { describe, expect, test } from 'bun:test';
import { sumCampaignSubsidies } from '@car-stock/shared/formulas';

// Ground truth: the helper resolves cost = stock.baseCost, selling = vm.price,
// then sums. This locks the contract the DB helper must honor.
describe('sale campaign subsidy snapshot math', () => {
  test('marketing 1% + retail 2% of cost 500k + ส่วนรถ FIXED 20k = 35,000', () => {
    const formulas = [
      { operator: 'PERCENT' as const, value: 1, priceTarget: 'COST_PRICE' as const },
      { operator: 'PERCENT' as const, value: 2, priceTarget: 'COST_PRICE' as const },
      { operator: 'FIXED' as const, value: 20_000, priceTarget: 'COST_PRICE' as const },
    ];
    expect(sumCampaignSubsidies(formulas, { cost: 500_000, selling: 700_000 })).toBe(35_000);
  });
});
```

- [ ] **Step 2: Run it to verify it passes immediately (boundary check, not the bug)**

Run: `bun test apps/api/src/__tests__/campaign-subsidy-snapshot.test.ts`
Expected: PASS (Task 1 already implements the math). This test documents the snapshot contract; the DB-fetch wiring below is covered by the local-DB smoke test in Task 3 Step 7.

- [ ] **Step 3: Add the DB helper**

At the top of `apps/api/src/modules/campaigns/campaign-formulas.service.ts`, extend the shared import:
```ts
import { applyFormulaStep, sumCampaignSubsidies } from '@car-stock/shared/formulas';
```
Add this method to the `CampaignFormulasService` class (e.g. after `applyFormulas`):
```ts
  /**
   * Per-car campaign subsidy total for a sale, or null when there is no
   * campaign / model. cost = stock.baseCost, selling = vehicleModel.price.
   */
  async computeSaleSubsidySnapshot(params: {
    campaignId: string | null | undefined;
    vehicleModelId: string | null | undefined;
    stockId: string | null | undefined;
  }): Promise<number | null> {
    const { campaignId } = params;
    if (!campaignId) return null;

    let vehicleModelId = params.vehicleModelId ?? null;
    let cost = 0;
    if (params.stockId) {
      const stock = await db.stock.findUnique({
        where: { id: params.stockId },
        select: { baseCost: true, vehicleModelId: true },
      });
      cost = stock ? Number(stock.baseCost) : 0;
      vehicleModelId = vehicleModelId ?? stock?.vehicleModelId ?? null;
    }
    if (!vehicleModelId) return null;

    const [formulas, vm] = await Promise.all([
      this.getFormulas(campaignId, vehicleModelId),
      db.vehicleModel.findUnique({ where: { id: vehicleModelId }, select: { price: true } }),
    ]);
    if (formulas.length === 0) return 0;

    const selling = vm ? Number(vm.price) : 0;
    return sumCampaignSubsidies(
      formulas.map((f) => ({
        operator: f.operator,
        value: Number(f.value),
        priceTarget: f.priceTarget,
      })),
      { cost, selling }
    );
  }
```

- [ ] **Step 4: Serialize the new field**

In `apps/api/src/modules/sales/sales.service.ts` `serializeSale`, add after the `discountSnapshot` line (~42):
```ts
    discountSnapshot: toNumberOrNull(sale.discountSnapshot),
    campaignSubsidySnapshot: toNumberOrNull(sale.campaignSubsidySnapshot),
```

- [ ] **Step 5: Store it on create**

In `createSale`, import is already present for `campaignFormulasService`? If not, add at top:
```ts
import { campaignFormulasService } from '../campaigns/campaign-formulas.service';
```
After the auto-tag block ends (~line 402, before `const saleNumber = ...`):
```ts
    const campaignSubsidySnapshot = await campaignFormulasService.computeSaleSubsidySnapshot({
      campaignId: validated.campaignId,
      vehicleModelId: validated.vehicleModelId ?? null,
      stockId: validated.stockId ?? null,
    });
```
Then in `tx.sale.create({ data: { ...validated, ... } })`, add the field:
```ts
        data: {
          ...validated,
          saleNumber,
          remainingAmount,
          campaignSubsidySnapshot,
          createdById: currentUser.id,
        },
```

- [ ] **Step 6: Re-snapshot on update**

In `updateSale`, just before `const sale = await db.sale.update({` (~line 580), recompute using the post-update values (fall back to the existing sale for fields not being changed):
```ts
    const campaignSubsidySnapshot = await campaignFormulasService.computeSaleSubsidySnapshot({
      campaignId: validated.campaignId ?? existingSale.campaignId,
      vehicleModelId: validated.vehicleModelId ?? existingSale.vehicleModelId,
      stockId: validated.stockId ?? existingSale.stockId,
    });
```
Add `campaignSubsidySnapshot` to the `db.sale.update` `data` object.
(If `existingSale` is named differently in scope, use the already-fetched current sale variable; it is loaded at the top of `updateSale`.)

- [ ] **Step 7: Verify — types, existing tests, smoke**

Run: `bun test apps/api/src/__tests__/campaign-subsidy-snapshot.test.ts apps/api/src/__tests__/campaign-claim-report.test.ts apps/api/src/__tests__/campaign-formula-percent-subtract.test.ts`
Expected: PASS (claim report + chain untouched).
Type-check the two changed files via LSP diagnostics (full `tsc` OOMs per `reference_api_tsc_oom`): expect no new errors in `sales.service.ts` / `campaign-formulas.service.ts`.
Smoke (when local DB up, per `reference_local_db_smoke_test`): create a campaign with rows `cost 1%`, `cost 2%`, `FIXED 20000` on a model; create a sale on that model+stock; GET the sale → `campaignSubsidySnapshot` ≈ `0.03×baseCost + 20000`.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/modules/campaigns/campaign-formulas.service.ts apps/api/src/modules/sales/sales.service.ts apps/api/src/__tests__/campaign-subsidy-snapshot.test.ts
git commit -m "feat(sales): snapshot per-car campaign subsidy total onto the sale

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Web — `FIXED` in the formula builder + per-car total

**Files:**
- Modify: `apps/web/src/components/campaigns/formulaText.ts`
- Modify: `apps/web/src/components/campaigns/FormulaManager.tsx`
- Modify: `apps/web/src/services/campaign.service.ts` (web `FormulaOperator` type — add `'FIXED'`)
- Test: `apps/web/src/components/campaigns/formulaText.test.ts` (exists — append)

**Interfaces:**
- Consumes: `sumCampaignSubsidies` (Task 1); `VehicleModelSummary.standardCost`/`price`.
- Produces: `OPERATOR_OPTIONS` includes `FIXED`; `describeFormula` handles `FIXED`.

- [ ] **Step 1: Write the failing test**

Append to `apps/web/src/components/campaigns/formulaText.test.ts`:
```ts
test('FIXED is offered and described without a base', () => {
  expect(OPERATOR_OPTIONS.map((o) => o.operator)).toContain('FIXED');
  expect(operatorUnitSuffix('FIXED')).toBe('฿');
  expect(describeFormula('FIXED', 20000, 'COST_PRICE')).toBe('จำนวนเงินตายตัว 20,000 บาท');
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `bun test apps/web/src/components/campaigns/formulaText.test.ts`
Expected: FAIL — `FIXED` not in options / not described.

- [ ] **Step 3: Implement in `formulaText.ts`**

Add to `OPERATOR_OPTIONS` (after the `ADD` entry):
```ts
  { operator: 'ADD', label: 'เพิ่มเป็นบาท (฿)' },
  { operator: 'FIXED', label: 'จำนวนเงินตายตัว (฿)' },
```
`operatorUnitSuffix` already returns `'฿'` for non-`%`/`×` operators, so `FIXED` → `'฿'` with no change.
In `describeFormula`, add a case before `default`:
```ts
    case 'FIXED':
      return `จำนวนเงินตายตัว ${n.toLocaleString('th-TH')} บาท`;
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun test apps/web/src/components/campaigns/formulaText.test.ts`
Expected: PASS.

- [ ] **Step 5: Hide the base dropdown for FIXED + add the per-car total in `FormulaManager.tsx`**

Add the shared import near the other imports:
```ts
import { applyFormulaStep, sumCampaignSubsidies } from '@car-stock/shared/formulas';
```
In `FormulaForm`, wrap the price-target (`เอา [ราคา] มา`) `<select>` so it only renders when `formData.operator !== 'FIXED'` (a FIXED row has no base). When hidden, the sentence reads "ตั้งเป็นจำนวนเงิน [value] ฿".
Below the saved-rows list (where `formulas` are mapped), add a total line:
```tsx
{formulas.length > 0 && (
  <div className="mt-2 flex items-baseline justify-between border-t border-gray-200 pt-2">
    <span className="text-sm text-gray-600">ยอดรวมแคมเปญต่อคัน</span>
    <span className="text-lg font-bold text-purple-700">
      {sumCampaignSubsidies(
        formulas.map((f) => ({ operator: f.operator, value: f.value, priceTarget: f.priceTarget })),
        { cost: Number(vehicleModel.standardCost) || 0, selling: Number(vehicleModel.price) || 0 }
      ).toLocaleString('th-TH', { maximumFractionDigits: 2 })}{' '}
      บาท
    </span>
  </div>
)}
```

- [ ] **Step 6: Add `'FIXED'` to the web `FormulaOperator` type**

In `apps/web/src/services/campaign.service.ts`, find `FormulaOperator` (a string-union type) and add `| 'FIXED'`. If the type is imported from `@car-stock/shared/formulas`, this is already done by Task 1 — verify and skip.

- [ ] **Step 7: Verify typecheck**

Run: `cd apps/web && bunx tsc -b`
Expected: exit 0.

- [ ] **Step 8: Visual check (local DB)**

Open a campaign detail; add a `FIXED` row → base dropdown disappears, row reads "จำนวนเงินตายตัว 20,000 บาท"; the "ยอดรวมแคมเปญต่อคัน" line sums all rows. Screenshot.

- [ ] **Step 9: Commit**

```bash
git add apps/web/src/components/campaigns/formulaText.ts apps/web/src/components/campaigns/formulaText.test.ts apps/web/src/components/campaigns/FormulaManager.tsx apps/web/src/services/campaign.service.ts
git commit -m "feat(campaigns): FIXED flat-amount formula row + per-car subsidy total

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Web — show the snapshot on the sales page

**Files:**
- Modify: `apps/web/src/services/sale.service.ts` (sale type — add `campaignSubsidySnapshot`)
- Modify: the sale detail page component that renders campaign/financial info (e.g. `apps/web/src/pages/sales/SaleDetailPage.tsx` — confirm exact path with a grep for `campaignId` / `carDiscount` in `apps/web/src/pages/sales`)

**Interfaces:**
- Consumes: `campaignSubsidySnapshot?: string | number` on the sale payload (Task 3).

- [ ] **Step 1: Add the field to the web sale type**

In `apps/web/src/services/sale.service.ts`, in the `Sale` interface, after `carDiscount`:
```ts
  carDiscount?: string | number | null;
  campaignSubsidySnapshot?: string | number | null;
```

- [ ] **Step 2: Locate the render site**

Run: `grep -rn "carDiscount\|campaignId\|แคมเปญ" apps/web/src/pages/sales`
Pick the sale **detail** page section that already shows campaign / discount info.

- [ ] **Step 3: Render the snapshot (read-only)**

Where campaign info is shown, add (guarded so it only appears when present and > 0):
```tsx
{sale.campaignSubsidySnapshot != null && Number(sale.campaignSubsidySnapshot) > 0 && (
  <div className="flex justify-between text-sm">
    <span className="text-gray-600">แคมเปญคันนี้ (ต่อคัน)</span>
    <span className="font-semibold text-purple-700">
      {Number(sale.campaignSubsidySnapshot).toLocaleString('th-TH', { maximumFractionDigits: 2 })} บาท
    </span>
  </div>
)}
```

- [ ] **Step 4: Verify typecheck**

Run: `cd apps/web && bunx tsc -b`
Expected: exit 0.

- [ ] **Step 5: Visual check (local DB)**

Open a sale whose campaign+model has formulas → the "แคมเปญคันนี้ (ต่อคัน)" line shows the snapshot value matching the campaign-detail total. Screenshot.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/services/sale.service.ts apps/web/src/pages/sales
git commit -m "feat(sales): show per-car campaign subsidy on the sale detail page

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage:**
- Schema `FIXED` + `Sale.campaignSubsidySnapshot` → Task 2. ✓
- Pure `formulaSubsidyAmount` / `sumCampaignSubsidies` (sum, not chain) → Task 1. ✓
- operator→amount mapping (PERCENT→base×%, FIXED/ADD/SUBTRACT→value, MULTIPLY→0) → Task 1 tests + impl. ✓
- Snapshot on create/update from `stock.baseCost` + `vehicleModel.price` → Task 3. ✓
- Claim report + chain untouched → no task modifies them; guarded by re-running their tests (Task 3 Step 7). ✓
- FIXED in builder, base hidden, per-car total on campaign detail → Task 4. ✓
- Snapshot shown on sales page → Task 5. ✓
- MSRP ≡ SELLING_PRICE (no new base) → honored (no enum change). ✓
- B5 (sales-report offset) intentionally out of scope → not planned. ✓

**Placeholder scan:** Task 5 Step 2 requires a grep to confirm the exact detail-page path (the only unresolved file); every code step shows real code. No TBD/TODO. ✓

**Type consistency:** `formulaSubsidyAmount(operator, value, priceTarget, bases)` and `sumCampaignSubsidies(formulas, bases)` used identically in Tasks 1, 3, 4. `computeSaleSubsidySnapshot({ campaignId, vehicleModelId, stockId })` defined in Task 3 Step 3, called in Steps 5–6. `campaignSubsidySnapshot` field name identical across schema (Task 2), serializer + writes (Task 3), and web types (Task 5). ✓
