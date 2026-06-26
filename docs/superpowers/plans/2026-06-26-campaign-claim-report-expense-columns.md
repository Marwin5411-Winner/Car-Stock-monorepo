# Monthly Claim Report → Editor-Driven Expense Columns Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the monthly campaign claim report's columns the per-model expense lines defined in the campaign editor (dynamic, union-by-name) instead of the hardcoded brand-bucket form.

**Architecture:** The shared builder (`buildCampaignClaimReport`) becomes the single source of column alignment: it emits `expenseColumns: string[]` once and gives each row a `cells: (number|null)[]` aligned to that array, computed via the shared `formulaSubsidyAmount`. PDF, web, and Excel all iterate the same two parallel arrays. The hardcoded `computeCampaignSubsidies`/tier path is removed from the report (function retained + deprecated).

**Tech Stack:** Bun (runtime, test runner), TypeScript, Zod (shared schemas), ElysiaJS + Handlebars PDF (api), React 19 + TanStack Query (web), Biome.

## Global Constraints

- **No DB/schema/Prisma migration.** Only the report contract + builder + renderers change.
- **Report is editor-driven:** columns = union of distinct expense-line **names** across the month/brand's sales, in **first-appearance order** (sales sorted by `soldDate ?? completedDate`; within a sale, formulas by `sortOrder`).
- **Per-cell amount** = `formulaSubsidyAmount(operator, Number(value), priceTarget, { cost: stock?baseCost:0, selling: vm.price })`. A model lacking a column → `null` cell.
- **Filters:** year + month + brand only. **Remove** `tier`/`retailTargetTier` and `constructionCost` everywhere.
- **Keep:** vehicle-info columns + `ราคาขาย`, the ผู้จัดทำ/ผู้อนุมัติ sign-off, ยอดเบิกรวมทั้งสิ้น (grand total). **Drop:** ส่วนลดการขาย, ค่าก่อสร้าง, STOCK LEVEL/After Sales/MARKETING/เป้าขาย columns.
- **Invariant:** `Σ summary.columnTotals === summary.grandTotal === Σ rows[].total`.
- **`computeCampaignSubsidies` / `DEFAULT_SUBSIDY_RATES` / `CampaignSubsidySchema`** are retained but removed from the claim path; mark deprecated. Their standalone unit test stays green.
- **Decimal coercion:** the builder coerces `f.value` with `toNum(...)` (server-side) so `formulaSubsidyAmount`'s `Number.isFinite` guard sees real numbers.
- **PDF:** A4 landscape, title `รายงานเบิกแคมเปญเงินส่งเสริมการขายประจำเดือน {{monthLabel}}` unchanged.
- **Biome:** single quotes, semicolons, 2-space indent, 100-char width.
- **Branch:** `feature/campaign-claim-report-expense-columns` (spec already committed as its first commit).

## File Structure

| File | Change |
|---|---|
| `packages/shared/src/schemas/index.ts` | Reshape `CampaignClaimRowSchema` + `CampaignClaimReportResponseSchema` (lines 692–731). Keep `CampaignSubsidySchema` (deprecate comment). |
| `apps/api/src/modules/reports/campaign-claim.helpers.ts` | Rework `buildCampaignClaimReport` + `ClaimRow`; deprecate `computeCampaignSubsidies`/`DEFAULT_SUBSIDY_RATES`. |
| `apps/api/src/__tests__/campaign-claim-report.test.ts` | Rewrite the `buildCampaignClaimReport` describe block; keep the `computeCampaignSubsidies` block. |
| `apps/api/src/modules/reports/reports.service.ts:1678` | `getCampaignClaimReport`: drop `retailTargetTier`; return new shape. |
| `apps/api/src/modules/reports/reports.controller.ts:778` | JSON `/campaign-claims`: drop `tier`. |
| `apps/api/src/modules/pdf/types.ts:625` | `CampaignClaimReportData`: new shape. |
| `apps/api/src/modules/pdf/pdf.controller.ts:1726` | PDF `/campaign-claims`: drop tier/construction; pass new shape. |
| `apps/api/src/modules/pdf/templates/campaign-claim-monthly.hbs` | Rewrite table to dynamic columns. |
| `apps/web/src/services/report.service.ts:285` | Drop `tier`/`constructionCost` from the two claim methods. |
| `apps/web/src/pages/reports/CampaignClaimReportPage.tsx` | Dynamic columns; remove tier/construction; Excel dynamic keys. |

---

## Task 1: Reshape the shared claim contract (schemas)

**Files:**
- Modify: `packages/shared/src/schemas/index.ts` (lines 682–731)

**Interfaces:**
- Produces (consumed by all later tasks): `CampaignClaimRow` = `{ no, saleId, saleNumber, customerName, modelName, engineNumber, vin, financeProvider, saleDate: string|null, notifyDate: string|null, campaignName, salePrice, cells: (number|null)[], total }`; `CampaignClaimReportResponse` = `{ period, brand, expenseColumns: string[], rows, summary: { totalCars, columnTotals: number[], grandTotal } }`.

- [ ] **Step 1: Replace the two schemas**

In `packages/shared/src/schemas/index.ts`, replace the block from `export const CampaignClaimRowSchema = z.object({` (line 692) through the end of `CampaignClaimReportResponseSchema` (line 731) with:

