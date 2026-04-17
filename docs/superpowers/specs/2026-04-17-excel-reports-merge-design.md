# Excel Reports Merge — Design Spec

**Date:** 2026-04-17
**Author:** Claude Code + Marvin Rop
**Status:** Draft — awaiting user review

## 1. Goal

Reproduce two existing paper/Excel reports inside the Car-Stock system so the customer can generate them from the app without hand-editing spreadsheets:

- **Daily stock snapshot** (`ตัวอย่างstockประจำวัน.xlsx`) — pivoted by model × color with reservations, on-hand, and purchase-requirement views.
- **Monthly workbook** (`ตัวอย่างstockประจำเดือน.xlsx`) — 12 sheets collapsed into 4 logical reports by applying `vehicleType` filters.

The existing 12-sheet monthly workbook is really 3 list views (stock / purchases / sales) × 3 filters (all / sedan / pickup) + 2 low-value sheets we are dropping. Merge → 4 reports in the app, but **export format still mirrors the customer's Excel layout** (multi-sheet workbook matches today's file exactly).

## 2. In scope / out of scope

### In scope
- Add `Stock.receivedFrom` (supplier / ผู้จำหน่าย) — one nullable text column.
- Add 2 indexes: `stocks(arrival_date)`, `stocks(sold_date)`.
- Two new report pages: Daily Stock Snapshot, Monthly Purchases.
- Extend two existing pages: StockReport (add `vehicleType` filter + VAT split + supplier), SalesSummary (add `vehicleType` filter + enriched export columns).
- VAT split derivation — no persistence, computed from `baseCost` at read time.
- Multi-sheet Excel export per report, sheet names in Thai matching the customer's sample.
- A4 landscape page setup applied globally to all Excel exports; CSS `@page` print rule.
- PDF support for the two new reports (Handlebars template + landscape page setup).

### Out of scope
- PO / D-O number (ใบสั่งซื้อ)
- ลอกแชชซีส์ flag
- DEMO sub-types (Test / Courtesy / DISPLAY) — rolled into one DEMO row
- ตัดหลอก report
- Testdrive / demo-car price sheet
- Backfill of `receivedFrom` on historical rows (remain `null`, render as `-`)
- Migration-file–based Prisma workflow — project uses `prisma db push` via the updater

## 3. Data model change

One field on `Stock`, two indexes, no other model touched.

```prisma
model Stock {
  // ... existing fields ...
  receivedFrom String? @map("received_from")

  @@index([status])
  @@index([vehicleModelId])
  @@index([deletedAt])
  @@index([createdAt])
  @@index([arrivalDate])   // NEW — used by monthly purchase range queries
  @@index([soldDate])      // NEW — used by monthly sales range queries
  @@map("stocks")
}
```

**Deployment:** production picks this up automatically via `apps/updater/update.sh` Step 7, which runs `bunx prisma db push --skip-generate` after every `git pull`. All three changes are additive → no `accept-data-loss` prompt → fully automated. Local devs run `bun run db:migrate`.

## 4. VAT split formula (locked)

Thai VAT-inclusive extraction, computed on the fly, not stored:

```ts
const splitVat = (gross: number) => {
  if (gross <= 0) return { net: 0, vat: 0, gross: Math.max(0, gross) };
  const net = Math.round((gross / 1.07) * 100) / 100;
  const vat = Math.round((gross - net) * 100) / 100;
  return { net, vat, gross };
};
```

Invariant: `net + vat === gross` at 2 decimal places. Verified against two sample rows from the customer's Excel:

| `baseCost` (gross) | `net` | `vat` | Excel actual |
|---|---|---|---|
| 466,650.00 | 436,121.50 | 30,528.50 | ✓ |
| 521,000.00 | 486,915.89 | 34,084.11 | ✓ |

## 5. New pages

### 5.1 `DailyStockSnapshotPage` — `/reports/daily-stock-snapshot`

**Filter bar:** `snapshotDate` (defaults to today)

