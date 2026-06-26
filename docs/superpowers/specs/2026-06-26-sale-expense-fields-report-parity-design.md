# Sale Expense Fields → Report Parity (Excel matches the PDF)

**Date:** 2026-06-26
**Customer issue:** #7 — "sale-level ค่าใช้จ่าย/ค่าคอม/ค่าประกัน fields hard to use on sales page + should flow to report"
**Reporter:** เฮียเหลียง (via LINE, 2026-06-25)
**Related:** [[project_campaign_feedback_2026-06-25]], B5 (`2026-06-26-b5-campaign-subsidy-sales-report-design.md`), B6 (sales-summary breakdown), original sale-expense-fields (`2026-06-10-sale-expense-fields-design.md`)

## Background & reframe

Six expense/fee fields were added to the `Sale` model on 2026-06-10: `insuranceFee` (ค่าประกันชั้น 1), `compulsoryInsuranceFee` (ค่าพรบ.), `registrationFee` (ค่าจดทะเบียน), `salesCommission` (คอมฯ พนักงานขาย), `salesExpense` (ค่าใช้จ่ายในการขาย), `financeCommission` (ค่าตอบไฟแนนซ์).

The customer reported these as "hard to use." Discovery narrowed the complaint to a single concrete cause: **the values he types on the sale form don't reach the monthly report he uses.** It is not a form-UX problem and not a missing-data problem — it is a presentation-layer gap. The customer's chosen resolution is: **make every report surface consistent**, so it doesn't matter which one he opens.

## Current state

The monthly sales report (`รายงานสรุปยอดขาย`) renders through three independent code paths that have drifted apart:

| Surface | What it shows | Expense fields? |
| --- | --- | --- |
| **Server PDF** (`sales-summary-report.hbs`) | Per-sale list, 22 columns | ✅ all 6 (+ `กำไรสุทธิ`) |
| **Excel export** (`toSaleExportRow`, `SalesSummaryReportPage.tsx:58`) | Per-sale list, 14 columns | ❌ none |
| **On-screen page** (`SalesSummaryReportPage.tsx`) | Dashboard: summary cards, charts, per-**salesperson** table | ❌ no per-sale table at all |

### Root cause

`reportsService.getSalesSummaryReport()` (`apps/api/src/modules/reports/reports.service.ts`, per-sale map ~lines 760–814) returns a **rich per-sale object** with ~23 fields, including `discountAmount`, `campaignSubsidy`, `netCarDiscount`, `interestCost`, `downPayment`, `downPaymentDiscount`, `financeAmount`, `financeReturn`, `transportFee`, `totalCost`, `campaignName`, `salesCommission`, `salesExpense`, `insurancePremium`, and a correct `netProfit` (`computeSaleMoney`: gross − cost − commission − salesExpense + financeCommission + campaignSubsidy).

- `GET /api/reports/sales-summary` returns `{ success, data: result }` — the **full** rich object reaches the browser (`reports.controller.ts:326,335`). The endpoint is permission-gated by `REPORT_SALES` (`reports.controller.ts:314`).
- The server **PDF builder** reads those fields directly off the object (untyped, server-side) → all columns populate.
- The shared **`SalesSummaryItem` type** (`packages/shared/src/types/reports.ts:197`) declares only a 22-field *subset* that stops before the financial fields. So on the web, `s.salesCommission` etc. are not on the type and cannot be referenced without a compile error.
- `toSaleExportRow` therefore maps only the 14 fields the type exposes → Excel drops everything else.

**The data is already on the wire; the web just can't see it through TypeScript.**

## Goal

The Excel export reaches **column parity with the PDF**, both driven by **one canonical per-sale column definition**, so the two printable artifacts carry the same numbers and cannot silently drift apart again.

## Non-goals (out of scope)

- **On-screen per-sale table.** The on-screen page is intentionally an at-a-glance dashboard. Adding a 22+-column per-sale table to it is a large change for the least-used surface and a readability risk for an elderly user. (Approach B excludes it.)
- **Per-column permission gating.** The report is already gated as a whole by `REPORT_SALES`; the PDF already exposes the profit/commission columns to every holder. Adding per-column gating across PDF + Excel is extra scope with behavior-change risk. Status quo.
- **P&L report** profit formula (separate report; deliberately a different `netProfit` definition).
- **Campaign report** (shows only `financeCommission`, by design).

## Decisions (locked with the user)

1. **Approach B** — shared column definition (not a minimal patch, not a full tri-surface table).
2. **Permissions** — leave as-is (status quo; report already gated by `REPORT_SALES`).
3. **Excel extras** — Excel = the canonical PDF columns **plus** the genuinely-distinct extras Excel shows today: `รับจาก` (supplier), `สถานะ` (status), `Sale` (salesperson). **Drop** the per-row cost-VAT split (`ราคาก่อน VAT` / `VAT` / `ราคารวม VAT`) — it is redundant with `ต้นทุน` and is already shown as an aggregate in the PDF footer (`summary.costVatNet` / `summary.costVatAmount`).

