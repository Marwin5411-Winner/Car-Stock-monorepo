# Campaign Subsidy — Sum + Fixed-Amount Formulas → Sale Snapshot — Design

**Date:** 2026-06-25
**Origin:** Customer follow-up call (`transcript_2nd_cross_road_v2.txt`), items A1–A4 + the sales-page half of B5. Deeper than the formula-builder UX round ([`2026-06-25-formula-builder-ux-design.md`](2026-06-25-formula-builder-ux-design.md)) — this is a **calculation-model + data-model** change, not UX.

## Problem

The customer's real mental model of a campaign is **a sum of independent per-car subsidies**, e.g. for one vehicle model: `ทุน × 1% (ค่าการตลาด)` + `ทุน × 2% (รีเทล)` + `20,000 (ส่วนรถ, flat)` = **35,000 / คัน**. That per-car total should "pop up" on the sale when the model is sold.

Two gaps in the current editable formula engine (`CampaignModelFormula` + `applyLoadedFormulas`):

1. **It chains, not sums.** `applyLoadedFormulas` applies each formula to the *running* adjusted price (compounds in `sortOrder`), so multiple rows on the same `priceTarget` don't produce independent amounts that add up.
2. **No flat-amount ("ไม่ใช้สูตร") row.** Some subsidies are a fixed baht/car (e.g. ส่วนรถ 20,000), entered directly, not a % of any base. The five operators are all base-relative.
3. **The per-car total never reaches the sale.** `applyLoadedFormulas` is consumed only by the campaign-detail preview and the claim report's `baseCommission`. `sales.service` only links `campaignId` + validates the date window; it computes/stores no per-car campaign amount, so nothing shows on the sales page.

## Decisions (locked with the customer)

- **Keep the two campaign systems separate.** The hardcoded brand-claim buckets (`computeCampaignSubsidies` in `campaign-claim.helpers.ts`) and the claim report are **not touched**. This work only concerns the editable `CampaignModelFormula` → sale flow.
- **Snapshot the per-car total on the sale** at sale time (campaign is edited month-to-month, so past sales must not change retroactively — mirrors the existing `discountSnapshot` pattern).
- **MSRP = full selling price incl. VAT = the existing `SELLING_PRICE` base.** No new base enum, no `÷1.07`. (The `÷1.07` ex-VAT MSRP convention lives only in the separate claim-report buckets.)
- **Scope of this round:** sum + fixed-amount calc, snapshot on the sale, and read-only display on the sales page + a per-car total on the campaign detail. **B5** (showing the snapshot in the sales *report* and offsetting it against `carDiscount`) is a follow-up that rides on this snapshot.

## Non-goals (YAGNI)

- No change to `computeCampaignSubsidies`, the claim report, or `applyLoadedFormulas` (chain) — the claim report keeps its current `baseCommission` behavior.
- No new `MSRP` price-target enum (MSRP ≡ `SELLING_PRICE`).
- No sales-report column / `carDiscount` offset yet (that is B5).
- No rework of the just-shipped formula sentence-form UX; we only **add** a FIXED option and a total line.

## Approach (chosen)

**Add a new "subsidy sum" computation alongside the existing chain engine** rather than replacing it. The chain engine (`applyLoadedFormulas`) stays exactly as-is for the claim report; a new pure `sumCampaignSubsidies` powers the sale snapshot and the campaign-detail total.

**Consequence (documented intentionally):** one set of formula rows is interpreted two ways — **sum** for the per-car amount flowing to the sale, **chain** (unchanged) for the claim report's `baseCommission`. This is the accepted cost of keeping the claim report untouched. The rejected alternative (migrate everything to sum) would change the smoke-tested claim report and was declined.

## Architecture

### Schema (`apps/api/prisma/schema.prisma`)

- `enum FormulaOperator` gains **`FIXED`** — a flat baht/car subsidy; `value` is the amount, `priceTarget` is ignored.
- `model Sale` gains **`campaignSubsidySnapshot Decimal? @db.Decimal(15, 2) @map("campaign_subsidy_snapshot")`** — the per-car campaign total captured at sale create/update (null when the sale has no campaign).
- Requires a Prisma migration. Per `reference_local_db_smoke_test`, the remote DB is often down: write the schema + `db:generate` now; `db:migrate` applies when a DB is reachable.

### Shared pure functions (`@car-stock/shared/formulas`)

Single source of truth, imported by both the API (snapshot) and the web (preview) — same pattern as the existing `applyFormulaStep`.

