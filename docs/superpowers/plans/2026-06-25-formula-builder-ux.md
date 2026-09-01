# Formula Builder UX Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the per-vehicle-model campaign formula builder (`FormulaManager.tsx`) simple and clear for an elderly user — one plain-language sentence form, a real-number live preview, and preset chips — without changing the data model.

**Architecture:** Extract the 5-operator math into a shared pure function (`@car-stock/shared/formulas`) so the API and the new web preview share one source of truth. Add pure web helpers (`formulaText.ts`) for operator↔label mapping, unit suffix, plain-Thai descriptions, and presets — all unit-tested. Rewrite the `FormulaForm` JSX to a sentence layout that binds directly to the existing `operator`/`priceTarget`/`value` state, and surface `standardCost` in the campaign payload so the preview can show real cost-price numbers.

**Tech Stack:** Bun (package manager + `bun test`), React 19 + Tailwind v4 (web), ElysiaJS + Prisma (api), Biome formatting, `@car-stock/shared` workspace package.

## Global Constraints

- **No DB schema change.** Reuse the existing `CampaignModelFormula` fields: `operator` ∈ {ADD, SUBTRACT, MULTIPLY, PERCENT, PERCENT_SUBTRACT}, `value`, `priceTarget` ∈ {COST_PRICE, SELLING_PRICE}.
- **Rounding boundary stays put.** `applyFormulaStep` is raw (no rounding); per-step 2-decimal rounding remains in `applyLoadedFormulas` only.
- **Biome style:** single quotes, semicolons, 2-space indent, 100-char width.
- **UI copy is Thai.** Match existing phrasing.
- **Tests run with `bun test <path>`.**
- **Branch first:** all work on `feat/formula-builder-ux` (we are on `main`). Commit messages end with the `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>` trailer.

---

### Task 0: Branch

- [ ] **Step 1: Create the feature branch**

