# Monthly Campaign Claim Report → Editor-Driven Expense Columns — Design

**Date:** 2026-06-26
**Component:** `apps/api/src/modules/reports/campaign-claim.helpers.ts` (builder), `apps/api/src/modules/pdf/templates/campaign-claim-monthly.hbs` (PDF), `apps/api/src/modules/pdf/pdf.controller.ts` (`/campaign-claims` endpoint), `apps/web/src/pages/reports/CampaignClaimReportPage.tsx` (web + Excel), `packages/shared/src/schemas/index.ts` (contract).
**Origin:** Follow-up to the campaign per-car expense line-items work (merged `main`, commit 86b5898). The customer noted the monthly claim report "ยังไม่รองรับอัปเดทใหม่" — it still uses the old fixed-rate brand form and ignores the expense lines configured per model in the campaign editor.

## The disconnect

The app has **two unrelated subsidy systems**:

1. **The monthly claim report** (`campaign-claim-monthly.hbs`) reproduces the manufacturer's official claim form with **hardcoded** columns and rates (`computeCampaignSubsidies` / `DEFAULT_SUBSIDY_RATES`): STOCK LEVEL 0.5% of MSRP, After Sales 0.25%×2, MARKETING 1% of DNP, เป้าขาย tier of DNP, ค่าก่อสร้าง (manual). It is parameterized only by year/month/brand/tier/constructionCost and never reads the campaign editor.
2. **The campaign editor's expense lines** (เปิดบูธ 1%, Marketing 5%, ค่าขนส่ง 3,000 …) — per `CampaignModelFormula` row. The builder computes their sum as `baseCommission` per car, but the monthly report **drops it** and shows the hardcoded buckets instead.

So the customer configures expense lines that the claim report ignores.

## Decision

Make the monthly claim report **fully editor-driven**: its columns are the expense lines defined in the campaign editor, each cell is that line's per-car baht amount, plus a per-car total. The hardcoded brand-bucket structure is removed from this report.

- **Layout:** a single table; columns = the **union of distinct expense-line names** across the month/brand's sales (first-appearance order). A car whose model lacks a given line shows a blank cell.
- **Filters:** year + month + brand only. `tier` and `constructionCost` are removed.
- **Kept:** vehicle-info columns (ลูกค้า, แบบรถ, เลขเครื่อง, เลขตัวรถ, ไฟแนนท์, วันที่ขาย, วันที่แจ้งขาย), `ราคาขาย` (the expense % is computed off it — aids verification), the ผู้จัดทำ/ผู้อนุมัติ sign-off block, and ยอดเบิกรวมทั้งสิ้น (grand total).
- **Removed from this report:** ส่วนลดการขาย, ค่าก่อสร้าง, the hardcoded STOCK LEVEL / After Sales / MARKETING / เป้าขาย columns, the tier dropdown.

## Scope

**In scope:** the monthly claim report end-to-end — shared contract, builder, PDF template, controller endpoint, web page, Excel export, and tests.

**Out of scope:** the campaign *sales* report (`CampaignReportPage` / `campaign-report.hbs`) and the campaign setup editor — both already reflect the expense model from the prior milestone. No DB/schema change.

## Architecture / units

### Single source of column alignment — the builder

The cleanest way to render dynamic columns identically across PDF, web, and Excel is to align cells **in the shared builder**, not in each renderer. The builder emits `expenseColumns: string[]` once and gives each row a `cells: (number|null)[]` aligned to that array. Every renderer then iterates two parallel arrays — no name→amount lookup logic, no drift.

### 1. Shared contract (`packages/shared/src/schemas/index.ts`)

Reshape the claim schemas (and the inferred types in `packages/shared/src/types/index.ts` follow automatically):

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
  cells: z.array(z.number().nullable()), // aligned to expenseColumns
  total: z.number(),                     // sum of this car's expense lines
});

