# B5 — Campaign subsidy in the sales-summary report

**Date:** 2026-06-26
**Status:** Approved (design)
**Feature ID:** B5 (campaign feedback / 2nd cross-road follow-up)

## Problem

`Sale.campaignSubsidySnapshot` — the per-car campaign subsidy the brand
reimburses, frozen at sale create/update — already exists in the schema, is shown
on the sale detail page, and is summed in the campaign-claim report. It is **not**
yet visible in the sales-summary report (`สรุปยอดขายตามช่วงเวลา`).

The dealership wants the sales report to:
1. Show each sale's campaign subsidy.
2. Offset it against the car discount (`carDiscount`), which lives in the same
   "car" bucket as the subsidy (as opposed to the down-payment bucket), so the
   manager sees the **net** discount the dealership actually bore.
3. Reflect the subsidy as real money the dealership receives back, by raising
   net profit (`กำไรสุทธิ`).

## Why this is low-risk on the profit math

The report's selling price (`sale.totalAmount`) is already the **post-discount**
agreed price, and `netProfit` does not separately subtract `carDiscount`. So the
discount already lowered profit once (via a lower selling price). The subsidy is
genuinely new money flowing back, so folding it in is a clean single addition —
no double-subtraction. The net car-discount figure (`carDiscount − subsidy`) is a
**display** artifact for the manager; the profit change is just `+ subsidy`.

The subsidy also appears in the campaign-claim report, but that report is a
billing document (how much to invoice the brand). The sales report's `กำไรสุทธิ`
is the dealership's actual profitability. Both represent the same real cashflow,
counted once in each context — not double-counted.

## Scope

Surface area is small because the rich per-sale financial table exists **only in
the PDF**. The shared `SalesSummaryItem` type is a subset that omits
`discountAmount` / `netProfit` / `salesCommission`; those fields live on the
backend `saleItems` object and flow straight into Handlebars. The on-screen web
table renders only the per-salesperson breakdown, and the Excel export
(`toSaleExportRow`) shows only price/VAT/customer/status/amounts — neither shows
discount or profit today.

**In scope**

- `apps/api/src/modules/reports/reports.service.ts` — the sales-summary builder
  (`saleItems.map` + footer totals).
- `apps/api/src/modules/pdf/templates/sales-summary-report.hbs` — the PDF table.
- `apps/api/src/__tests__/sales-summary-report-fields.test.ts` — tests.

**Out of scope (deliberately)**

- Excel export and on-screen table — they don't show discount/profit, so they stay
  as-is. (Possible future follow-up if the customer asks.)
- `กำไรขั้นต้น` (gross profit, `totalAmount − totalCost`) — pre-subsidy by
  definition; unchanged.
- Shared types (`packages/shared/src/types/reports.ts`) — not required, since the
  PDF reads the backend object directly. Leave untouched unless a typed consumer
  is added later.

## Backend changes (`reports.service.ts`)

Inside the existing `saleItems.map((sale) => { ... })`:

```ts
const campaignSubsidy = toNumber(sale.campaignSubsidySnapshot) || 0;

// discountAmount is already computed: carDiscount ?? discountSnapshot ?? 0
const netCarDiscount = discountAmount - campaignSubsidy; // may be negative

// Existing netProfit gains + campaignSubsidy (brand reimbursement = real income)
const netProfit =
  sellingPrice - totalCostWithInterest
  + financeCommission - salesCommission - salesExpense
  + campaignSubsidy;
```

Add to the returned per-sale object:

- `campaignSubsidy` — the snapshot value (0 when null).
- `netCarDiscount` — `discountAmount − campaignSubsidy`.

Add to the footer totals block:

- `totalCampaignSubsidy = sumField('campaignSubsidy')`
- `totalNetCarDiscount = sumField('netCarDiscount')`

(`netProfit` and its existing `totalNetProfit` automatically include the subsidy.)

### Data treatment / edge cases

- **No campaign / historical sales (snapshot null)** → `campaignSubsidy = 0` →
  net discount equals the gross discount; net profit unchanged.
- **Subsidy > car discount** → `netCarDiscount` is negative. Show the real
  (negative) value; it represents genuine extra margin already in net profit.
- `campaignSubsidySnapshot` is frozen at sale create/update, so sales created
  before that feature existed have null → 0. Acceptable; no backfill.

## PDF changes (`sales-summary-report.hbs`)

- Insert a new `เงินสนับสนุน` column **immediately after** the `ส่วนลดตัวรถ`
  column (keeping the subsidy in the car bucket, per the customer's framing —
  not next to `แคมเปญขาย`).
- Reclaim ~4% width for the new column from the widest columns and update the
  `<colgroup>` so the table stays within A4 landscape (avoid right-edge clipping —
  see the known dense-table gotcha: the base layout's `th,td { font-size: 13px }`
  and `@page` double-margin both push wide tables off the printable area; cell
  `font-size` is already pinned at 8px here).
- In the `ส่วนลดตัวรถ` cell, render a muted `สุทธิ {{formatInt netCarDiscount}}`
  subline **only when `campaignSubsidy > 0`**, matching the existing stacked-cell
  style (customer/model, engine/chassis).
- Footer total row: add the `เงินสนับสนุน` total cell
  (`summary.totalCampaignSubsidy`), and show the net-discount total
  (`summary.totalNetCarDiscount`) as a muted subline under the `ส่วนลดตัวรถ`
  footer cell — mirroring the per-row treatment ("footer totals both").

Per-row cell sketch:

```
ราคารถ  | ส่วนลดตัวรถ  | เงินสนับสนุน | ... | กำไรสุทธิ
--------+-------------+-------------+-----+---------
850,000 | 20,000      | 15,000      | ... | 47,000
        | สุทธิ 5,000  |             |     | (incl. +15,000)
```

## Testing

Extend `apps/api/src/__tests__/sales-summary-report-fields.test.ts`:

1. Subsidy folds into `netProfit` (profit rises by exactly the subsidy).
2. `netCarDiscount = discountAmount − campaignSubsidy`.
3. Null snapshot → `campaignSubsidy = 0`, profit and net discount unaffected.
4. Subsidy > discount → negative `netCarDiscount`, profit still correct.
5. Footer totals: `totalCampaignSubsidy` and `totalNetCarDiscount` sum the rows.

Then render the PDF (local DB via OrbStack + self-minted ADMIN JWT, per the
local-smoke-test note) and visually confirm no right-edge clipping and that the
subline only appears on subsidised sales.

The report is already A4 landscape — keep it that way (reports default to
landscape).

## Verification checklist

- [ ] Net profit increases by the subsidy for a subsidised sale.
- [ ] Net car-discount column/subline shows `carDiscount − subsidy`.
- [ ] Non-campaign sale: no subline, no profit change.
- [ ] Footer totals correct for subsidy and net discount.
- [ ] PDF renders without clipping on A4 landscape.
- [ ] Unit tests pass.