Run:
```bash
git checkout -b feat/formula-builder-ux
```
Expected: switched to a new branch (carries the existing uncommitted #2/#3/#4 work along — that is intended; it gets committed separately when the user asks).

---

### Task 1: Shared `applyFormulaStep` (single source of truth)

**Files:**
- Create: `packages/shared/src/formulas/index.ts`
- Create (test): `packages/shared/src/formulas/index.test.ts`
- Modify: `packages/shared/package.json` (add `./formulas` export)

**Interfaces:**
- Produces: `applyFormulaStep(baseValue: number, operator: FormulaOperator, formulaValue: number): number`; `type FormulaOperator`; `type FormulaPriceTarget` — all importable from `@car-stock/shared/formulas`.

- [ ] **Step 1: Write the failing test**

Create `packages/shared/src/formulas/index.test.ts`:
```ts
import { describe, expect, test } from 'bun:test';
import { applyFormulaStep } from './index';

// Ground truth computed by hand, independent of the implementation.
describe('applyFormulaStep', () => {
  test('ADD adds the value', () => expect(applyFormulaStep(1000, 'ADD', 50)).toBe(1050));
  test('SUBTRACT subtracts the value', () => expect(applyFormulaStep(1000, 'SUBTRACT', 50)).toBe(950));
  test('MULTIPLY multiplies', () => expect(applyFormulaStep(1000, 'MULTIPLY', 1.5)).toBe(1500));
  test('PERCENT adds a percentage', () => expect(applyFormulaStep(1000, 'PERCENT', 5)).toBe(1050));
  test('PERCENT_SUBTRACT subtracts a percentage', () =>
    expect(applyFormulaStep(1000, 'PERCENT_SUBTRACT', 5)).toBe(950));
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test packages/shared/src/formulas/index.test.ts`
Expected: FAIL — `Cannot find module './index'`.

- [ ] **Step 3: Write the minimal implementation**

Create `packages/shared/src/formulas/index.ts`:
```ts
export type FormulaOperator = 'ADD' | 'SUBTRACT' | 'MULTIPLY' | 'PERCENT' | 'PERCENT_SUBTRACT';

export type FormulaPriceTarget = 'COST_PRICE' | 'SELLING_PRICE';

/**
 * Apply a single formula step to a base value. The five operators mirror the
 * CampaignModelFormula.operator enum. This is the single source of truth for
 * the math — both the API (campaign-formulas.service) and the web preview call
 * it, so they can never drift.
 *
 * No rounding here: per-step 2-decimal rounding is the caller's concern
 * (applyLoadedFormulas), and the preview wants exact intermediate values.
 */
export function applyFormulaStep(
  baseValue: number,
  operator: FormulaOperator,
  formulaValue: number
): number {
  switch (operator) {
    case 'ADD':
      return baseValue + formulaValue;
    case 'SUBTRACT':
      return baseValue - formulaValue;
    case 'MULTIPLY':
      return baseValue * formulaValue;
    case 'PERCENT':
      return baseValue + (baseValue * formulaValue) / 100;
    case 'PERCENT_SUBTRACT':
      return baseValue - (baseValue * formulaValue) / 100;
    default:
      return baseValue;
  }
}
```

- [ ] **Step 4: Add the subpath export**

In `packages/shared/package.json`, add to the `exports` object (after the `./constants` line):
```json
    "./constants": "./src/constants/index.ts",
    "./formulas": "./src/formulas/index.ts"
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `bun test packages/shared/src/formulas/index.test.ts`
Expected: PASS — 5 pass, 0 fail.

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/formulas/index.ts packages/shared/src/formulas/index.test.ts packages/shared/package.json
git commit -m "feat(shared): add applyFormulaStep — single source of truth for formula math

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: API delegates to the shared step

**Files:**
- Modify: `apps/api/src/modules/campaigns/campaign-formulas.service.ts` (`calculateFormulaValue`, ~lines 147-166; add import near line 1)

**Interfaces:**
- Consumes: `applyFormulaStep` from `@car-stock/shared/formulas`.
- Produces: unchanged public behavior of `campaignFormulasService.calculateFormulaValue` / `applyLoadedFormulas`.

- [ ] **Step 1: Confirm the existing regression tests pass first (baseline green)**

Run: `bun test apps/api/src/__tests__/campaign-formula-percent-subtract.test.ts apps/api/src/__tests__/campaign-claim-report.test.ts`
Expected: PASS (these are the guard for this refactor).

- [ ] **Step 2: Add the import**

At the top of `apps/api/src/modules/campaigns/campaign-formulas.service.ts`, add:
```ts
import { applyFormulaStep } from '@car-stock/shared/formulas';
```

- [ ] **Step 3: Delegate the body of `calculateFormulaValue`**

Replace the `switch` body of `calculateFormulaValue` (lines ~152-165) so the method reads:
```ts
  calculateFormulaValue(
    baseValue: number,
    operator: FormulaOperator,
    formulaValue: number
  ): number {
    return applyFormulaStep(baseValue, operator, formulaValue);
  }
```
(Leave `applyLoadedFormulas` unchanged — it still calls `this.calculateFormulaValue` and keeps its own `round2`.)

- [ ] **Step 4: Run the regression tests to verify they still pass**

Run: `bun test apps/api/src/__tests__/campaign-formula-percent-subtract.test.ts apps/api/src/__tests__/campaign-claim-report.test.ts`
Expected: PASS — same results as Step 1.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/campaigns/campaign-formulas.service.ts
git commit -m "refactor(campaigns): calculateFormulaValue delegates to shared applyFormulaStep

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Surface `standardCost` in the campaign payload

**Files:**
- Modify: `apps/api/src/modules/campaigns/campaigns.service.ts` (`getById` vehicleModel select ~line 155; `getVehicleModels` vehicleModel select ~line 503)
- Modify: `apps/web/src/services/campaign.service.ts` (`VehicleModelSummary`, ~lines 3-11)

**Interfaces:**
- Produces: `VehicleModelSummary.standardCost?: string | number` available to `FormulaManager` via `campaign.vehicleModels`.

- [ ] **Step 1: Add `standardCost` to the two API selects**

In `apps/api/src/modules/campaigns/campaigns.service.ts`, in the `getById` `vehicleModel` select, add `standardCost: true,` immediately after `price: true,`:
```ts
                year: true,
                price: true,
                standardCost: true,
```
Do the same in the `getVehicleModels` `vehicleModel` select (after its `price: true,`).

- [ ] **Step 2: Add `standardCost` to the web type**

In `apps/web/src/services/campaign.service.ts`, in `interface VehicleModelSummary`, after `price?: string | number;` add:
```ts
  price?: string | number;
  standardCost?: string | number;
```

- [ ] **Step 3: Verify web typecheck**

Run: `cd apps/web && bunx tsc -b`
Expected: exit 0 (no type errors).

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/modules/campaigns/campaigns.service.ts apps/web/src/services/campaign.service.ts
git commit -m "feat(campaigns): include standardCost in campaign vehicleModel payload

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Web formula text/preset helpers (pure, tested)

**Files:**
- Create: `apps/web/src/components/campaigns/formulaText.ts`
- Create (test): `apps/web/src/components/campaigns/formulaText.test.ts`

**Interfaces:**
- Consumes: `FormulaOperator`, `FormulaPriceTarget` from `@car-stock/shared/formulas`.
- Produces: `OPERATOR_OPTIONS`, `operatorUnitSuffix(op)`, `priceTargetLabel(t)`, `describeFormula(op, value, t)`, `FORMULA_PRESETS`.

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/components/campaigns/formulaText.test.ts`:
```ts
import { describe, expect, test } from 'bun:test';
import {
  OPERATOR_OPTIONS,
  operatorUnitSuffix,
  describeFormula,
  FORMULA_PRESETS,
} from './formulaText';

describe('formulaText', () => {
  test('OPERATOR_OPTIONS covers all five operators', () => {
    expect(OPERATOR_OPTIONS.map((o) => o.operator).sort()).toEqual([
      'ADD',
      'MULTIPLY',
      'PERCENT',
      'PERCENT_SUBTRACT',
      'SUBTRACT',
    ]);
  });

  test('unit suffix maps by operator', () => {
    expect(operatorUnitSuffix('PERCENT')).toBe('%');
    expect(operatorUnitSuffix('PERCENT_SUBTRACT')).toBe('%');
    expect(operatorUnitSuffix('MULTIPLY')).toBe('×');
    expect(operatorUnitSuffix('ADD')).toBe('฿');
    expect(operatorUnitSuffix('SUBTRACT')).toBe('฿');
  });

  test('describeFormula renders plain Thai per operator', () => {
    expect(describeFormula('PERCENT_SUBTRACT', 5, 'SELLING_PRICE')).toBe('ลด 5% ของราคาขาย');
    expect(describeFormula('PERCENT', 3, 'SELLING_PRICE')).toBe('เพิ่ม 3% ของราคาขาย');
    expect(describeFormula('MULTIPLY', 1.5, 'COST_PRICE')).toBe('คูณราคาทุนด้วย 1.5');
    expect(describeFormula('ADD', 8000, 'COST_PRICE')).toBe('เพิ่ม 8,000 บาท จากราคาทุน');
    expect(describeFormula('SUBTRACT', 15000, 'COST_PRICE')).toBe('ลด 15,000 บาท จากราคาทุน');
  });

  test('FORMULA_PRESETS has four entries with valid operators', () => {
    const ops = ['ADD', 'SUBTRACT', 'MULTIPLY', 'PERCENT', 'PERCENT_SUBTRACT'];
    expect(FORMULA_PRESETS).toHaveLength(4);
    for (const p of FORMULA_PRESETS) expect(ops).toContain(p.operator);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test apps/web/src/components/campaigns/formulaText.test.ts`
Expected: FAIL — `Cannot find module './formulaText'`.

- [ ] **Step 3: Write the implementation**

Create `apps/web/src/components/campaigns/formulaText.ts`:
```ts
import type { FormulaOperator, FormulaPriceTarget } from '@car-stock/shared/formulas';

export interface OperatorOption {
  operator: FormulaOperator;
  label: string;
}

// Ordered with the customer's common cases (% and ×) first.
export const OPERATOR_OPTIONS: OperatorOption[] = [
  { operator: 'PERCENT_SUBTRACT', label: 'ลดเป็นเปอร์เซ็นต์ (%)' },
  { operator: 'PERCENT', label: 'เพิ่มเป็นเปอร์เซ็นต์ (%)' },
  { operator: 'MULTIPLY', label: 'คูณด้วยตัวเลข (×)' },
  { operator: 'SUBTRACT', label: 'ลดเป็นบาท (฿)' },
  { operator: 'ADD', label: 'เพิ่มเป็นบาท (฿)' },
];

export function operatorUnitSuffix(operator: FormulaOperator): string {
  if (operator === 'PERCENT' || operator === 'PERCENT_SUBTRACT') return '%';
  if (operator === 'MULTIPLY') return '×';
  return '฿';
}

export function priceTargetLabel(priceTarget: FormulaPriceTarget): string {
  return priceTarget === 'COST_PRICE' ? 'ราคาทุน' : 'ราคาขาย';
}

/** Plain-language description, e.g. "ลด 5% ของราคาขาย". */
export function describeFormula(
  operator: FormulaOperator,
  value: number,
  priceTarget: FormulaPriceTarget
): string {
  const target = priceTargetLabel(priceTarget);
  const n = Number.isFinite(value) ? value : 0;
  switch (operator) {
    case 'PERCENT_SUBTRACT':
      return `ลด ${n}% ของ${target}`;
    case 'PERCENT':
      return `เพิ่ม ${n}% ของ${target}`;
    case 'MULTIPLY':
      return `คูณ${target}ด้วย ${n}`;
    case 'SUBTRACT':
      return `ลด ${n.toLocaleString('th-TH')} บาท จาก${target}`;
    case 'ADD':
      return `เพิ่ม ${n.toLocaleString('th-TH')} บาท จาก${target}`;
    default:
      return '';
  }
}

export interface FormulaPreset {
  label: string;
  operator: FormulaOperator;
  priceTarget: FormulaPriceTarget;
  defaultName: string;
}

// Basic 4-chip set, weighted toward % and × (the customer's common usage).
export const FORMULA_PRESETS: FormulaPreset[] = [
  { label: 'ลดราคาขาย %', operator: 'PERCENT_SUBTRACT', priceTarget: 'SELLING_PRICE', defaultName: 'ส่วนลด' },
  { label: 'เพิ่มราคาขาย %', operator: 'PERCENT', priceTarget: 'SELLING_PRICE', defaultName: 'ค่าคอม' },
  { label: 'คูณราคาทุน ×', operator: 'MULTIPLY', priceTarget: 'COST_PRICE', defaultName: 'คูณ' },
  { label: 'ลดราคาทุน บาท', operator: 'SUBTRACT', priceTarget: 'COST_PRICE', defaultName: 'ส่วนลดทุน' },
];
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun test apps/web/src/components/campaigns/formulaText.test.ts`
Expected: PASS — 4 pass, 0 fail.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/campaigns/formulaText.ts apps/web/src/components/campaigns/formulaText.test.ts
git commit -m "feat(campaigns): pure helpers for formula labels, descriptions, presets

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Rewrite `FormulaForm` — sentence layout + live preview

**Files:**
- Modify: `apps/web/src/components/campaigns/FormulaManager.tsx` (the `FormulaForm` component and the helper block at lines ~23-49; pass `vehicleModel` into both `FormulaForm` render sites)

**Interfaces:**
- Consumes: `OPERATOR_OPTIONS`, `operatorUnitSuffix`, `priceTargetLabel`, `describeFormula` (Task 4); `applyFormulaStep` (Task 1); `VehicleModelSummary.standardCost`/`price` (Task 3).
- Produces: unchanged `CreateFormulaData` write contract (still `{ name, operator, value, priceTarget }`).

- [ ] **Step 1: Replace the operator-helper block + imports**

At the top of `FormulaManager.tsx`, add imports:
```ts
import { applyFormulaStep } from '@car-stock/shared/formulas';
import {
  OPERATOR_OPTIONS,
  operatorUnitSuffix,
  priceTargetLabel,
  describeFormula,
  FORMULA_PRESETS,
} from './formulaText';
```
Delete the now-unused helpers `unitFromOperator`, `isSubtractOperator`, `buildOperator`, and the `FormulaUnit` type (lines ~31-49). Keep `operatorSymbols` and `isPercentOperator` (still used by list rows until Task 6) and `priceTargetLabels` may be removed in favor of `priceTargetLabel`.

- [ ] **Step 2: Give `FormulaForm` the model + rewrite its body**

Change the `FormulaFormProps` interface to add `vehicleModel: VehicleModelSummary;`, then replace the `FormulaForm` component implementation with:
```tsx
const FormulaForm: React.FC<FormulaFormProps> = ({
  formData,
  setFormData,
  onSubmit,
  onCancel,
  submitLabel,
  isPending,
  vehicleModel,
}) => {
  // Keep the value as raw text while typing so it can be cleared and accept
  // decimals (coercing on every keystroke makes the field stick at 0).
  const [valueText, setValueText] = useState(() =>
    Number.isFinite(formData.value) && formData.value !== 0 ? String(formData.value) : ''
  );

  const handleValueChange = (raw: string) => {
    if (raw !== '' && !/^\d*\.?\d*$/.test(raw)) return; // digits + one dot only
    setValueText(raw);
    const n = parseFloat(raw);
    setFormData((prev) => ({ ...prev, value: Number.isFinite(n) ? n : 0 }));
  };

  const suffix = operatorUnitSuffix(formData.operator);
  const targetLabel = priceTargetLabel(formData.priceTarget);
  const valNum = Number.isFinite(formData.value) ? formData.value : 0;

  // Real-number preview against the model's actual price for the chosen target.
  const base =
    formData.priceTarget === 'COST_PRICE'
      ? Number(vehicleModel.standardCost)
      : Number(vehicleModel.price);
  const hasBase = Number.isFinite(base) && base > 0;
  const result = hasBase ? applyFormulaStep(base, formData.operator, valNum) : 0;
  const delta = result - base;
  const fmt = (n: number) => n.toLocaleString('th-TH', { maximumFractionDigits: 2 });

  return (
    <div className="bg-gray-50 rounded-lg p-4 space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">ตั้งชื่อสูตร</label>
        <input
          type="text"
          value={formData.name}
          onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          placeholder="เช่น ส่วนลดพิเศษ, คอมมิชชั่นเพิ่ม"
        />
      </div>

      {/* Sentence row: เอา [ราคา] มา [การกระทำ] [ค่า] */}
      <div className="flex flex-wrap items-end gap-2 text-base">
        <span className="pb-2 text-gray-700">เอา</span>
        <select
          value={formData.priceTarget}
          onChange={(e) =>
            setFormData((prev) => ({ ...prev, priceTarget: e.target.value as FormulaPriceTarget }))
          }
          className="px-3 py-2 border border-gray-300 rounded-lg text-base focus:ring-2 focus:ring-blue-500"
        >
          <option value="SELLING_PRICE">ราคาขาย</option>
          <option value="COST_PRICE">ราคาทุน</option>
        </select>
        <span className="pb-2 text-gray-700">มา</span>
        <select
          value={formData.operator}
          onChange={(e) =>
            setFormData((prev) => ({ ...prev, operator: e.target.value as FormulaOperator }))
          }
          className="px-3 py-2 border border-gray-300 rounded-lg text-base focus:ring-2 focus:ring-blue-500"
        >
          {OPERATOR_OPTIONS.map((o) => (
            <option key={o.operator} value={o.operator}>
              {o.label}
            </option>
          ))}
        </select>
        <div className="relative">
          <input
            type="text"
            inputMode="decimal"
            value={valueText}
            onChange={(e) => handleValueChange(e.target.value)}
            className="w-28 px-3 py-2 pr-9 border border-gray-300 rounded-lg text-base focus:ring-2 focus:ring-blue-500"
            placeholder="0"
          />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-400 font-medium">
            {suffix}
          </span>
        </div>
      </div>

      {/* Real-number live preview */}
      <div className="rounded-lg bg-purple-50 px-4 py-3 text-purple-900">
        {hasBase ? (
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <span className="text-sm">{targetLabel}</span>
            <span className="font-semibold">{fmt(base)}</span>
            <span className="text-sm text-purple-700">
              → {describeFormula(formData.operator, valNum, formData.priceTarget)} ({delta >= 0 ? '+' : ''}
              {fmt(delta)}) →
            </span>
            <span className="text-lg font-bold">{fmt(result)} บาท</span>
          </div>
        ) : (
          <div className="text-sm text-purple-700">
            รุ่นนี้ยังไม่ได้ตั้ง{targetLabel} จึงยังไม่แสดงตัวอย่างเป็นตัวเลข
          </div>
        )}
      </div>

      <div className="flex gap-2 justify-end">
        <button
          onClick={onCancel}
          className="px-3 py-2 text-sm text-gray-600 hover:bg-gray-200 rounded-lg transition-colors"
        >
          <X className="w-4 h-4 inline mr-1" />
          ยกเลิก
        </button>
        <button
          onClick={onSubmit}
          disabled={!formData.name.trim() || isPending}
          className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          <Save className="w-4 h-4 inline mr-1" />
          {submitLabel}
        </button>
      </div>
    </div>
  );
};
```
Ensure `FormulaPriceTarget` and `FormulaOperator` remain imported from `'../../services/campaign.service'` (existing import) — they are structurally identical to the shared ones.

- [ ] **Step 3: Pass `vehicleModel` into both `FormulaForm` render sites**

In `FormulaManager`, the edit render (`editingId === formula.id`) and the add render (`isAdding`) each render `<FormulaForm ... />`. Add `vehicleModel={vehicleModel}` to both.

- [ ] **Step 4: Verify typecheck**

Run: `cd apps/web && bunx tsc -b`
Expected: exit 0. (If `priceTargetLabels` or `operatorSymbols` is now unused, remove it to satisfy the build.)

- [ ] **Step 5: Visual check (local DB)**

Per `reference_local_db_smoke_test`: start the scratch API on :3001 + `bun run dev` web, open a campaign detail page with a model that has a price, and confirm: one action dropdown (5 plain options), the value field accepts `%` input, and the preview shows real numbers (e.g. ราคาขาย → ลด 5% → result). Screenshot for the record.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/campaigns/FormulaManager.tsx
git commit -m "feat(campaigns): sentence-style formula form with real-number live preview

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Preset chips + empty state + plain-language saved rows

**Files:**
- Modify: `apps/web/src/components/campaigns/FormulaManager.tsx` (add presets above the add-form; empty-state CTA; saved-row description)

**Interfaces:**
- Consumes: `FORMULA_PRESETS`, `describeFormula` (Task 4).

- [ ] **Step 1: Add a `startWithPreset` handler + preset chips**

In `FormulaManager`, add a handler:
```tsx
  const startWithPreset = (preset: (typeof FORMULA_PRESETS)[number]) => {
    setEditingId(null);
    setIsAdding(true);
    setFormData({
      name: preset.defaultName,
      operator: preset.operator,
      value: 0,
      priceTarget: preset.priceTarget,
    });
  };
```
Render a chip row immediately above the add-form (inside the `{isAdding && (...)}` block, before `<FormulaForm .../>`, OR shown when `!isAdding && !editingId` as quick-starts). Use:
```tsx
<div className="flex flex-wrap gap-2 mb-1">
  <span className="text-xs text-gray-500 self-center">แนะนำ:</span>
  {FORMULA_PRESETS.map((p) => (
    <button
      key={p.label}
      onClick={() => startWithPreset(p)}
      className="px-3 py-1.5 text-sm rounded-full border border-purple-200 text-purple-700 bg-purple-50 hover:bg-purple-100 transition-colors"
    >
      {p.label}
    </button>
  ))}
</div>
```
Place this chip row in the section header area so it shows when not currently adding/editing (next to the "เพิ่มสูตร" button), giving a one-tap start.

- [ ] **Step 2: Strengthen the empty state**

Replace the empty-state block (currently the `ยังไม่มีสูตร — กดปุ่ม "เพิ่มสูตร" เพื่อเริ่มต้น` text) with a centered call-to-action button:
```tsx
{!isLoading && formulas.length === 0 && !isAdding && (
  <div className="text-center py-6">
    <p className="text-sm text-gray-500 mb-3">ยังไม่มีสูตรสำหรับรุ่นนี้</p>
    <button
      onClick={() => {
        setIsAdding(true);
        setEditingId(null);
        setFormData({ name: '', operator: 'PERCENT_SUBTRACT', value: 0, priceTarget: 'SELLING_PRICE' });
      }}
      className="inline-flex items-center gap-1 px-4 py-2 text-sm bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
    >
      <Plus className="w-4 h-4" />
      เพิ่มสูตรแรก
    </button>
  </div>
)}
```
(Note the default operator for a fresh add is now `PERCENT_SUBTRACT`, the most common case — also update the two other `setFormData({ ... operator: 'ADD' ... })` defaults to `'PERCENT_SUBTRACT'`.)

- [ ] **Step 3: Plain-language saved rows**

Replace the saved-row value display (the block rendering `operatorSymbols[formula.operator]` and the raw value, lines ~402-409) with:
```tsx
<div className="text-sm text-gray-700 mt-0.5">
  {describeFormula(formula.operator, formula.value, formula.priceTarget)}
</div>
```
If `operatorSymbols`/`isPercentOperator` become unused after this, remove them.

- [ ] **Step 4: Verify typecheck**

Run: `cd apps/web && bunx tsc -b`
Expected: exit 0.

- [ ] **Step 5: Visual check (local DB)**

Confirm: preset chips appear and one tap opens a pre-filled form; empty state shows the "เพิ่มสูตรแรก" button; saved rows read like "ลด 5% ของราคาขาย". Screenshot for the record.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/campaigns/FormulaManager.tsx
git commit -m "feat(campaigns): preset chips, clearer empty state, plain-language formula rows

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage:**
- Pain #1 (too many fields) → Task 5 (single action dropdown, sentence layout). ✓
- Pain #2 (no real number) → Task 1 + Task 5 (shared `applyFormulaStep` + live preview, with Task 3 supplying `standardCost`). ✓
- Pain #3 (don't know how to start) → Task 6 (preset chips + empty-state CTA). ✓
- Shared single source of truth → Task 1 + Task 2. ✓
- Plain-language saved rows → Task 6. ✓
- No DB change / reuse operator-value-priceTarget → honored throughout. ✓
- TDD on pure logic → Tasks 1 & 4 (test-first); UI tasks verified by typecheck + visual, logic they use is pre-tested. ✓

**Placeholder scan:** No TBD/TODO; every code step shows complete code. Preset labels are concrete (tunable later, not blocking). ✓

**Type consistency:** `applyFormulaStep(baseValue, operator, formulaValue)` used identically in Tasks 1, 2, 5. `describeFormula(operator, value, priceTarget)` used identically in Tasks 4 & 6. `FORMULA_PRESETS` shape (`label/operator/priceTarget/defaultName`) consumed as defined in Task 6. ✓
