# Campaign Formulas → Per-Car Expense Line Items — Design

**Date:** 2026-06-26
**Component:** `apps/web/src/components/campaigns/FormulaManager.tsx` + `apps/web/src/components/campaigns/formulaText.ts` (campaign setup), `packages/shared/src/formulas/` (engine), `apps/api/src/modules/campaigns/campaign-formulas.service.ts`
**Origin:** Customer clarified the campaign "formula" system was implemented on the wrong mental model. It was built as a **price-transformation chain** (เพิ่ม/ลด/คูณ ราคา → ราคาสุดท้าย). It should be a list of **per-car expense line items** that are each computed from the sale or cost price (as a % or a fixed baht amount) and then **summed** into the amount to claim (เบิก) per car.

## The misunderstanding

The codebase currently holds **two contradictory models** in one feature:

1. **Price-transformation chain** — `applyFormulaStep` / `applyLoadedFormulas`. Starts from a price, applies operators *in order*, each step's output feeding the next, ending at one "adjusted price." Drives the campaign sales report (`campaigns.service.ts`), the claim PDF (`campaign-claim.helpers.ts`), and the `FormulaManager` preview ("→ เหลือ 950,000 บาท").
2. **Additive expense sum** — `formulaSubsidyAmount` / `sumCampaignSubsidies`. Each row independently computes a baht amount (% of a base, or a flat value); the rows are *summed*. Drives the `FormulaManager` footer total and the per-sale subsidy snapshot in the sales report.

The customer's requirement is model #2. The whole UI on top is built for model #1.

### Correct model

> For each car model in a campaign, define a list of **expense line items**. Each line takes **ราคาขาย or ราคาทุน** and computes a baht amount — either **% of that price** *or* a **fixed baht amount**. Sum every line → **ยอดที่ต้องเบิกต่อคัน**.
>
> Example: ราคาขาย 1,000,000 → "เปิดบูธ 1%" = 10,000 + "Marketing 5%" = 50,000 + "ค่าขนส่ง = 3,000 (คงที่)" → **รวมเบิก 63,000 / คัน**.

No increase/decrease/multiply; no chaining; order is irrelevant (addition is commutative).

## Scope

**In scope (this round):**
- Campaign setup screen (`FormulaManager`) becomes an expense-line-item editor.
- The shared engine becomes the single source of truth (already exists as the sum model).
- Repoint **all three** chain consumers to the sum engine so their per-car totals stay correct.

**Out of scope (agreed follow-up):**
- Itemizing each expense line as its own column in the campaign **claim PDF**. (The PDF total is kept correct; the breakdown is later.)

## Critical bug that makes the report repoint mandatory

`applyFormulaStep` (chain) has **no `FIXED` case** — it falls through to `default: return baseValue`. Under the chain engine a fixed-baht row therefore contributes **0** to the claim, and a `PERCENT` row *adds* to the price → produces a **negative** rebate. The instant a user creates the new expense rows, the chain-based reports would silently show wrong/zero/negative claim totals. So repointing the report totals to the sum engine is required correctness, not scope creep.

## Architecture / units

### Engine — `packages/shared/src/formulas/index.ts` (no DB migration)

- Keep the `CampaignModelFormula` table as-is (`name`, `operator`, `value`, `priceTarget`, `sortOrder`).
- **New rows write only two operators:**
  - `PERCENT` → "% ของราคา"; uses `priceTarget` (`SELLING_PRICE` / `COST_PRICE`) + `value` (percent).
  - `FIXED` → "จำนวนเงินคงที่"; uses `value` (baht); `priceTarget` ignored (store `SELLING_PRICE` default).
- **Legacy rows keep summing correctly** — `formulaSubsidyAmount` already maps every legacy operator to a sane expense amount (`PERCENT`/`PERCENT_SUBTRACT` → % of base; `FIXED`/`ADD`/`SUBTRACT` → flat; `MULTIPLY` → 0). No data cleanup.
- The sum engine (`formulaSubsidyAmount` per line, `sumCampaignSubsidies` for the total) is the single source of truth. Both already exist and are tested.
- Mark `applyFormulaStep` non-trivial use and `applyLoadedFormulas` **deprecated** once unreferenced; do not delete in this round (keeps the diff small and reversible).

### The three chain consumers → repointed to the sum engine

1. **`FormulaManager` preview (web).** Replace `applyFormulaStep` with `formulaSubsidyAmount`. The preview reads as an expense (`= 10,000 บาท`), not a "remaining price."
2. **`campaigns.service.ts` campaign sales report.** `rebatePerCar` = `sumCampaignSubsidies`; each `formulaResults[].resultValue` = that line's `formulaSubsidyAmount` (so the on-screen `CampaignReportPage` per-formula columns now read as that expense line). Deprecated fields `adjustedCostPrice` / `adjustedSellingPrice` / `costPriceDiff` / `sellingPriceDiff` → return originals / `0` (web does not render them; keep in payload to avoid breaking the response type).
3. **`campaign-claim.helpers.ts` claim PDF.** `baseCommission` = `sumCampaignSubsidies` (total only; per-line PDF columns are the follow-up).