```ts
export const CampaignClaimRowSchema = z.object({
  no: z.number(),
  saleId: z.string(),
  saleNumber: z.string(),
  customerName: z.string(),
  modelName: z.string(),
  engineNumber: z.string(),
  vin: z.string(),
  financeProvider: z.string(),
  saleDate: z.string().nullable(),
  notifyDate: z.string().nullable(),
  campaignName: z.string(),
  salePrice: z.number(),
  // Per-car expense amounts, aligned 1:1 to expenseColumns; null = the car's
  // model does not define that expense line.
  cells: z.array(z.number().nullable()),
  total: z.number(), // sum of this car's expense lines (ยอดเบิกต่อคัน)
});

export const CampaignClaimReportResponseSchema = z.object({
  period: z.object({
    year: z.number(),
    month: z.number(),
    startDate: z.string(),
    endDate: z.string(),
  }),
  brand: z.string(),
  // Distinct expense-line names (union across the month's sales), report columns.
  expenseColumns: z.array(z.string()),
  rows: z.array(CampaignClaimRowSchema),
  summary: z.object({
    totalCars: z.number(),
    columnTotals: z.array(z.number()), // aligned 1:1 to expenseColumns
    grandTotal: z.number(),
  }),
});
```

Leave `CampaignSubsidySchema` (lines 683–690) in place, but change its leading comment to:

```ts
// @deprecated Brand-bucket subsidy shape. No longer part of the claim report
// response (now editor-driven). Retained for the computeCampaignSubsidies unit test.
export const CampaignSubsidySchema = z.object({
```

- [ ] **Step 2: Typecheck the shared package via the web build**

Run: `cd apps/web && bunx tsc -b`
Expected: it will FAIL in `CampaignClaimReportPage.tsx` / builder consumers that still reference the removed fields — that is expected; those are fixed in later tasks. Confirm the **schema file itself** has no error by checking the error list contains only consumer files (`CampaignClaimReportPage.tsx`), not `schemas/index.ts`. (Do not commit yet if the schema file itself errors.)

- [ ] **Step 3: Commit**

```bash
git add packages/shared/src/schemas/index.ts
git commit -m "feat(shared): reshape claim report contract to dynamic expense columns

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Rework the builder + rewrite its tests (TDD)

**Files:**
- Modify: `apps/api/src/modules/reports/campaign-claim.helpers.ts` (the `ClaimRow` interface lines 115–136 and `buildCampaignClaimReport` lines 144–253)
- Test: `apps/api/src/__tests__/campaign-claim-report.test.ts`

**Interfaces:**
- Consumes: `formulaSubsidyAmount(operator, value, priceTarget, { cost, selling }): number` from `@car-stock/shared/formulas` (already imported as `sumCampaignSubsidies`; add `formulaSubsidyAmount`).
- Produces: `buildCampaignClaimReport(sales: ClaimSaleInput[]): { expenseColumns: string[]; rows: ClaimRow[]; summary: { totalCars: number; columnTotals: number[]; grandTotal: number } }` where `ClaimRow = { no, saleId, saleNumber, customerName, modelName, engineNumber, vin, financeProvider, saleDate: Date|null, notifyDate: Date|null, campaignName, salePrice, cells: (number|null)[], total }`. Note: **no `options` arg** (tier removed).

- [ ] **Step 1: Rewrite the test file's builder block**

Replace the entire `describe('buildCampaignClaimReport', () => { ... })` block in `apps/api/src/__tests__/campaign-claim-report.test.ts` (keep the imports, the `model()` helper, and the trailing `describe('computeCampaignSubsidies', ...)` block as-is) with:

```ts
type Fm = {
  id: string;
  name: string;
  operator: 'PERCENT' | 'FIXED' | 'SUBTRACT' | 'ADD' | 'MULTIPLY' | 'PERCENT_SUBTRACT';
  value: number;
  priceTarget: 'SELLING_PRICE' | 'COST_PRICE';
  sortOrder: number;
};

const saleWith = (args: {
  id: string;
  vmId: string;
  modelName: string;
  variant: string | null;
  price: number;
  baseCost: number | null; // null → no stock
  soldDate: Date;
  formulas: Fm[];
}): ClaimSaleInput => {
  const vm = model(args.vmId, args.modelName, args.variant, args.price);
  return {
    id: args.id,
    saleNumber: args.id,
    customer: { name: `cust-${args.id}` },
    financeProvider: 'KTB',
    carDiscount: 0,
    discountSnapshot: 0,
    completedDate: args.soldDate,
    vehicleModelId: args.vmId,
    vehicleModel: vm,
    stock:
      args.baseCost == null
        ? null
        : {
            vin: `VIN-${args.id}`,
            engineNumber: `ENG-${args.id}`,
            soldDate: args.soldDate,
            baseCost: args.baseCost,
            vehicleModelId: args.vmId,
            vehicleModel: vm,
          },
    campaign: {
      id: 'camp1',
      name: 'Expense campaign',
      vehicleModels: [{ vehicleModelId: args.vmId, formulas: args.formulas }],
    },
  };
};

