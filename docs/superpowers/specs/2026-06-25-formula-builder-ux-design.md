# Formula Builder UX Redesign — Design

**Date:** 2026-06-25
**Component:** `apps/web/src/components/campaigns/FormulaManager.tsx` (the per-vehicle-model campaign formula builder)
**Origin:** Customer (เฮียเหลียง) feedback round 2026-06-25, item #5/#6. The "no × multiply" / "can't type %" complaints turned out to be **UX confusion**, not missing features — the customer is elderly and finds the current form hard. Goal: make it dead-simple and clear, not add features.

## Problem

The current `FormulaForm` exposes 5 controls (ชื่อสูตร, เป้าหมายราคา dropdown, การกระทำ เพิ่ม/ลด dropdown, หน่วย ฿/%/× dropdown, ค่า) plus a text-only preview. The customer identified three concrete pains:

1. **Too many fields / split dropdowns** — `การกระทำ (เพิ่ม/ลด)` and `หน่วย (฿/%/×)` are two separate selects the user must mentally combine (e.g. "ลด" + "%" → −n%).
2. **No real-number result** — the preview reads "ลด 5% ของราคาขาย" but never shows the actual baht outcome.
3. **Don't know how to start** — a blank form with dropdowns is intimidating.

(Bigger fonts/buttons was explicitly *not* a primary pain.)

## Non-goals (YAGNI)

- No DB schema change. `operator` / `value` / `priceTarget` stay exactly as-is; the new UI maps onto the existing model.
- No change to the campaign report.
- No cumulative "final price after all formulas" chain total (possible later).
- No multiply/percent feature work — those already exist (v1.0.38+).

## Design (Approach B — natural-language sentence)

### 1. Sentence-style form (fixes pain #1)

Replace the two dropdowns (`การกระทำ` + `หน่วย`) with **one** plain-language "การกระทำ" dropdown, laid out as a readable Thai sentence:

```
ตั้งชื่อ:  [ ส่วนลดพิเศษ ]
   เอา [ ราคาขาย ▾ ]  มา  [ การกระทำ ▾ ]  [ 5 ] %
```

- Dropdown 1 = `priceTarget`: ราคาขาย (SELLING_PRICE) / ราคาทุน (COST_PRICE)
- Dropdown 2 = combined action, 5 plain options → existing operator:

  | ตัวเลือก (label) | operator |
  |---|---|
  | ลดเป็นเปอร์เซ็นต์ (%) | `PERCENT_SUBTRACT` |
  | เพิ่มเป็นเปอร์เซ็นต์ (%) | `PERCENT` |
  | ลดเป็นบาท (฿) | `SUBTRACT` |
  | เพิ่มเป็นบาท (฿) | `ADD` |
  | คูณด้วยตัวเลข (×) | `MULTIPLY` |

- The value field keeps the raw-text input behavior (already fixed in 4ac5bab — accepts decimals, can be cleared) with an auto unit suffix (% / ฿ / ×).

### 2. Real-number live preview (fixes pain #2)

Base = the vehicle model's actual price for the chosen target:
- ราคาขาย → `vehicleModel.price`
- ราคาทุน → `vehicleModel.standardCost` (**must be added to the payload** — see §5)

Show large, bold:
```
ราคาขาย 1,000,000  →  ลด 5% (−50,000)  →  เหลือ 950,000 บาท
```

The result is computed with the **shared** `applyFormulaStep` function (§5) so it never drifts from the backend. If the base price is missing (model has no price/standardCost set), show a gentle line instead of a number, e.g. "รุ่นนี้ยังไม่ได้ตั้งราคา{ขาย/ทุน} จึงยังไม่แสดงตัวอย่าง" — never crash or show NaN.

### 3. Presets + empty state + list rows (fixes pain #3)

- **Preset chips** above the form, prefilling it (name + target + action, value left blank). Basic set of 4, emphasizing % and × (customer mostly uses those):
  1. `ลดราคาขาย %` → SELLING_PRICE + PERCENT_SUBTRACT
  2. `เพิ่มราคาขาย %` → SELLING_PRICE + PERCENT
  3. `คูณราคาทุน ×` → COST_PRICE + MULTIPLY
  4. `ลดราคาทุน บาท` → COST_PRICE + SUBTRACT

  (Labels/targets are easy to tune once the customer's real formulas are known.)
- **Empty state:** prominent "➕ เพิ่มสูตรแรก" call to action.
- **Saved formula rows:** replace the terse `× 1.00` / `5%` display with plain language, e.g. `"ลด 5% ของราคาขาย"`, reusing the same phrasing logic as the preview.

### 4. Sizing

Comfortable (not tiny) text for the sentence and a clearly larger/bolder preview number. Low cost; helps the elderly user even though it wasn't the top pain.

## Architecture / units

- **`@car-stock/shared`** — new pure `applyFormulaStep(base: number, operator: FormulaOperator, value: number): number` implementing the 5 operators. Imported by:
  - API `campaign-formulas.service.ts` `calculateFormulaValue` (refactor to delegate — single source of truth)
  - Web `FormulaManager.tsx` (preview)
- **`FormulaManager.tsx`** — new pure helpers mapping the plain-language action ↔ `operator` (building on the existing `buildOperator` / `unitFromOperator`), plus a `describeFormula(operator, value, priceTarget)` → Thai phrase used by both the preview and the saved-row display.
- **Backend payload** — add `standardCost` to the `vehicleModel` select in `getById` and `getVehicleModels` (`campaigns.service.ts`), and to the `VehicleModelSummary` type (`apps/web/src/services/campaign.service.ts`).

## Data flow

`CampaignDetailPage` (getById → campaign.vehicleModels incl. price + standardCost) → `FormulaManager` (per model) → `FormulaForm`. Form state stays `CreateFormulaData { name, operator, value, priceTarget }`. Action dropdown reads/writes `operator` via the mapping helpers; preview computes `applyFormulaStep(base, operator, value)`.

## Testing (TDD)

Pure functions, unit-tested before implementation:
- `applyFormulaStep` — all 5 operators against hand-computed ground truth (mirrors existing `campaign-formula-percent-subtract.test.ts` style); covers the percent/multiply/baht cases.
- action ↔ operator mapping — round-trips for all 5 options.
- `describeFormula` — produces the expected Thai phrase per operator (incl. % vs ฿ vs ×).

Existing campaign formula tests must stay green after `calculateFormulaValue` delegates to the shared function.

## Risks

- `applyFormulaStep` refactor of the API service must preserve current numeric behavior (per-step rounding lives in `applyLoadedFormulas`, not the single step — keep that boundary). Guarded by existing + new tests.
- `standardCost` may be null for some models → preview fallback handles it.