### Setup screen — `FormulaManager.tsx` + `formulaText.ts`

- **"คิดจาก" — a 2-choice control** replaces the 5-option operator dropdown: `(•) % ของราคา` / `( ) จำนวนเงินคงที่`.
  - `%` → show the **ฐาน** toggle (`ราคาขาย` / `ราคาทุน`) + a percent field → writes `operator='PERCENT'`, `priceTarget`, `value`.
  - `คงที่` → show only a baht field → writes `operator='FIXED'`, `value`.
- **Per-row live preview is an expense:** `→ 1% ของราคาขาย 1,000,000 = 10,000 บาท`. Base = the model's list price (`vehicleModel.price`) / standard cost (`vehicleModel.standardCost`). Missing price → gentle "ยังไม่ได้ตั้งราคา…" line, never `NaN`.
- **Saved rows** each show their baht amount (via `formulaSubsidyAmount`); footer **"รวมต้องเบิกต่อคัน"** = `sumCampaignSubsidies` (already present — kept).
- **Section label / copy:** "สูตร" → **"รายการค่าใช้จ่ายแต่ละรายการต่อคัน"** in the UI. Code identifiers, API routes, and the DB stay `formula` (no rename churn).
- **Remove the up/down reorder arrows** (order no longer affects the math). Rows render in creation order. Leave the reorder API endpoint in place, unused.
- **Brand-standard presets** as quick-add chips, each pre-filling name + base + %: เปิดบูธ `0.5%` ราคาขาย, Marketing `1%` ราคาทุน, After Sales `0.25%` ราคาขาย, เป้าขาย `1%` ราคาทุน. (Values mirror `DEFAULT_SUBSIDY_RATES`; easy to tune. The user fills/edits the % and can delete chips that don't apply.)

### `formulaText.ts` rework

- Replace `OPERATOR_OPTIONS` (5 entries) with the 2-choice "คิดจาก" concept + the ฐาน toggle.
- `describeFormula(operator, value, priceTarget)` → "1% ของราคาขาย" / "จำนวนเงินคงที่"; used by the preview and the saved-row display.
- `FORMULA_PRESETS` → the brand-standard expense lines above.

## Data flow

`CampaignDetailPage` (getById → `campaign.vehicleModels` incl. `price` + `standardCost`) → `FormulaManager` (per model) → `FormulaForm`. Form state stays `CreateFormulaData { name, operator, value, priceTarget }`; the "คิดจาก"/ฐาน controls read & write `operator`/`priceTarget`. Preview + saved rows compute `formulaSubsidyAmount(operator, value, priceTarget, { cost: standardCost, selling: price })`; footer sums them. The per-actual-car claim continues to use the real per-unit cost (`stock.baseCost`) via the existing `computeSaleSubsidySnapshot`.

## Assumptions

- **Every line is a positive expense** (no negative / discount lines). If a "reduce the claim" line is ever needed, that's a future change.
- Setup-screen previews use the model's **list price / standard cost** for an estimate; the saved per-sold-car snapshot uses that car's **real cost** (`stock.baseCost`). This split already exists and is preserved.

## Testing (TDD — pure functions first)

- `formulaSubsidyAmount` — extend the existing tests: `PERCENT` of selling, `PERCENT` of cost, `FIXED` flat, and the legacy-operator mappings (regression).
- `sumCampaignSubsidies` — multi-line sum against the worked example (1% + 5% + fixed 3,000 on 1,000,000 → 63,000).
- New "คิดจาก"/ฐาน ↔ `operator`/`priceTarget` mapping — round-trips for both types.
- `describeFormula` — "1% ของราคาขาย" / "จำนวนเงินคงที่" phrasing.
- Existing campaign-formula tests must stay green after the three repoints.

## Risks

- **Report behavior change.** For the common legacy case (a single `PERCENT_SUBTRACT` of selling), the old `-sellingPriceDiff` already equals the new `sumCampaignSubsidies` contribution, so the visible number is unchanged. Divergence appears only for `ADD`/`PERCENT`/`MULTIPLY` rows — which are exactly the cases the chain mis-handled. Guard with the regression tests.
- **Deprecated payload fields.** Keep `adjusted*`/`*Diff` in the report response (filled with originals/0) so the web type and any external consumer don't break; remove in a later cleanup once confirmed unused.