```ts
// FormulaOperator type gains 'FIXED'.

/** Per-row subsidy amount (always a positive per-car amount). */
export function formulaSubsidyAmount(
  operator: FormulaOperator,
  value: number,
  priceTarget: FormulaPriceTarget,
  bases: { cost: number; selling: number }
): number;

/** Sum of every row's subsidy amount for one vehicle model. */
export function sumCampaignSubsidies(
  formulas: Array<{ operator: FormulaOperator; value: number; priceTarget: FormulaPriceTarget }>,
  bases: { cost: number; selling: number }
): number;
```

**operator → per-row amount** (confirmed with the customer):

| operator | amount |
|---|---|
| `PERCENT`, `PERCENT_SUBTRACT` | `base × value / 100` (base = cost or selling per `priceTarget`) |
| `FIXED`, `ADD`, `SUBTRACT` | `value` (flat baht) |
| `MULTIPLY` | `0` (not meaningful as a subsidy; hidden from the campaign UI) |

Rounding: each row rounded to 2dp, summed; total rounded to 2dp (mirror `applyLoadedFormulas`' `round2` discipline to avoid fractional-baht drift across many cars).

### API data flow (`apps/api/src/modules/sales/sales.service.ts`)

On **create** and **update**, after `campaignId` is resolved (whether user-picked or auto-tagged ~line 376):

1. If `campaignId` is null → `campaignSubsidySnapshot = null`.
2. Else load the campaign's formulas for the sale's vehicle model, then
   `snapshot = sumCampaignSubsidies(formulas, { cost: stock.baseCost, selling: vehicleModel.price })`.
3. Persist `campaignSubsidySnapshot`; include it in the sale read payload (with the existing `toNumber` coercion).

`selling` uses `vehicleModel.price` (the list price), not the negotiated sale price, so the amount shown on the sale equals the amount previewed on the campaign page. `cost` uses the actual car's `stock.baseCost`.

### Web

- **`formulaText.ts`** — add a `FIXED` entry to `OPERATOR_OPTIONS` ("จำนวนเงินตายตัว (฿)"); `operatorUnitSuffix('FIXED') = '฿'`; `describeFormula` renders e.g. "ส่วนรถ 20,000 บาท (ตายตัว)"; optionally a FIXED preset.
- **`FormulaManager.tsx`** — when `operator === 'FIXED'`, hide the price-target dropdown (no base). Add a **"ยอดรวมแคมเปญต่อคัน"** line under the rows = `sumCampaignSubsidies(rows, { cost: model.standardCost, selling: model.price })`. Existing per-row sentence UX unchanged.
- **Sales page (detail/form)** — show a read-only "แคมเปญคันนี้: {campaignSubsidySnapshot} บาท/คัน" once a campaign + model are present, read from the snapshot (form may show a live preview via the shared function before save).
- **Types** — `FormulaOperator` (web `campaign.service.ts`) gains `'FIXED'`; the sale type gains `campaignSubsidySnapshot?: string | number`.

## Data flow (end to end)

`CampaignModelFormula` rows (per model) → `sumCampaignSubsidies` →
 • campaign detail: "ยอดรวมต่อคัน" (bases = model `standardCost`/`price`)
 • sale create/update: snapshot (bases = `stock.baseCost`/`vehicleModel.price`) → `Sale.campaignSubsidySnapshot` → sales page display.
The claim report path (`applyLoadedFormulas` → `baseCommission`) is untouched.

## Testing (TDD)

Pure functions, test-first against hand-computed ground truth (mirrors `campaign-formula-percent-subtract.test.ts` style):

- `formulaSubsidyAmount` — one case per operator: `PERCENT`/`PERCENT_SUBTRACT` → `base×%`, `FIXED`/`ADD`/`SUBTRACT` → `value`, `MULTIPLY` → `0`; both `priceTarget` bases.
- `sumCampaignSubsidies` — the worked example: cost 500,000 with 1% + 2% + FIXED 20,000 = **35,000**; empty list → 0.
- Sale snapshot relies on the tested pure function; verified additionally via local-DB smoke test (campaign with mixed rows → sell the model → snapshot shows on the sale).

Existing tests stay green (claim report + chain engine untouched).

## Risks

- **Two interpretations of one formula set** (sum vs chain) — documented above; isolated because the claim report keeps its own path.
- **Migration timing** — DB often down; schema + generate now, migrate later (known pattern, `project_sale_expense_fields_followups`).
- **Snapshot staleness on edit** — recompute on every sale create/update so a changed stock/model/campaign re-snapshots; a completed sale's value then stays frozen against later monthly campaign edits (the desired behavior).
- **`MULTIPLY` rows** — silently contribute 0 to the subsidy sum; we hide `MULTIPLY` from the campaign formula UI so it can't be picked for a subsidy by mistake.