export const CampaignClaimReportResponseSchema = z.object({
  period: z.object({ year: z.number(), month: z.number(), startDate: z.string(), endDate: z.string() }),
  brand: z.string(),
  expenseColumns: z.array(z.string()),
  rows: z.array(CampaignClaimRowSchema),
  summary: z.object({
    totalCars: z.number(),
    columnTotals: z.array(z.number()), // aligned to expenseColumns
    grandTotal: z.number(),
  }),
});
```

Removed from the schemas: `retailTargetTier`, `modelColumns`, `subsidies`/`CampaignSubsidySchema` (from the claim response), `subsidyTotals`, `promotionDiscount`, `baseCommission`, `claimTotal`, `modelAmounts`. `CampaignSubsidySchema` itself stays defined (other code/tests may reference it) but is no longer part of the claim response.

### 2. Builder (`campaign-claim.helpers.ts buildCampaignClaimReport`)

- Drop the `rates`/`computeCampaignSubsidies`/`retailTargetTier` path from the report. Keep the pure `computeCampaignSubsidies` function + `DEFAULT_SUBSIDY_RATES` (mark `@deprecated`); its standalone unit test stays green.
- Per sale: `const bases = { cost: sale.stock ? toNum(sale.stock.baseCost) : 0, selling: toNum(vm.price) }`. For each of the model's formulas (already loaded sorted by `sortOrder`), compute `formulaSubsidyAmount(f.operator, toNum(f.value), f.priceTarget, bases)`, keyed by `f.name`. If a model repeats a name, sum into the same key. The car's `total` = sum of its amounts (use `sumCampaignSubsidies` for consistency, or sum the per-line amounts — identical).
- Build `expenseColumns`: iterate sales in display order (sorted by `soldDate ?? completedDate`); within each sale iterate its formulas by `sortOrder`; append each new name in encounter order.
- `rows[i].cells = expenseColumns.map((name) => amounts.get(name) ?? null)`.
- `summary.columnTotals[j] = round2(Σ_rows cells[j] ?? 0)`; `summary.grandTotal = round2(Σ_rows total)`; `summary.totalCars = rows.length`.
- Keep `no`, the date sort, and the vehicle-info fields. Keep `salePrice = toNum(vm.price)`.

### 3. PDF template (`campaign-claim-monthly.hbs`)

Rewrite the table:
- Header row: fixed info `th`s (ลำดับ, ชื่อ-สกุล/แบบรถ, เลขเครื่อง/เลขตัวรถ, ราคาขาย/วันที่ขาย, ไฟแนนท์, วันที่แจ้งขาย) + `{{#each expenseColumns}}<th>{{this}}</th>{{/each}}` + `รวม/คัน`.
- Body: `{{#each rows}}` → info cells + `{{#each cells}}<td class="tr">{{#if this}}{{formatCurrency this false}}{{/if}}</td>{{/each}}` + `{{formatCurrency total false}}`.
- Totals row: `รวมทั้งสิ้น ({{summary.totalCars}} คัน)` spanning the info columns + `{{#each summary.columnTotals}}<td class="tr strong">{{formatCurrency this false}}</td>{{/each}}` + `{{formatCurrency summary.grandTotal false}}`.
- Keep the `.claim-footer` sign-off block + `printedAt`. Keep `@page A4 landscape`. Remove the brand-bucket header rows, ค่าก่อสร้าง row, `tierLabel`, `constructionCost`, the row-grand "(รวมค่าก่อสร้าง)" line (grand total is now just the expense total).
- Title row unchanged: `รายงานเบิกแคมเปญเงินส่งเสริมการขายประจำเดือน {{monthLabel}}` + `ยี่ห้อ: {{brand}}`.

### 4. Controller (`/campaign-claims`, pdf.controller.ts)

- Remove `tier`/`constructionCost` query handling and the `tierLabel`/`grandTotalWithConstruction` plumbing.
- Map `report.rows` straight through (they already carry `cells`/`total`); pass `expenseColumns` and `summary { totalCars, columnTotals, grandTotal }`. Keep `monthLabel`, `brand`, `header`, `printedAt`, the filename.

### 5. Web (`CampaignClaimReportPage.tsx`)

- Remove the tier select and the constructionCost input (and their state); keep year/month/brand.
- Render headers from `['ลำดับ','ชื่อ-สกุล','แบบรถ','เลขเครื่อง','เลขตัวรถ','ไฟแนนท์','วันที่ขาย','ราคาขาย', ...data.expenseColumns, 'รวม/คัน','วันที่แจ้งขาย']`; body cells from `r.cells`; totals row from `summary.columnTotals` + `summary.grandTotal`.
- Summary cards: จำนวนรถ + ยอดเบิกรวม (`summary.grandTotal`). Remove the subsidy card and the construction add-on.
- Excel export: each row = fixed info keys + one key per `expenseColumns` name (value = its cell) + `รวม/คัน` = `r.total`. Drop the brand-bucket keys.
- `getCampaignClaimReportPdf` call drops `tier`/`constructionCost`.

### 6. reports.service `getCampaignClaimReport`

Already loads `campaign.vehicleModels.formulas` (sorted) and filters by month+brand+`campaignId != null`+`status != CANCELLED`. Update only the call into the builder (drop `retailTargetTier`) and the returned shape to match the new response schema.

## Data flow

`CampaignClaimReportPage` (year/month/brand) → `reportService.getCampaignClaimReport` → `getCampaignClaimReport` (loads sales + `campaign.vehicleModels.formulas`) → `buildCampaignClaimReport` (per-line `formulaSubsidyAmount`, union columns, aligned `cells`, totals) → web table / Excel. PDF path: `/campaign-claims` → same builder → `campaign-claim-monthly.hbs`.

## Assumptions

- Cells use the model's **list price** (`vehicleModel.price`) for `SELLING_PRICE` and the **sold car's** `stock.baseCost` for `COST_PRICE` (0 without stock → cost-% lines resolve to 0). This mirrors the per-car snapshot already in use.
- A sale under a campaign whose model has **zero expense lines** still appears, with all cells blank and `total = 0`.
- Prisma `Decimal` `value` is coerced with `toNum(...)` in the builder (server-side), so the `Number.isFinite` guard in `formulaSubsidyAmount` sees real numbers — see `[[reference-prisma-decimal-string-value]]`.

## Testing (TDD)

Rewrite `apps/api/src/__tests__/campaign-claim-report.test.ts` against the new shape:
- `expenseColumns` is the union of line names in first-appearance order across two models with overlapping + distinct names.
- A car's `cells` align to `expenseColumns`; a model missing a line yields `null` in that slot.
- Per-car `total` = sum of its line amounts (e.g. 1% of 500,000 + FIXED 3,000 = 8,000).
- `columnTotals` sum each column across cars; `grandTotal` = Σ totals; `totalCars` = rows length.
- No-stock: a cost-based % line resolves to 0 in its cell.
- Empty input → `expenseColumns: []`, `rows: []`, `summary { totalCars: 0, columnTotals: [], grandTotal: 0 }`.
- Keep the existing `computeCampaignSubsidies` unit test unchanged (the function is retained, deprecated).

## Risks

- **PDF column width.** Many distinct expense lines widen the A4-landscape table; cells are `font-size: 8px` already. Acceptable for the expected handful of lines; no dynamic font scaling in this round (note it if a real campaign exceeds ~8 lines).
- **Removed response fields.** `subsidies`/`subsidyTotals`/`modelColumns`/`tier` leave the claim response. Only `CampaignClaimReportPage` and the `/campaign-claims` PDF consume this response (verified) — both are updated here. The standalone `computeCampaignSubsidies` test is the only other consumer of `CampaignSubsidySchema`/rates and is left intact.