## Design

### 1. Type the data the API already sends — `packages/shared/src/types/reports.ts`

Extend `SalesSummaryItem` with the financial/profit fields the service already emits. These are additive; **no backend change** — we are declaring reality.

```ts
export interface SalesSummaryItem {
  // ...existing fields...

  // Money breakdown (already returned by getSalesSummaryReport)
  discountAmount?: number;       // ส่วนลดตัวรถ
  campaignSubsidy?: number;      // เงินสนับสนุน (brand rebate)
  netCarDiscount?: number;       // ส่วนลดตัวรถ สุทธิ (discount − subsidy)
  downPayment?: number;          // เงินดาวน์
  downPaymentDiscount?: number;  // ส่วนลดดาวน์
  financeAmount?: number;        // ยอดจัด
  financeReturn?: number;        // ค่าคอมไฟแนนซ์ (= sale.financeCommission)
  interestCost?: number;         // ดอกเบี้ย
  transportFee?: number;         // ทะเบียน/พรบ/ขนส่ง (registrationFee + compulsoryInsuranceFee)
  totalCost?: number;            // ต้นทุน
  campaignName?: string;         // แคมเปญขาย
  salesCommission?: number;      // คอมฯ พนักงานขาย
  salesExpense?: number;         // ค่าใช้จ่ายในการขาย
  insurancePremium?: number;     // ค่าเบี้ยประกัน (= sale.insuranceFee)
  netProfit?: number;            // กำไรสุทธิ
}
```

Fields are optional (`?`) to avoid forcing changes on any other reader of the type; the service always populates them, so the column accessors apply `?? 0` defensively. (Document in the interface that these are always returned by `getSalesSummaryReport`.)

### 2. One canonical per-sale column descriptor — `apps/web/src/pages/reports/salesSummaryColumns.ts` (new)

```ts
import type { SalesSummaryItem } from '@car-stock/shared/types';
// Import from the leaf, NOT the `../../components/reports` barrel: the barrel
// re-exports recharts-backed React components, which would drag React/recharts
// into the pure Bun unit test for this descriptor.
import { formatDate } from '../../components/reports/reportUtils';

export interface SalesSummaryColumn {
  /** Thai header text — also used verbatim as the Excel column label. */
  key: string;
  /** Cell value. Money fields return raw numbers so Excel keeps them numeric. */
  value: (s: SalesSummaryItem, index: number) => string | number;
}

export const SALES_SUMMARY_COLUMNS: SalesSummaryColumn[] = [
  { key: 'ลำดับ',           value: (_s, i) => i + 1 },
  { key: 'ชื่อลูกค้า',       value: (s) => s.customerName },
  { key: 'แบบรถ',           value: (s) => s.vehicleModelName || s.vehicleInfo },
  { key: 'เลขเครื่อง',       value: (s) => s.engineNumber || '-' },
  { key: 'เลขคัซซี',         value: (s) => s.chassisNumber || s.vin || '-' },
  { key: 'ราคารถ',          value: (s) => s.totalAmount },
  { key: 'ส่วนลดตัวรถ',      value: (s) => s.discountAmount ?? 0 },
  { key: 'เงินสนับสนุน',     value: (s) => s.campaignSubsidy ?? 0 },
  { key: 'ดอกเบี้ย',         value: (s) => s.interestCost ?? 0 },
  { key: 'เงินดาวน์',        value: (s) => s.downPayment ?? 0 },
  { key: 'ส่วนลดดาวน์',      value: (s) => s.downPaymentDiscount ?? 0 },
  { key: 'คงเหลือ',          value: (s) => s.remainingAmount },
  { key: 'ยอดจัด',          value: (s) => s.financeAmount ?? 0 },
  { key: 'ค่าคอมไฟแนนซ์',    value: (s) => s.financeReturn ?? 0 },
  { key: 'รวมรับเงิน',       value: (s) => s.paidAmount },
  { key: 'วันที่ขาย',        value: (s) => (s.saleDate ? formatDate(s.saleDate) : '-') },
  { key: 'ทะเบียน/พรบ/ขนส่ง', value: (s) => s.transportFee ?? 0 },
  { key: 'ต้นทุน',          value: (s) => s.totalCost ?? 0 },
  { key: 'แคมเปญขาย',        value: (s) => s.campaignName || '-' },
  { key: 'กำไรขั้นต้น',      value: (s) => s.totalAmount - (s.totalCost ?? 0) },
  { key: 'คอมฯพนักงาน',      value: (s) => s.salesCommission ?? 0 },
  { key: 'ค่าใช้จ่ายขาย',    value: (s) => s.salesExpense ?? 0 },
  { key: 'ค่าเบี้ยประกัน',   value: (s) => s.insurancePremium ?? 0 },
  { key: 'กำไรสุทธิ',        value: (s) => s.netProfit ?? 0 },
  // Excel-only extras (kept; not in the PDF)
  { key: 'รับจาก',          value: (s) => s.receivedFrom || '-' },
  { key: 'สถานะ',           value: (s) => s.statusLabel },
  { key: 'Sale',            value: (s) => s.salesperson },
];
```