**API:** `GET /api/reports/daily-stock-snapshot?date=YYYY-MM-DD`

**Response shape:**
```ts
{
  date: string;
  colors: string[];                 // union across reservations + stock, alpha sorted
  models: Array<{
    vehicleModelId: string;
    modelName: string;              // "NETA V"
    reservationsByColor: Record<string, number>;
    reservationsTotal: number;
    availableByColor: Record<string, number>;
    availableTotal: number;
    demoByColor: Record<string, number>;
    demoTotal: number;
    requiredByColor: Record<string, number>; // max(0, reservations - available)
    requiredTotal: number;
  }>;
  grand: { reservations: number; available: number; demo: number; required: number };
  unassignedReservations: number; // reservations with vehicleModelId = null (walk-in / custom)
}
```

**Backend sketch:**
```ts
// Two queries, both scoped to snapshotDate
const reservations = await db.sale.findMany({
  where: { status: { in: ['RESERVED', 'PREPARING'] }, createdAt: { lte: snapshotDate } },
  include: { vehicleModel: true },
});
const stocks = await db.stock.findMany({
  where: {
    deletedAt: null,
    arrivalDate: { lte: snapshotDate },
    status: { in: ['AVAILABLE', 'DEMO'] },
  },
  include: { vehicleModel: true },
});
// Group both by vehicleModelId + color, pivot in memory, compute required = max(0, res - avail).
```

**Page layout (MainLayout shell):**
1. Header + date picker
2. Four summary cards — total reservations / on-hand / DEMO / to-order
3. Panel 1 table — ยอดจองคงเหลือ (rows = models, columns = colors + Total)
4. Panel 2 table — สต๊อกคงเหลือ (with DEMO sub-row per model when `demoTotal > 0`)
5. Panel 3 table — ยอดที่ต้องสั่งซื้อ (negative cells red = สต๊อกเกิน, positive amber = สั่งเพิ่ม)
6. Export Excel button → 3-sheet workbook
7. Export PDF button → single landscape page rendering all 3 panels

### 5.2 `MonthlyPurchasesReportPage` — `/reports/monthly-purchases`

**Filter bar:** month picker (year + month) + vehicleType dropdown

**API:** `GET /api/reports/monthly-purchases?year=2026&month=4&vehicleType=SEDAN`

Controller computes `startDate` = first-of-month 00:00:00 local tz, `endDate` = first-of-*next*-month 00:00:00 local tz. Query uses `{ gte: startDate, lt: endDate }` — half-open interval — to avoid missing timestamps late in the last day. All three reports using month ranges follow the same convention.

**Response shape:**
```ts
{
  period: { year: number; month: number; startDate: string; endDate: string };
  vehicleType?: VehicleType;
  items: Array<{
    no: number; vehicleModelName: string; exteriorColor: string;
    vin: string; engineNumber: string;
    orderDate: string; arrivalDate: string; receivedFrom: string;
    priceNet: number; priceVat: number; priceGross: number;
    parkingSlot: string;
    customerName: string | null; soldDate: string | null; salesperson: string | null;
    notes: string | null;
  }>;
  summary: {
    totalVehicles: number;
    totalPriceNet: number; totalPriceVat: number; totalPriceGross: number;
    byType: Array<{ type: VehicleType; count: number; totalGross: number }>;
  };
}
```

**Backend sketch:**
```ts
where = {
  deletedAt: null,
  arrivalDate: { gte: startDate, lt: endDate }, // half-open interval, see §5.2
  ...(vehicleType && { vehicleModel: { type: vehicleType } }),
};
```

**Page layout:** header + filter card + 3 summary cards + 14-column table + export Excel (3 sheets) + export PDF.

## 6. Extensions to existing pages

### 6.1 `StockReportPage` + `getStockReport`
- Add `vehicleType` dropdown (Thai labels from `@car-stock/shared/constants`).
- API accepts `vehicleType?: VehicleType` (where: `vehicleModel: { type }`).
- Each row gets `receivedFrom` + `splitVat(baseCost)` folded into the response.
- In-app table: add `รับจาก` column after `arrivalDate`.
- Excel export → 3-sheet workbook: `สต็อกรถทั้งหมด`, `สต็อกแยกเก๋ง`, `สต็อกแยกกะบะ`.

