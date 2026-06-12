# Design: Monthly Campaign Claim Report (รายงานเบิกแคมเปญเงินส่งเสริมการขายประจำเดือน)

**Date:** 2026-06-12
**Status:** Approved by user

## Problem

The customer must submit a monthly campaign-claim report to the vehicle brand (e.g., NETA).
The existing campaign report (`/campaigns/:id/report`) is per-campaign and styled for
internal analysis; it does not match the brand's required submission format
(reference: `ตัวอย่างหนังสือและรายงาน.xlsx - แคมเปญ.csv`).

## Decisions (confirmed with user)

- **Scope:** monthly, all campaigns combined, filterable by brand.
- **Missing data** (date money received from brand, sales-target tier, trade-in/purchase
  expense): render the columns with blank cells for manual fill-in. No new DB fields.
- **Export:** both PDF and Excel.
- **Approach:** new report alongside the existing per-campaign report (Approach A).
  The existing report is untouched.

## API (apps/api, reports module)

New methods in `reports.service.ts`, routes in `reports.controller.ts`
(following the existing JSON + `/pdf` route pair pattern):

- `GET /api/reports/campaign-claims?month=YYYY-MM&brand=<brand>` → JSON
- `GET /api/reports/campaign-claims/pdf?month=...&brand=...` → PDF
  (template `campaign-claim-monthly.hbs`)

Data selection:

- `Sale.campaignId != null`
- `Sale.status NOT IN (CANCELLED)`
- `stock.soldDate` within selected month
- `vehicleModel.brand` equals selected brand

Auth: same as existing campaign report (`CAMPAIGN_VIEW` permission).

### Column mapping

| Brand-format column | Source |
|---|---|
| ลำดับ | running number, sorted by sold date |
| ชื่อ-สกุล | `customer.name` |
| แบบรถ (lower row) | `vehicleModel.model + variant` |
| เลขเครื่อง / เลขตัวรถ | `stock.engineNumber` / `stock.vin` |
| ไฟแนนท์ / วันที่ขาย | `sale.financeProvider` / `stock.soldDate` |
| ส่วนลดโปรโมชั่น | `sale.carDiscount`, fallback `discountSnapshot`; วันที่รับเงิน blank |
| คอมมิชชั่นพื้นฐาน | sum of campaign model formula results for the sale's model; วันที่รับเงิน blank |
| ยอดตามรุ่น STANDARD (dynamic columns) | claim amount (discount + commission) placed in the column of the car's model; columns = distinct models actually sold that month for the brand |
| เป้าขาย (second dynamic column set) | all blank (manual fill) |
| รวมรับเงิน | per-car total of claim amounts |
| วันที่แจ้งขาย | `sale.completedDate`, fallback `stock.soldDate` |
| ค่าใช้จ่ายซื้อ/แลกรถกับดีเลอร์ | blank (manual fill) |

## PDF template (`campaign-claim-monthly.hbs`)

- Standard company header partial + title
  "รายงานเบิกแคมเปญเงินส่งเสริมการขายประจำเดือน {Thai month/year}" + brand name.
- Single table for the whole month (no per-model grouping), sorted by sold date.
- **Two `<tr>` rows per sale**, mirroring the brand form:
  - Upper: ลำดับ | ชื่อลูกค้า | เลขเครื่อง | ไฟแนนท์ | ส่วนลดโปรโมชั่น | คอมมิชชั่นพื้นฐาน | model columns… | เป้าขาย columns… | รวมรับเงิน | ค่าแลก/ซื้อรถ
  - Lower: (blank) | แบบรถ | เลขตัวรถ | วันที่ขาย | วันที่รับเงิน (blank) | วันที่รับเงิน (blank) | … | วันที่แจ้งขาย | (blank)
- Footer rows: per-model column subtotals + monthly grand total of รวมรับเงิน.
- Plain black-and-white document styling (no colored summary cards). A4 landscape.

## Web (apps/web)

- New page `CampaignClaimReportPage.tsx` at `/reports/campaign-claims`:
  month picker + brand dropdown (brands from system data), preview table,
  "ดาวน์โหลด PDF" and "Export Excel" buttons.
- Excel export reuses `src/components/reports/exportUtils.ts` (`xlsx`, A4 landscape
  already defaulted). One row per sale (dates broken out as flat columns) so the
  brand can sort/sum; PDF keeps the 2-row form layout.
- Menu link in reports group; route wrapped in `ProtectedRoute` with `CAMPAIGN_VIEW`.

## Edge cases

- Month with no sales → empty table with message; PDF still generates.
- Sale without stock (model reserved, no car matched) → use sale's `vehicleModel`;
  VIN/engine cells blank.
- Many models in one month → dynamic columns may crowd the page; use 8–9px fonts
  like the existing campaign table.

## Testing

- Bun unit tests for the service: month/brand filtering, column mapping,
  per-model and grand totals, sale-without-stock case.
- Visual check of generated PDF via screenshot.
