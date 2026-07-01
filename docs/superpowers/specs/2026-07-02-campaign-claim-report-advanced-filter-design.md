# Monthly Campaign Claim Report → Advanced Filter (Date Range + Campaign) — Design

**Date:** 2026-07-02
**Component:** `apps/api/src/modules/reports/reports.service.ts` (`getCampaignClaimReport`), `apps/api/src/modules/reports/reports.controller.ts` + `apps/api/src/modules/pdf/pdf.controller.ts` (`/campaign-claims` endpoints), `apps/api/src/modules/pdf/templates/campaign-claim-monthly.hbs`, `apps/web/src/pages/reports/CampaignClaimReportPage.tsx`, `apps/web/src/services/report.service.ts`, `apps/web/src/services/campaign.service.ts` (reused, unchanged), `packages/shared/src/schemas/index.ts` (contract).
**Origin:** Customer asked for a "per campaign" report. Since `/campaigns/:id/report` already covers a single campaign's full history, the agreed fix is to add advanced filtering (specific campaign + custom date range) to the existing monthly claim report instead of building a new page.

## Problem

`รายงานเบิกแคมเปญเงินส่งเสริมการขายประจำเดือน` (`/reports/campaign-claims`) is currently filterable only by ปี/เดือน (a fixed calendar month) + ยี่ห้อ (brand). There's no way to narrow it to one campaign or to a non-calendar-month period.

## Decision

Add two filters to the existing report, replacing the calendar month picker:

1. **Date range** — replaces ปี/เดือน entirely with a start-date/end-date pair (native `<input type="date">`), defaulting to the 1st/last day of the current month so the default view is unchanged. A calendar month becomes just one possible range.
2. **Campaign** — an optional dropdown (default "ทั้งหมด" = all), scoped to campaigns that include at least one vehicle model of the selected brand.

Both filters narrow the underlying sales query in `getCampaignClaimReport`, which still feeds the single shared `buildCampaignClaimReport()` builder — so expense columns, per-row cells, and totals all recompute correctly for the filtered set. No duplicate filtering logic in the web layer.

## Scope

**In scope:** `getCampaignClaimReport` signature + query, both `/campaign-claims` controllers (JSON + PDF), the claim schema's `period` shape, the PDF template's title line, `CampaignClaimReportPage.tsx`, `report.service.ts`.

**Out of scope:** `buildCampaignClaimReport` itself (already sale-list-in, no year/month/campaign awareness — untouched), the per-campaign report (`campaigns/:id/report`), the campaign editor.

## API contract change

`getCampaignClaimReport({ year, month, brand })` → `getCampaignClaimReport({ startDate, endDate, brand, campaignId? })`, where `startDate`/`endDate` are `Date`s representing the inclusive first/last day of the range (converted to a half-open `[startDate, endOfEndDate)` interval internally, same convention as today).

Query params on both `/api/reports/campaign-claims` and `/api/pdf/campaign-claims` become `startDate` (`YYYY-MM-DD`), `endDate` (`YYYY-MM-DD`), `brand`, `campaignId?`. `year`/`month` params are removed — this is an internal API with two consumers (this page, its PDF button), both updated in this change, so no back-compat shim.

`campaignId`, when present, replaces the existing `campaignId: { not: null }` clause with `campaignId: <value>` (a specific campaign already implies non-null).

Shared schema: `CampaignClaimReportResponseSchema.period` becomes `{ startDate: z.string(), endDate: z.string() }` (drops `year`/`month`).

## PDF / web period label

Both surfaces currently show "ประจำเดือน {Thai month} {Thai year}". Since the period is no longer necessarily a calendar month, this becomes "ประจำงวด {startDate Thai} - {endDate Thai}" (formatted with the existing `formatThaiDate(..., 'full')` helper), matching the range-label pattern already used in `campaign-report.hbs` for campaign start/end dates.

## Web page changes (`CampaignClaimReportPage.tsx`)

- Replace `year`/`month` state with `startDate`/`endDate` strings (`YYYY-MM-DD`), defaulting to the first/last day of the current month.
- Add `campaignId` state (default `''` = all).
- Fetch the campaign list via the existing `campaignService.getAll({ limit: 200 })` (already used elsewhere; no new backend list endpoint) and filter client-side to campaigns whose `vehicleModels` include the selected brand.
- Query key becomes `['campaign-claims', startDate, endDate, brand, campaignId]`; fetch `enabled` when `brand` is set and `startDate <= endDate`.
- Excel export filename and row-building logic are unchanged aside from the new filename period segment.

## Assumptions

- `startDate`/`endDate` are parsed as **local midnight** (`new Date(y, m-1, d)`), matching the existing month-boundary convention in this service — not UTC parsing, to avoid the timezone-shift class of bug already flagged in `[[project-interest-date-followups]]`.
- No minimum/maximum range length is enforced (a single-day range is valid).
- The campaign dropdown list is fetched unfiltered by date (a campaign that's ended can still be picked, since historical sales may still fall in the selected range).

## Testing

No changes to `buildCampaignClaimReport` or its existing unit tests (`campaign-claim-report.test.ts`) — the filter logic lives entirely in the Prisma query, one layer up. Verify via a live smoke test against the OrbStack DB (existing recipe): JSON report with a custom (non-calendar) range, with and without a `campaignId`, confirming rows/columns/totals narrow correctly; PDF renders the new period label; web page's date inputs and campaign dropdown drive the same query key correctly.

## Risks

- **Query param rename is a breaking change** to `/api/reports/campaign-claims` and `/api/pdf/campaign-claims`. Both known consumers (this page's on-screen fetch and its PDF-download button) are updated in the same change, so this is safe.
- **Campaign dropdown could grow long** if a brand has many campaigns over time. No pagination/search added now (YAGNI) — revisit if it becomes unwieldy in practice.