### 6.2 `SalesSummaryReportPage` + `getSalesSummaryReport`
- Add `vehicleType` dropdown.
- API accepts `vehicleType?: VehicleType` (where: `OR: [{ stock: { vehicleModel: { type } } }, { vehicleModel: { type } }]` to cover both stock-linked and direct sales).
- Each row gets VAT split + `receivedFrom` passed through.
- Excel export → 3-sheet workbook: `รายการตัดขายประจำเดือน`, `รายการตัดขายแยกเก๋ง`, `รายการตัดขายแยกกะบะ`.
- Columns match the customer's monthly sales sheet layout.

### 6.3 `ReportsPage`
- Two new cards linking to `/reports/daily-stock-snapshot` and `/reports/monthly-purchases`.
- Labels: `รายงานสต็อกประจำวัน` and `รายงานรายการซื้อประจำเดือน`.

### 6.4 `App.tsx`
- Register two new routes, wrapped in `ProtectedRoute` with existing report-access roles.

## 7. Excel export layout

Each of the 4 export buttons produces a workbook shaped like the customer's sample:

| Page | Workbook sheets |
|---|---|
| Daily Stock Snapshot | `ยอดจองคงเหลือ`, `สต๊อกคงเหลือ`, `ยอดที่ต้องสั่งซื้อ` |
| Monthly Purchases | `รายการซื้อรถประจำเดือน`, `รายการซื้อแยกเก๋ง`, `รายการซื้อแยกกะบะ` |
| Monthly Sales (extended Sales Summary) | `รายการตัดขายประจำเดือน`, `รายการตัดขายแยกเก๋ง`, `รายการตัดขายแยกกะบะ` |
| Monthly Master Stock (extended Stock Report) | `สต็อกรถทั้งหมด`, `สต็อกแยกเก๋ง`, `สต็อกแยกกะบะ` |

The split sheets are always emitted regardless of which `vehicleType` the user selected in-app — parity with the customer's file is more important than export speed. When the user's filter is something other than SEDAN or PICKUP (e.g., SUV), the `แยกเก๋ง` and `แยกกะบะ` sheets will be empty but still present; the `ทั้งหมด` sheet will contain the filtered rows. This matches how the customer's original file behaves when a month has no cars of that body type.

## 8. A4 landscape — global

Three plumbing touchpoints:

**Web print CSS** (`apps/web/src/index.css`):
```css
@media print {
  @page { size: A4 landscape; margin: 10mm; }
  .print-hide { display: none !important; }
}
```

**Excel worksheets** — extend `exportUtils.ts:exportMultiSheet` to set landscape page setup on every sheet:
```ts
ws['!pageSetup'] = { orientation: 'landscape', paperSize: 9, fitToWidth: 1, fitToHeight: 0 };
ws['!margins'] = { left: 0.3, right: 0.3, top: 0.5, bottom: 0.5, header: 0.3, footer: 0.3 };
```
Applied to **all** reports, not just the new ones. Pre-existing exports (Profit/Loss, Interest, Daily Payment) inherit landscape as a side effect — matches the customer's consistent paper format.

**Backend PDF** — new Handlebars templates `daily-stock-snapshot.hbs` and `monthly-purchases-report.hbs` under `apps/api/src/modules/pdf/templates/`, same landscape page setup as existing `stock-report.hbs`.

## 9. Error handling & edge cases