describe('buildCampaignClaimReport (expense columns)', () => {
  // V (price 500,000): เปิดบูธ 1% sell = 5,000 ; Marketing 5% sell = 25,000
  const saleV = saleWith({
    id: 's1',
    vmId: 'vm1',
    modelName: 'V',
    variant: 'LITE',
    price: 500_000,
    baseCost: 450_000,
    soldDate: new Date('2026-05-10T07:00:00Z'),
    formulas: [
      { id: 'a', name: 'เปิดบูธ', operator: 'PERCENT', value: 1, priceTarget: 'SELLING_PRICE', sortOrder: 1 },
      { id: 'b', name: 'Marketing', operator: 'PERCENT', value: 5, priceTarget: 'SELLING_PRICE', sortOrder: 2 },
    ],
  });
  // X (price 700,000): เปิดบูธ 0.5% sell = 3,500 ; ค่าขนส่ง FIXED 3,000
  const saleX = saleWith({
    id: 's2',
    vmId: 'vm2',
    modelName: 'X',
    variant: 'COMFORT',
    price: 700_000,
    baseCost: 650_000,
    soldDate: new Date('2026-05-15T07:00:00Z'),
    formulas: [
      { id: 'c', name: 'เปิดบูธ', operator: 'PERCENT', value: 0.5, priceTarget: 'SELLING_PRICE', sortOrder: 1 },
      { id: 'd', name: 'ค่าขนส่ง', operator: 'FIXED', value: 3000, priceTarget: 'SELLING_PRICE', sortOrder: 2 },
    ],
  });

  test('expenseColumns is the union of line names in first-appearance order', () => {
    const r = buildCampaignClaimReport([saleV, saleX]);
    expect(r.expenseColumns).toEqual(['เปิดบูธ', 'Marketing', 'ค่าขนส่ง']);
  });

  test('cells align to columns; missing line → null', () => {
    const r = buildCampaignClaimReport([saleV, saleX]);
    // rows sorted by soldDate ascending: V (05-10) then X (05-15)
    expect(r.rows[0].modelName).toBe('V LITE');
    expect(r.rows[0].cells).toEqual([5_000, 25_000, null]);
    expect(r.rows[0].total).toBe(30_000);
    expect(r.rows[1].modelName).toBe('X COMFORT');
    expect(r.rows[1].cells).toEqual([3_500, null, 3_000]);
    expect(r.rows[1].total).toBe(6_500);
  });

  test('columnTotals + grandTotal, with the Σcolumns == grandTotal invariant', () => {
    const r = buildCampaignClaimReport([saleV, saleX]);
    expect(r.summary.columnTotals).toEqual([8_500, 25_000, 3_000]);
    expect(r.summary.grandTotal).toBe(36_500);
    expect(r.summary.columnTotals.reduce((a, b) => a + b, 0)).toBe(r.summary.grandTotal);
    expect(r.summary.totalCars).toBe(2);
  });

  test('no stock: a cost-based % cell resolves to 0', () => {
    const noStock = saleWith({
      id: 's3',
      vmId: 'vm1',
      modelName: 'V',
      variant: 'LITE',
      price: 500_000,
      baseCost: null,
      soldDate: new Date('2026-05-20T07:00:00Z'),
      formulas: [
        { id: 'm', name: 'Marketing', operator: 'PERCENT', value: 1, priceTarget: 'COST_PRICE', sortOrder: 1 },
        { id: 's', name: 'เปิดบูธ', operator: 'PERCENT', value: 1, priceTarget: 'SELLING_PRICE', sortOrder: 2 },
      ],
    });
    const r = buildCampaignClaimReport([noStock]);
    expect(r.expenseColumns).toEqual(['Marketing', 'เปิดบูธ']);
    expect(r.rows[0].cells).toEqual([0, 5_000]); // cost % → 0 ; selling 1% of 500,000 = 5,000
    expect(r.rows[0].total).toBe(5_000);
  });

  test('empty input → empty columns/rows and zero totals', () => {
    const r = buildCampaignClaimReport([]);
    expect(r.expenseColumns).toEqual([]);
    expect(r.rows).toEqual([]);
    expect(r.summary).toEqual({ totalCars: 0, columnTotals: [], grandTotal: 0 });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test apps/api/src/__tests__/campaign-claim-report.test.ts`
Expected: FAIL — the old `buildCampaignClaimReport` returns `modelColumns`/`subsidies`/`rows[].cells` undefined, so `expenseColumns`/`cells` assertions fail (and TS may flag the removed-field usage in the old block you just deleted is gone).

- [ ] **Step 3: Rework the builder**

In `apps/api/src/modules/reports/campaign-claim.helpers.ts`:

(a) Add `formulaSubsidyAmount` to the shared-formulas import (it currently imports `sumCampaignSubsidies`). The import line near the top becomes:

```ts
import { formulaSubsidyAmount, sumCampaignSubsidies } from '@car-stock/shared/formulas';
```

(If `sumCampaignSubsidies` is no longer referenced after this rework, drop it from the import — see step (c); Biome will flag an unused import.)

(b) Replace the `ClaimRow` interface (lines 115–136) with:

```ts
export interface ClaimRow {
  no: number;
  saleId: string;
  saleNumber: string;
  customerName: string;
  modelName: string;
  engineNumber: string;
  vin: string;
  financeProvider: string;
  saleDate: Date | null;
  notifyDate: Date | null;
  campaignName: string;
  /** ราคาขาย (MSRP incl VAT) from the vehicle model. */
  salePrice: number;
  /** Per-car expense amounts aligned 1:1 to expenseColumns; null = model lacks that line. */
  cells: Array<number | null>;
  /** Sum of this car's expense lines (ยอดเบิกต่อคัน). */
  total: number;
}
```

(c) Replace the whole `buildCampaignClaimReport` function (lines 144–253) with:

```ts
export function buildCampaignClaimReport(sales: ClaimSaleInput[]) {
  const sorted = [...sales].sort((a, b) => {
    const da = a.stock?.soldDate ?? a.completedDate;
    const db = b.stock?.soldDate ?? b.completedDate;
    return (da?.getTime() ?? 0) - (db?.getTime() ?? 0);
  });

  // Pass 1: per-sale amount map (name → baht) + the union of column names in
  // first-appearance order.
  const expenseColumns: string[] = [];
  const seen = new Set<string>();
  const perSale = sorted.map((sale) => {
    const vm = resolveModel(sale);
    const vmId = vm?.id ?? null;
    const cvm = vmId
      ? sale.campaign?.vehicleModels.find((m) => m.vehicleModelId === vmId)
      : undefined;
    const amounts = new Map<string, number>();
    if (cvm && vm) {
      const bases = {
        cost: sale.stock ? toNum(sale.stock.baseCost) : 0,
        selling: toNum(vm.price),
      };
      for (const f of cvm.formulas) {
        const amt = formulaSubsidyAmount(f.operator, toNum(f.value), f.priceTarget, bases);
        amounts.set(f.name, round2((amounts.get(f.name) ?? 0) + amt));
        if (!seen.has(f.name)) {
          seen.add(f.name);
          expenseColumns.push(f.name);
        }
      }
    }
    const total = round2([...amounts.values()].reduce((s, a) => s + a, 0));
    return { sale, vm, amounts, total };
  });

  // Pass 2: align each row's cells to the now-complete column list.
  const rows: ClaimRow[] = perSale.map(({ sale, vm, amounts, total }, idx) => ({
    no: idx + 1,
    saleId: sale.id,
    saleNumber: sale.saleNumber,
    customerName: sale.customer?.name ?? '',
    modelName: vm ? modelLabel(vm) : '',
    engineNumber: sale.stock?.engineNumber ?? '',
    vin: sale.stock?.vin ?? '',
    financeProvider: sale.financeProvider ?? '',
    saleDate: sale.stock?.soldDate ?? sale.completedDate,
    notifyDate: sale.completedDate ?? sale.stock?.soldDate ?? null,
    campaignName: sale.campaign?.name ?? '',
    salePrice: vm ? toNum(vm.price) : 0,
    cells: expenseColumns.map((name) => (amounts.has(name) ? (amounts.get(name) as number) : null)),
    total,
  }));

  const columnTotals = expenseColumns.map((_, j) =>
    round2(rows.reduce((s, r) => s + (r.cells[j] ?? 0), 0))
  );
  const grandTotal = round2(rows.reduce((s, r) => s + r.total, 0));

  return {
    expenseColumns,
    rows,
    summary: { totalCars: rows.length, columnTotals, grandTotal },
  };
}
```

(d) Mark the now-unused brand-bucket helpers deprecated. Add `@deprecated` as the first JSDoc line of `computeCampaignSubsidies` (the block starting `* Brand campaign reimbursement buckets ...`) and above `export const DEFAULT_SUBSIDY_RATES`:

```ts
/** @deprecated Brand-bucket rates — no longer used by the claim report (now editor-driven). */
export const DEFAULT_SUBSIDY_RATES: SubsidyRates = {
```

Leave `computeCampaignSubsidies`, `SubsidyRates`, `SubsidyAmounts`, `VAT_DIVISOR` defined (the standalone test still uses `computeCampaignSubsidies`). If, after the rework, `SubsidyAmounts` is referenced nowhere except `computeCampaignSubsidies`'s own signature, that is fine — leave it.

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun test apps/api/src/__tests__/campaign-claim-report.test.ts`
Expected: PASS — the new `buildCampaignClaimReport` block and the unchanged `computeCampaignSubsidies` block both green.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/reports/campaign-claim.helpers.ts apps/api/src/__tests__/campaign-claim-report.test.ts
git commit -m "feat(api): claim builder emits dynamic expense columns + aligned cells

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Wire the data services to the new shape (api)

**Files:**
- Modify: `apps/api/src/modules/reports/reports.service.ts` (`getCampaignClaimReport`, lines 1678–1756)
- Modify: `apps/api/src/modules/reports/reports.controller.ts` (JSON `/campaign-claims`, lines 778–820)

**Interfaces:**
- Consumes: `buildCampaignClaimReport(sales)` (no options) from Task 2.
- Produces: `getCampaignClaimReport({ year, month, brand })` returning `{ period, brand, expenseColumns, rows, summary }` (matches `CampaignClaimReportResponseSchema`).

- [ ] **Step 1: Update the service**

In `apps/api/src/modules/reports/reports.service.ts`, change the `getCampaignClaimReport` signature to drop `retailTargetTier`:

```ts
export async function getCampaignClaimReport(params: {
  year: number;
  month: number;
  brand: string;
}) {
  const { year, month, brand } = params;
```

Then replace the build + return (lines 1743–1755) with:

```ts
  const report = buildCampaignClaimReport(brandSales);

  return {
    period: {
      year,
      month,
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
    },
    brand,
    ...report,
  };
}
```

(The `vehicleModelSelect`, the `db.sale.findMany` with `campaign.vehicleModels.formulas`, and the `brandSales` filter are unchanged.)

- [ ] **Step 2: Update the JSON controller**

In `apps/api/src/modules/reports/reports.controller.ts`, in the `/campaign-claims` handler (lines 778–820): remove the `const tier = ...` line (800) and pass no tier:

```ts
      const result = await reportsService.getCampaignClaimReport({
        year,
        month,
        brand: query.brand,
      });
```

And remove `tier: t.Optional(t.String()),` from the route's `query` validation object (line 818).

- [ ] **Step 3: Run the api claim test + verify no type break in the service**

Run: `bun test apps/api/src/__tests__/campaign-claim-report.test.ts`
Expected: PASS (unchanged from Task 2 — this task doesn't touch the builder).

Then confirm the two edited files have no obvious type error by reading the diff; the API full `tsc` OOMs, so do **not** run it. A targeted check: `grep -n "retailTargetTier\|modelColumns\|subsidyTotals\|\.tier" apps/api/src/modules/reports/reports.service.ts apps/api/src/modules/reports/reports.controller.ts` should return nothing in the claim paths.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/modules/reports/reports.service.ts apps/api/src/modules/reports/reports.controller.ts
git commit -m "feat(api): claim report service/JSON endpoint drop tier, pass expense columns

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: PDF — data type, controller, template

**Files:**
- Modify: `apps/api/src/modules/pdf/types.ts` (`CampaignClaimReportData`, lines 625–657)
- Modify: `apps/api/src/modules/pdf/pdf.controller.ts` (PDF `/campaign-claims`, lines 1726–1810)
- Modify: `apps/api/src/modules/pdf/templates/campaign-claim-monthly.hbs` (full table rewrite)

**Interfaces:**
- Consumes: `reportsService.getCampaignClaimReport({ year, month, brand })` → `{ expenseColumns, rows: [{...info, cells, total}], summary: { totalCars, columnTotals, grandTotal } }`.
- Produces: `CampaignClaimReportData` with `expenseColumns: string[]`, `rows[].cells`, `summary.columnTotals/grandTotal`.

- [ ] **Step 1: Replace the PDF data type**

In `apps/api/src/modules/pdf/types.ts`, replace the `CampaignClaimReportData` interface (lines 625–657) with:

```ts
export interface CampaignClaimReportData {
  header: {
    logoBase64: string;
    companyName: string;
    address1: string;
    address2: string;
    phone: string;
  };
  monthLabel: string; // e.g. 'พฤษภาคม 2569'
  brand: string;
  /** Expense-line names; the dynamic columns of the table. */
  expenseColumns: string[];
  rows: Array<{
    no: number;
    customerName: string;
    modelName: string;
    engineNumber: string;
    vin: string;
    financeProvider: string;
    saleDate: string | null; // ISO string, formatted in template
    notifyDate: string | null;
    salePrice: number;
    /** Aligned 1:1 to expenseColumns; null = model lacks that line. */
    cells: Array<number | null>;
    total: number;
  }>;
  summary: {
    totalCars: number;
    columnTotals: number[]; // aligned 1:1 to expenseColumns
    grandTotal: number;
  };
  printedAt: string;
}
```

- [ ] **Step 2: Update the PDF controller handler**

In `apps/api/src/modules/pdf/pdf.controller.ts`, in the `/campaign-claims` handler (1726–1810): remove the `tierNum`/`constructionCost` lines (1739–1743), call the service without tier, and build the new payload. Replace lines 1739–1800 (from `const tierNum = ...` through the `generateCampaignClaimReportPdf({ ... })` call) with:

```ts
      const report = await reportsService.getCampaignClaimReport({
        year,
        month,
        brand: query.brand,
      });
      const header = await getCompanyHeader();
      if (!header.logoBase64) header.logoBase64 = pdfService.getLogoBase64();

      const THAI_MONTHS = [
        'มกราคม',
        'กุมภาพันธ์',
        'มีนาคม',
        'เมษายน',
        'พฤษภาคม',
        'มิถุนายน',
        'กรกฎาคม',
        'สิงหาคม',
        'กันยายน',
        'ตุลาคม',
        'พฤศจิกายน',
        'ธันวาคม',
      ];
      const monthLabel = `${THAI_MONTHS[month - 1]} ${year + 543}`;

      const rows = report.rows.map((r) => ({
        no: r.no,
        customerName: r.customerName,
        modelName: r.modelName,
        engineNumber: r.engineNumber,
        vin: r.vin,
        financeProvider: r.financeProvider,
        saleDate: r.saleDate, // already ISO string from the service
        notifyDate: r.notifyDate,
        salePrice: r.salePrice,
        cells: r.cells,
        total: r.total,
      }));

      const pdfBuffer = await pdfService.generateCampaignClaimReportPdf({
        header,
        monthLabel,
        brand: report.brand,
        expenseColumns: report.expenseColumns,
        rows,
        summary: {
          totalCars: report.summary.totalCars,
          columnTotals: report.summary.columnTotals,
          grandTotal: report.summary.grandTotal,
        },
        printedAt: new Date().toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' }),
      });
```

(The `query`/`year`/`month`/`brand` validation above 1739 and the filename/headers/return below 1800 are unchanged. Note `r.saleDate`/`r.notifyDate` from the service are already ISO strings — no `.toISOString()` needed.)

Also remove `constructionCost`/`tier` from the route's `query` validation schema if present (search the `query: t.Object({...})` for this route and drop `tier`/`constructionCost` keys).

- [ ] **Step 3: Rewrite the PDF template**

Replace the entire contents of `apps/api/src/modules/pdf/templates/campaign-claim-monthly.hbs` with:

```handlebars
{{! apps/api/src/modules/pdf/templates/campaign-claim-monthly.hbs }}
<div class="header">
  <div class="header-logo">
    <img src="{{header.logoBase64}}" alt="Logo">
  </div>
  <div class="header-info">
    <div class="company-name-wrapper">
      <div class="company-name">{{header.companyName}}</div>
      <div class="header-line"></div>
      <div class="header-address">
        {{header.address1}}<br>
        {{header.address2}}<br>
        {{header.phone}}
      </div>
    </div>
  </div>
</div>

<div class="document-title" style="font-size: 14px; margin: 10px 0 2px;">
  รายงานเบิกแคมเปญเงินส่งเสริมการขายประจำเดือน {{monthLabel}}
</div>
<div class="text-center" style="font-size: 11px; margin-bottom: 6px;">
  ยี่ห้อ: <strong>{{brand}}</strong>
</div>

<table class="claim-table">
  <thead>
    <tr>
      <th>ลำดับ</th>
      <th>ชื่อ - สกุล</th>
      <th>แบบรถ</th>
      <th>เลขเครื่อง</th>
      <th>เลขตัวรถ</th>
      <th>ไฟแนนท์</th>
      <th>วันที่ขาย</th>
      <th>ราคาขาย</th>
      {{#each expenseColumns}}<th>{{this}}</th>{{/each}}
      <th>รวม/คัน</th>
      <th>วันที่แจ้งขาย</th>
    </tr>
  </thead>
  <tbody>
    {{#each rows}}
    <tr>
      <td class="tc">{{no}}</td>
      <td>{{customerName}}</td>
      <td>{{modelName}}</td>
      <td class="tc mono">{{engineNumber}}</td>
      <td class="tc mono">{{vin}}</td>
      <td class="tc">{{financeProvider}}</td>
      <td class="tc">{{#if saleDate}}{{formatThaiDate saleDate 'short'}}{{/if}}</td>
      <td class="tr">{{#if salePrice}}{{formatCurrency salePrice false}}{{/if}}</td>
      {{#each cells}}<td class="tr">{{#if this}}{{formatCurrency this false}}{{/if}}</td>{{/each}}
      <td class="tr strong">{{#if total}}{{formatCurrency total false}}{{/if}}</td>
      <td class="tc">{{#if notifyDate}}{{formatThaiDate notifyDate 'short'}}{{/if}}</td>
    </tr>
    {{else}}
    <tr>
      <td colspan="10" class="tc muted">ไม่มีรายการเบิกแคมเปญในเดือนนี้</td>
    </tr>
    {{/each}}
    {{#if rows.length}}
    <tr class="row-total">
      <td colspan="8" class="tr strong">รวมทั้งสิ้น ({{summary.totalCars}} คัน)</td>
      {{#each summary.columnTotals}}<td class="tr strong">{{formatCurrency this false}}</td>{{/each}}
      <td class="tr strong">{{formatCurrency summary.grandTotal false}}</td>
      <td></td>
    </tr>
    {{/if}}
  </tbody>
</table>

<div class="claim-footer">
  <div class="sign-block">
    <div>ลงชื่อ .................................................. ผู้จัดทำ</div>
    <div class="sign-date">วันที่ ........../........../..........</div>
  </div>
  <div class="sign-block">
    <div>ลงชื่อ .................................................. ผู้อนุมัติ</div>
    <div class="sign-date">วันที่ ........../........../..........</div>
  </div>
</div>
<div class="printed-at">พิมพ์เมื่อ: {{printedAt}}</div>

<style>
  @page { size: A4 landscape; margin: 8mm; }
  .claim-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 8px;
    line-height: 1.2;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .claim-table th, .claim-table td {
    border: 1px solid #374151;
    padding: 1px 3px;
    vertical-align: middle;
    font-size: 8px;
  }
  .claim-table th {
    background: #f3f4f6 !important;
    color: #111827 !important;
    font-weight: bold;
    text-align: center;
    font-size: 8px;
  }
  .claim-table .tc { text-align: center; }
  .claim-table .tr { text-align: right; }
  .claim-table .mono { font-family: monospace; font-size: 7px; }
  .claim-table .strong { font-weight: bold; }
  .claim-table .muted { color: #6b7280; padding: 10px; }
  .claim-table .row-total td { background: #f3f4f6 !important; }
  .claim-table tbody tr { page-break-inside: avoid; break-inside: avoid; }
  .claim-footer {
    display: flex;
    justify-content: space-around;
    margin-top: 18px;
    font-size: 10px;
    page-break-inside: avoid;
  }
  .sign-block { text-align: center; }
  .sign-date { margin-top: 6px; }
  .printed-at { margin-top: 14px; font-size: 8px; color: #6b7280; text-align: right; }
</style>
```

- [ ] **Step 4: Smoke-build the PDF template (render check)**

Run: `bun test apps/api/src/__tests__/campaign-claim-report.test.ts`
Expected: PASS (unchanged). The PDF template itself has no unit test; it is verified in the final live check. Confirm by reading the diff that `{{#each expenseColumns}}`, `{{#each cells}}`, and `{{#each summary.columnTotals}}` are present and the brand-bucket/`tierLabel`/`constructionCost` references are gone.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/pdf/types.ts apps/api/src/modules/pdf/pdf.controller.ts apps/api/src/modules/pdf/templates/campaign-claim-monthly.hbs
git commit -m "feat(api): claim PDF renders dynamic expense columns

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Web page + service + Excel

**Files:**
- Modify: `apps/web/src/services/report.service.ts` (lines 285–330)
- Modify: `apps/web/src/pages/reports/CampaignClaimReportPage.tsx` (full rework of the table + controls)

**Interfaces:**
- Consumes: `CampaignClaimReportResponse` (Task 1) — `{ period, brand, expenseColumns, rows: [{...info, cells, total}], summary: { totalCars, columnTotals, grandTotal } }`.

- [ ] **Step 1: Trim the web service methods**

In `apps/web/src/services/report.service.ts`, change `getCampaignClaimReport`'s params to drop `tier` and remove the `if (params.tier != null) qs.set('tier', ...)` line:

```ts
  async getCampaignClaimReport(params: {
    year: number;
    month: number;
    brand: string;
  }): Promise<CampaignClaimReportResponse> {
    const qs = new URLSearchParams({
      year: String(params.year),
      month: String(params.month),
      brand: params.brand,
    });
    const url = `/api/reports/campaign-claims?${qs.toString()}`;
    const response = await api.get<ApiResponse<CampaignClaimReportResponse>>(url);
    if (!response.success || !response.data) {
      throw new Error(response.message || 'Failed to fetch campaign claim report');
    }
    return response.data;
  }
```

And in `getCampaignClaimReportPdf`, drop `tier`/`constructionCost` from the params type and from the query string (keep only year/month/brand):

```ts
  async getCampaignClaimReportPdf(params: {
    year: number;
    month: number;
    brand: string;
  }): Promise<Blob> {
    const qs = new URLSearchParams({
      year: String(params.year),
      month: String(params.month),
      brand: params.brand,
    });
    const url = `/api/pdf/campaign-claims?${qs.toString()}`;
```

(Leave the rest of `getCampaignClaimReportPdf` — the `api.getBlob`/fetch + return — unchanged.)

- [ ] **Step 2: Replace the web page**

Replace the entire contents of `apps/web/src/pages/reports/CampaignClaimReportPage.tsx` with:

```tsx
import type { CampaignClaimRow } from '@car-stock/shared/types';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { MainLayout } from '../../components/layout';
import { exportMultiSheet } from '../../components/reports/exportUtils';
import { useToast } from '../../components/toast';
import { reportService } from '../../services/report.service';
import { vehicleService } from '../../services/vehicle.service';

const MONTH_NAMES_TH = [
  'มกราคม',
  'กุมภาพันธ์',
  'มีนาคม',
  'เมษายน',
  'พฤษภาคม',
  'มิถุนายน',
  'กรกฎาคม',
  'สิงหาคม',
  'กันยายน',
  'ตุลาคม',
  'พฤศจิกายน',
  'ธันวาคม',
];

const fmt = (n: number | null | undefined): string =>
  n == null || n === 0 ? '' : n.toLocaleString('th-TH', { minimumFractionDigits: 2 });

const fmtDate = (iso: string | null): string => (iso ? iso.split('T')[0] : '');

export function CampaignClaimReportPage(): React.ReactElement {
  const { addToast } = useToast();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [brand, setBrand] = useState('');

  const { data: vehiclePage } = useQuery({
    queryKey: ['vehicle-models-for-brands'],
    queryFn: () => vehicleService.getAll({ limit: 200 }),
  });
  const brands = useMemo(() => {
    const list = vehiclePage?.data?.map((v) => v.brand) ?? [];
    return [...new Set(list)].sort();
  }, [vehiclePage]);

  useEffect(() => {
    if (!brand && brands.length > 0) setBrand(brands[0]);
  }, [brand, brands]);

  const { data, isLoading, error } = useQuery({
    queryKey: ['campaign-claims', year, month, brand],
    queryFn: () => reportService.getCampaignClaimReport({ year, month, brand }),
    enabled: !!brand,
  });

  const handleExportExcel = () => {
    if (!data) return;
    const toRow = (r: CampaignClaimRow) => {
      const base: Record<string, string | number> = {
        ลำดับ: r.no,
        'ชื่อ - สกุล': r.customerName,
        แบบรถ: r.modelName,
        เลขเครื่อง: r.engineNumber,
        เลขตัวรถ: r.vin,
        ไฟแนนท์: r.financeProvider,
        วันที่ขาย: fmtDate(r.saleDate),
        ราคาขาย: r.salePrice,
      };
      data.expenseColumns.forEach((name, j) => {
        base[name] = r.cells[j] ?? '';
      });
      base['รวม/คัน'] = r.total;
      base.วันที่แจ้งขาย = fmtDate(r.notifyDate);
      return base;
    };
    try {
      exportMultiSheet({
        sheets: [{ name: 'เบิกแคมเปญ', data: data.rows.map(toRow) }],
        filename: `campaign-claims_${brand}_${year}-${String(month).padStart(2, '0')}`,
      });
      addToast('ดาวน์โหลด Excel สำเร็จ', 'success');
    } catch {
      addToast('ดาวน์โหลด Excel ไม่สำเร็จ', 'error');
    }
  };

  const handleDownloadPdf = async () => {
    try {
      const blob = await reportService.getCampaignClaimReportPdf({ year, month, brand });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `campaign-claims-${brand}-${year}-${String(month).padStart(2, '0')}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      addToast('ดาวน์โหลด PDF สำเร็จ', 'success');
    } catch {
      addToast('ดาวน์โหลด PDF ไม่สำเร็จ', 'error');
    }
  };

  const expenseColumns = data?.expenseColumns ?? [];

  return (
    <MainLayout>
      <div className="p-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">
            รายงานเบิกแคมเปญเงินส่งเสริมการขายประจำเดือน
          </h1>
          <p className="text-gray-600 mt-1">รายการเบิกเงินส่งเสริมการขายสำหรับส่งบริษัทรถ (Brand)</p>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-6 print-hide">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium">ปี:</label>
              <input
                type="number"
                value={year}
                onChange={(e) => setYear(Number(e.target.value))}
                className="border border-gray-300 rounded-md px-3 py-1.5 text-sm w-24"
                min={2000}
                max={3000}
              />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium">เดือน:</label>
              <select
                value={month}
                onChange={(e) => setMonth(Number(e.target.value))}
                className="border border-gray-300 rounded-md px-3 py-1.5 text-sm"
              >
                {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                  <option key={m} value={m}>
                    {MONTH_NAMES_TH[m - 1]}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium">ยี่ห้อ:</label>
              <select
                value={brand}
                onChange={(e) => setBrand(e.target.value)}
                className="border border-gray-300 rounded-md px-3 py-1.5 text-sm"
              >
                {brands.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="button"
              onClick={handleExportExcel}
              className="bg-green-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-green-700"
            >
              ดาวน์โหลด Excel
            </button>
            <button
              type="button"
              onClick={handleDownloadPdf}
              className="bg-red-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-red-700"
            >
              ดาวน์โหลด PDF
            </button>
          </div>
        </div>

        {isLoading && <div className="p-6 animate-pulse">กำลังโหลด...</div>}
        {error != null && <div className="p-6 text-red-600">ไม่สามารถโหลดรายงานได้</div>}

        {data && (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
              <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
                <p className="text-sm text-blue-600 font-medium">จำนวนรถ</p>
                <p className="text-2xl font-bold text-blue-900">{data.summary.totalCars}</p>
              </div>
              <div className="bg-emerald-50 rounded-lg p-4 border border-emerald-200">
                <p className="text-sm text-emerald-600 font-medium">ยอดเบิกรวมทั้งสิ้น</p>
                <p className="text-2xl font-bold text-emerald-900">
                  {data.summary.grandTotal.toLocaleString('th-TH', { minimumFractionDigits: 2 })}
                </p>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-gray-50">
                  <tr>
                    {['ลำดับ', 'ชื่อ-สกุล', 'แบบรถ', 'เลขเครื่อง', 'เลขตัวรถ', 'ไฟแนนท์', 'วันที่ขาย', 'ราคาขาย'].map(
                      (h) => (
                        <th key={h} className="px-2 py-2 text-left font-medium whitespace-nowrap">
                          {h}
                        </th>
                      )
                    )}
                    {expenseColumns.map((h) => (
                      <th key={h} className="px-2 py-2 text-right font-medium whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                    <th className="px-2 py-2 text-right font-medium whitespace-nowrap">รวม/คัน</th>
                    <th className="px-2 py-2 text-left font-medium whitespace-nowrap">วันที่แจ้งขาย</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {data.rows.map((r) => (
                    <tr key={r.saleId} className="hover:bg-gray-50">
                      <td className="px-2 py-1">{r.no}</td>
                      <td className="px-2 py-1">{r.customerName}</td>
                      <td className="px-2 py-1">{r.modelName}</td>
                      <td className="px-2 py-1 font-mono">{r.engineNumber}</td>
                      <td className="px-2 py-1 font-mono">{r.vin}</td>
                      <td className="px-2 py-1">{r.financeProvider}</td>
                      <td className="px-2 py-1">{fmtDate(r.saleDate)}</td>
                      <td className="px-2 py-1 text-right">{fmt(r.salePrice)}</td>
                      {r.cells.map((c, j) => (
                        <td key={expenseColumns[j]} className="px-2 py-1 text-right">
                          {fmt(c)}
                        </td>
                      ))}
                      <td className="px-2 py-1 text-right font-semibold">{fmt(r.total)}</td>
                      <td className="px-2 py-1">{fmtDate(r.notifyDate)}</td>
                    </tr>
                  ))}
                  {data.rows.length === 0 && (
                    <tr>
                      <td
                        colSpan={10 + expenseColumns.length}
                        className="px-2 py-6 text-center text-gray-500"
                      >
                        ไม่มีรายการเบิกแคมเปญในเดือนนี้
                      </td>
                    </tr>
                  )}
                  {data.rows.length > 0 && (
                    <tr className="bg-gray-50 font-semibold">
                      <td className="px-2 py-2" colSpan={8}>
                        รวมทั้งสิ้น ({data.summary.totalCars} คัน)
                      </td>
                      {data.summary.columnTotals.map((t, j) => (
                        <td key={expenseColumns[j]} className="px-2 py-2 text-right">
                          {fmt(t)}
                        </td>
                      ))}
                      <td className="px-2 py-2 text-right">{fmt(data.summary.grandTotal)}</td>
                      <td className="px-2 py-2" />
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-gray-500 mt-2">
              หมายเหตุ: คอลัมน์ค่าใช้จ่ายมาจากรายการที่ตั้งไว้ในแต่ละรุ่นของแคมเปญ; คันที่รุ่นไม่มีรายการนั้นจะเว้นว่าง
            </p>
          </>
        )}
      </div>
    </MainLayout>
  );
}
```

- [ ] **Step 3: Typecheck + lint the web**

Run: `cd apps/web && bunx tsc -b`
Expected: no errors (the schema, service, and page now agree). Do NOT run the API `tsc`.

Run: `bunx biome check apps/web/src/pages/reports/CampaignClaimReportPage.tsx apps/web/src/services/report.service.ts`
Expected: no NEW errors. Classify any reported errors as pre-existing (the repo carries `useButtonType`/`noLabelWithoutControl` a11y debt) vs new; fix only genuinely new ones.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/services/report.service.ts apps/web/src/pages/reports/CampaignClaimReportPage.tsx
git commit -m "feat(web): claim report page renders dynamic expense columns

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-Review

**1. Spec coverage:**
- Editor-driven dynamic columns (union, first-appearance) → Task 2 builder + tests. ✓
- `cells` aligned to `expenseColumns`; null for missing → Task 2 (pass-2 map) + test. ✓
- Per-cell via `formulaSubsidyAmount` with `{cost: stock?baseCost:0, selling: vm.price}` → Task 2. ✓
- columnTotals + grandTotal + invariant → Task 2 + test. ✓
- Filters reduce to year/month/brand (drop tier/construction) → Tasks 3 (service+JSON), 4 (PDF controller), 5 (web service+page). ✓
- Keep vehicle info + ราคาขาย + sign-off + grand total; drop ส่วนลด/ค่าก่อสร้าง/buckets → Tasks 4 (hbs) + 5 (page). ✓
- Shared contract reshape → Task 1. ✓
- `computeCampaignSubsidies` retained + deprecated, its test green → Task 2 step 3(d) + test block kept. ✓
- PDF A4 landscape + title unchanged → Task 4 hbs. ✓

**2. Placeholder scan:** No TBD/TODO; every code step is complete. The "drop `tier`/`constructionCost` from the route query schema if present" in Task 4 step 2 is a concrete conditional edit (the implementer greps the route's `query: t.Object`), not a vague instruction.

**3. Type consistency:** `expenseColumns: string[]`, `cells: (number|null)[]`, `total: number`, `summary { totalCars, columnTotals: number[], grandTotal }` are identical across Task 1 (schema), Task 2 (builder `ClaimRow` + return), Task 4 (`CampaignClaimReportData`), and Task 5 (consumption). `buildCampaignClaimReport(sales)` takes no options in Tasks 2 and 3. `getCampaignClaimReport({year, month, brand})` matches in Tasks 3, 4, 5. `formulaSubsidyAmount(operator, value, priceTarget, {cost, selling})` matches the engine. ✓