Order and labels mirror the PDF (`sales-summary-report.hbs:84–106`). Two adaptations for a spreadsheet (same data, surface-appropriate):
- The PDF packs `customerName + vehicleModelName` into one cell and `engineNumber + chassisNumber` into another; Excel splits them into separate columns.
- `กำไรขั้นต้น` is computed `totalAmount − totalCost` to match the PDF's `{{subtract totalAmount totalCost}}`.

### 3. Excel export consumes the descriptor — `apps/web/src/pages/reports/SalesSummaryReportPage.tsx`

Replace the hand-written `toSaleExportRow` (lines 58–74) with a descriptor-driven builder:

```ts
const toSaleExportRow = (s: SalesSummaryItem, idx: number) =>
  Object.fromEntries(SALES_SUMMARY_COLUMNS.map((c) => [c.key, c.value(s, idx)]));
```

All three sheets (`รายการตัดขายประจำเดือน` / `แยกเก๋ง` / `แยกกะบะ`) already call `toSaleExportRow`, so they all gain the columns. `exportMultiSheet` derives columns from object keys → **no exporter change** and auto-width still applies.

### 4. PDF — unchanged, but guarded

The PDF (`sales-summary-report.hbs`) is the reference and needs **no change**. The descriptor is documented to match it. To prevent future drift, the descriptor's expected header list is asserted in the unit test (Section 5), so editing one without the other fails CI.

## Data flow (after change)

```
sale form  ──writes──▶  Sale.{insuranceFee, …, financeCommission, salesCommission, salesExpense}
                              │
        getSalesSummaryReport() computes per-sale object (already today)
                              │
            GET /sales-summary  ── data.sales[*] (rich, now fully typed) ──▶ web
                              │                                              │
                              ├── server PDF (hbs) ── 22 cols ──▶ ส่งออก PDF │
                              │                                              │
                              └──────────────── SALES_SUMMARY_COLUMNS ───────┤
                                                                             ▼
                                                          Excel export (parity + extras)
```

## Testing

- **Unit (TDD), `salesSummaryColumns.test.ts`** (Bun): build a representative `SalesSummaryItem` and assert `toSaleExportRow`/descriptor output:
  - contains every expected Thai key (assert the exact header list — this is the PDF-drift guard);
  - money cells are raw numbers (not pre-formatted strings) so Excel can sum;
  - `กำไรขั้นต้น === totalAmount − totalCost`;
  - the six expense fields land in the right columns with `?? 0` for nulls.
- **Visual:** on local OrbStack DB (see [[reference_local_db_smoke_test]]), seed/select a sale with non-zero expense fields, export Excel, and confirm the new columns are populated and reconcile with the PDF for the same sale.

## Risks & gotchas

- **Type optionality:** the new fields are `?`, so accessors must default with `?? 0` (encoded above) to avoid `NaN`/`undefined` cells.
- **Number vs string in Excel:** keep money cells numeric (current behavior) so the customer can sum in Excel; only `วันที่ขาย` is a formatted string.
- **`downPayment` fallback:** the service sets `downPayment = sale.downPayment || sale.depositAmount` — a cash sale with only a deposit shows that deposit here (matches the PDF; not a regression).
- **No backend/serialization change** — verified `GET /sales-summary` passes `result` straight through.
- **Keep the descriptor barrel-free:** import `formatDate` from `components/reports/reportUtils` (leaf), not the `components/reports` barrel, so `salesSummaryColumns.ts` and its Bun test don't pull in React/recharts.

## Files touched

- `packages/shared/src/types/reports.ts` — extend `SalesSummaryItem` (additive).
- `apps/web/src/pages/reports/salesSummaryColumns.ts` — **new** canonical descriptor.
- `apps/web/src/pages/reports/salesSummaryColumns.test.ts` — **new** unit test.
- `apps/web/src/pages/reports/SalesSummaryReportPage.tsx` — `toSaleExportRow` becomes descriptor-driven; import the descriptor.
- `apps/api/src/modules/pdf/templates/sales-summary-report.hbs` — **no change** (reference).