| Case | Behavior |
|---|---|
| No data for period/date | Summary cards = 0; table empty state `ไม่พบข้อมูลรายงาน`; Excel still produced (accountant wants empty-valid file). |
| `receivedFrom` null on old rows | Render `-` in table and Excel cell. |
| Empty color union | Pivot renders models with only Total column. |
| `baseCost` = 0 | `splitVat(0) → {0, 0, 0}`. |
| `baseCost` < 0 | Treated as invalid → `{0, 0, 0}`. |
| Invalid month/year in query | Zod rejects at boundary → 400 via existing `onError`. |
| Snapshot date in the future | Allowed. |
| Reservation with `vehicleModelId = null` (walk-in) | Skipped in Panel 1; count surfaced as `unassignedReservations` in summary. |
| Cancelled sales | Excluded (matches existing `SalesSummaryReport` filter). |
| Soft-deleted stocks | Excluded (`deletedAt: null` guard preserved). |
| Prisma `db push` detects data loss | Updater refuses to apply, triggers auto-rollback. Our migration is additive only, so this shouldn't trigger. |

## 10. Performance

- Daily snapshot pivots in memory after 2 Prisma queries. 10k stocks × 50 colors × 200 models → < 50 ms.
- Monthly queries use new indexes on `arrival_date` and `sold_date`.
- Excel generation client-side via existing `xlsx`; PDF via existing Handlebars + headless-Chrome pipeline.

## 11. Testing

**Unit tests (Bun test):**
- `splitVat` — 0, 100, 466650, 521000, edge-case rounding; assert `net + vat === gross`.
- Daily snapshot pivot builder — given fixtures, verify panel totals and `required` cell formula.
- Monthly purchases service — date-range filter correctness.
- VehicleType filter — results all match type.

**Integration tests:**
- `GET /api/reports/daily-stock-snapshot?date=...` shape + totals.
- `GET /api/reports/monthly-purchases?year=...&month=...` bounds.
- `vehicleType` param validation (Zod rejects invalid enum values).

**Manual smoke tests (per CLAUDE.md):**
- Filter interaction on both new pages.
- Excel export → open in Excel → confirm sheet names, landscape, totals reconcile with in-app view.
- Print preview → confirm A4 landscape.
- PDF download → confirm landscape + Thai rendering.

## 12. Out-of-scope list (explicit)

Repeated here for clarity — these were discussed and deferred:

- Purchase-order number / D-O number field on Stock.
- Chassis-copy (ลอกแชชซีส์) flag.
- DEMO sub-type enum (Test / Courtesy / Display).
- ตัดหลอก ("fake cut") report.
- Testdrive / demo-car price sheet.
- Backfill of `receivedFrom` on legacy rows.
- Monthly performance dashboard / trend charts.

## 13. File inventory (for the implementation plan)

**New files**
- `apps/web/src/pages/reports/DailyStockSnapshotPage.tsx`
- `apps/web/src/pages/reports/MonthlyPurchasesReportPage.tsx`
- `apps/api/src/modules/pdf/templates/daily-stock-snapshot.hbs`
- `apps/api/src/modules/pdf/templates/monthly-purchases-report.hbs`
- Unit-test files for new services.

**Modified files**
- `apps/api/prisma/schema.prisma` — `receivedFrom` + 2 indexes.
- `apps/api/src/modules/reports/reports.service.ts` — 2 new service functions + VAT split + `vehicleType` filters.
- `apps/api/src/modules/reports/reports.controller.ts` — 2 new routes + query validation.
- `apps/api/src/modules/pdf/pdf.controller.ts` + `pdf.service.ts` — 2 new PDF endpoints.
- `apps/web/src/services/report.service.ts` — client methods.
- `apps/web/src/pages/reports/StockReportPage.tsx` — add filter, column, updated export.
- `apps/web/src/pages/reports/SalesSummaryReportPage.tsx` — add filter, enriched export.
- `apps/web/src/pages/reports/ReportsPage.tsx` — 2 new cards.
- `apps/web/src/App.tsx` — 2 new routes.
- `apps/web/src/components/reports/exportUtils.ts` — landscape pageSetup globally.
- `apps/web/src/index.css` — `@page` landscape rule.
- `packages/shared/src/types/index.ts` or equivalent — new response types.
- `packages/shared/src/schemas/*` — new Zod schemas for route validation.
