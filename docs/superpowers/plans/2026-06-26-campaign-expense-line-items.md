# Campaign Expense Line Items Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reframe campaign "formulas" from a price-transformation chain into additive per-car **expense line items** (each = % of ราคาขาย/ราคาทุน, or a fixed baht amount), summed into the amount to claim per car.

**Architecture:** The additive engine already exists and is tested (`formulaSubsidyAmount` / `sumCampaignSubsidies` in `@car-stock/shared/formulas`). This plan (1) locks that engine's contract, (2) rebuilds the campaign setup UI to write only the two clean operators and show each line's baht + the per-car total, and (3) repoints the three remaining chain consumers (campaign sales report, claim PDF, the editor preview) onto the sum engine so totals stay correct. No DB migration.

**Tech Stack:** Bun (runtime, test runner), TypeScript, React 19 + TanStack Query (web), ElysiaJS + Prisma (api), Biome (lint/format), shared package `@car-stock/shared/formulas`.

## Global Constraints

- **No DB migration / no Prisma schema change.** The `CampaignModelFormula` table and the `FormulaOperator` enum (which already includes `PERCENT` and `FIXED`) stay as-is.
- **New rows write only two operators:** `PERCENT` (with `priceTarget`) or `FIXED` (baht, `priceTarget` ignored — keep `SELLING_PRICE` as the stored default).
- **Legacy rows must keep summing correctly** via `formulaSubsidyAmount` (no data cleanup).
- **Every expense line is a positive amount** (no negative/discount lines).
- **Exact UI label:** `รายการค่าใช้จ่ายแต่ละรายการต่อคัน`.
- **Biome style:** single quotes, semicolons, 2-space indent, 100-char width.
- **Out of scope:** itemizing each expense line as its own column in the claim **PDF** (the PDF total is kept correct here; the breakdown is a separate follow-up).
- **Branch:** `feature/campaign-expense-line-items` (already created; the spec commit is its first commit).

## File Structure

| File | Responsibility | Change |
|---|---|---|
| `packages/shared/src/formulas/index.ts` | Expense-sum engine (single source of truth) | unchanged code; contract locked by new tests |
| `packages/shared/src/formulas/index.test.ts` | Engine contract tests | add worked-example + selling-base cases |
| `apps/web/src/components/campaigns/formulaText.ts` | Thai phrasing, operator↔kind mapping, presets | rewrite to the expense model |
| `apps/web/src/components/campaigns/formulaText.test.ts` | Phrasing/mapping/preset tests | rewrite to the expense model |
| `apps/web/src/components/campaigns/FormulaManager.tsx` | Campaign setup expense editor | rebuild (2-choice form, per-line baht, total, presets, no reorder) |
| `apps/api/src/modules/campaigns/campaigns.service.ts` | Campaign sales report data | repoint per-car math to the sum engine |
| `apps/api/src/modules/campaigns/campaigns.controller.ts` | Printable campaign report formatting | add `FIXED` symbol; expense-style percent display |
| `apps/api/src/modules/reports/campaign-claim.helpers.ts` | Claim PDF rows | repoint `baseCommission` to the sum engine |
| `apps/api/src/__tests__/campaign-claim-report.test.ts` | Claim report tests | add PERCENT/FIXED expense cases; rewrite no-stock case |
| `apps/api/src/modules/campaigns/campaign-formulas.service.ts` | Formula CRUD + chain helpers | mark chain helpers `@deprecated` |

---

## Task 1: Lock the expense-sum engine contract (shared)

The engine is already implemented and passing. These tests pin the exact contract — the worked example from the spec and a selling-side base — that every downstream repoint relies on. They pass immediately; that is intended (we are locking, not adding behavior).

**Files:**
- Test: `packages/shared/src/formulas/index.test.ts`

**Interfaces:**
- Consumes (already exist): `formulaSubsidyAmount(operator, value, priceTarget, { cost, selling }): number`, `sumCampaignSubsidies(formulas, { cost, selling }): number`.
- Produces: nothing new — confirms the contract for Tasks 3/4/5.

- [ ] **Step 1: Add the contract tests**

Append these tests inside `packages/shared/src/formulas/index.test.ts`, before the final closing line:

```ts
describe('expense-model contract (locks downstream repoints)', () => {
  test('PERCENT of SELLING_PRICE is % of selling', () =>
    expect(
      formulaSubsidyAmount('PERCENT', 1, 'SELLING_PRICE', { cost: 800_000, selling: 1_000_000 })
    ).toBe(10_000));

  test('worked example: 1% + 5% of selling + FIXED 3,000 = 63,000', () => {
    const total = sumCampaignSubsidies(
      [
        { operator: 'PERCENT', value: 1, priceTarget: 'SELLING_PRICE' },
        { operator: 'PERCENT', value: 5, priceTarget: 'SELLING_PRICE' },
        { operator: 'FIXED', value: 3_000, priceTarget: 'SELLING_PRICE' },
      ],
      { cost: 800_000, selling: 1_000_000 }
    );
    expect(total).toBe(63_000);
  });

  test('no cost base (cost=0): a cost-based PERCENT contributes 0', () =>
    expect(
      formulaSubsidyAmount('PERCENT', 1, 'COST_PRICE', { cost: 0, selling: 1_000_000 })
    ).toBe(0));
});
```

- [ ] **Step 2: Run the engine tests**

Run: `bun test packages/shared/src/formulas/index.test.ts`
Expected: PASS (engine already implements this; these tests lock the contract).

- [ ] **Step 3: Commit**

```bash
git add packages/shared/src/formulas/index.test.ts
git commit -m "test(shared): lock expense-sum engine contract (worked example + selling base)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Reframe `formulaText.ts` to the expense model (web)

Collapse the 5-operator vocabulary to the two expense kinds and the expense-style Thai phrasing, and replace the presets with the brand-standard expense lines.

**Files:**
- Modify: `apps/web/src/components/campaigns/formulaText.ts`
- Test: `apps/web/src/components/campaigns/formulaText.test.ts`

**Interfaces:**
- Produces (consumed by Task 3): `operatorToKind(op): 'PERCENT' | 'FIXED'`, `operatorUnitSuffix(op): string`, `priceTargetLabel(pt): string`, `describeFormula(op, value, pt): string`, `FORMULA_PRESETS: FormulaPreset[]` where `FormulaPreset = { label, operator, priceTarget, value, defaultName }`.

- [ ] **Step 1: Rewrite the test to the expense model**

Replace the entire contents of `apps/web/src/components/campaigns/formulaText.test.ts` with:

```ts
import { describe, expect, test } from 'bun:test';
import {
  operatorToKind,
  operatorUnitSuffix,
  describeFormula,
  FORMULA_PRESETS,
} from './formulaText';

describe('formulaText (expense model)', () => {
  test('operatorToKind maps percent operators to PERCENT, the rest to FIXED', () => {
    expect(operatorToKind('PERCENT')).toBe('PERCENT');
    expect(operatorToKind('PERCENT_SUBTRACT')).toBe('PERCENT');
    expect(operatorToKind('FIXED')).toBe('FIXED');
    expect(operatorToKind('ADD')).toBe('FIXED');
    expect(operatorToKind('SUBTRACT')).toBe('FIXED');
    expect(operatorToKind('MULTIPLY')).toBe('FIXED');
  });

  test('unit suffix is % for percent kinds, ฿ otherwise', () => {
    expect(operatorUnitSuffix('PERCENT')).toBe('%');
    expect(operatorUnitSuffix('PERCENT_SUBTRACT')).toBe('%');
    expect(operatorUnitSuffix('FIXED')).toBe('฿');
    expect(operatorUnitSuffix('ADD')).toBe('฿');
  });

  test('describeFormula renders expense phrasing', () => {
    expect(describeFormula('PERCENT', 1, 'SELLING_PRICE')).toBe('1% ของราคาขาย');
    expect(describeFormula('PERCENT_SUBTRACT', 5, 'SELLING_PRICE')).toBe('5% ของราคาขาย');
    expect(describeFormula('PERCENT', 2, 'COST_PRICE')).toBe('2% ของราคาทุน');
    expect(describeFormula('FIXED', 3000, 'SELLING_PRICE')).toBe('จำนวนเงินคงที่ 3,000 บาท');
    expect(describeFormula('SUBTRACT', 8000, 'COST_PRICE')).toBe('จำนวนเงินคงที่ 8,000 บาท');
    expect(describeFormula('MULTIPLY', 1.5, 'COST_PRICE')).toBe('ไม่คิดเป็นค่าใช้จ่าย');
  });

  test('FORMULA_PRESETS are four brand-standard PERCENT lines with default values', () => {
    expect(FORMULA_PRESETS).toHaveLength(4);
    for (const p of FORMULA_PRESETS) {
      expect(p.operator).toBe('PERCENT');
      expect(typeof p.value).toBe('number');
      expect(p.value).toBeGreaterThan(0);
      expect(['SELLING_PRICE', 'COST_PRICE']).toContain(p.priceTarget);
    }
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test apps/web/src/components/campaigns/formulaText.test.ts`
Expected: FAIL — `operatorToKind` is not exported; `FormulaPreset` has no `value`; phrasing differs.

- [ ] **Step 3: Rewrite `formulaText.ts`**

Replace the entire contents of `apps/web/src/components/campaigns/formulaText.ts` with:

```ts
import type { FormulaOperator, FormulaPriceTarget } from '@car-stock/shared/formulas';

/** The two expense kinds the new setup UI writes. */
export type ExpenseKind = 'PERCENT' | 'FIXED';

/**
 * Map any operator (incl. legacy rows) to its expense kind. Percent operators
 * are "% of a base"; everything else is treated as a flat baht amount, mirroring
 * how `formulaSubsidyAmount` interprets them.
 */
export function operatorToKind(operator: FormulaOperator): ExpenseKind {
  return operator === 'PERCENT' || operator === 'PERCENT_SUBTRACT' ? 'PERCENT' : 'FIXED';
}

export function operatorUnitSuffix(operator: FormulaOperator): string {
  return operatorToKind(operator) === 'PERCENT' ? '%' : '฿';
}

export function priceTargetLabel(priceTarget: FormulaPriceTarget): string {
  return priceTarget === 'COST_PRICE' ? 'ราคาทุน' : 'ราคาขาย';
}

/** Expense-model phrasing, e.g. "1% ของราคาขาย" or "จำนวนเงินคงที่ 3,000 บาท". */
export function describeFormula(
  operator: FormulaOperator,
  value: number,
  priceTarget: FormulaPriceTarget
): string {
  const n = Number.isFinite(value) ? value : 0;
  if (operator === 'MULTIPLY') return 'ไม่คิดเป็นค่าใช้จ่าย';
  if (operatorToKind(operator) === 'PERCENT') return `${n}% ของ${priceTargetLabel(priceTarget)}`;
  return `จำนวนเงินคงที่ ${n.toLocaleString('th-TH')} บาท`;
}

export interface FormulaPreset {
  label: string;
  operator: FormulaOperator; // always PERCENT for presets
  priceTarget: FormulaPriceTarget;
  value: number; // default percentage to prefill
  defaultName: string;
}

// Brand-standard expense lines (rates mirror the report's DEFAULT_SUBSIDY_RATES;
// the user edits the % and deletes chips that don't apply).
export const FORMULA_PRESETS: FormulaPreset[] = [
  { label: 'เปิดบูธ 0.5%', operator: 'PERCENT', priceTarget: 'SELLING_PRICE', value: 0.5, defaultName: 'เปิดบูธ' },
  { label: 'Marketing 1%', operator: 'PERCENT', priceTarget: 'COST_PRICE', value: 1, defaultName: 'Marketing' },
  { label: 'After Sales 0.25%', operator: 'PERCENT', priceTarget: 'SELLING_PRICE', value: 0.25, defaultName: 'After Sales' },
  { label: 'เป้าขาย 1%', operator: 'PERCENT', priceTarget: 'COST_PRICE', value: 1, defaultName: 'เป้าขาย' },
];
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun test apps/web/src/components/campaigns/formulaText.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/campaigns/formulaText.ts apps/web/src/components/campaigns/formulaText.test.ts
git commit -m "feat(web): formulaText speaks the expense model (kind, phrasing, presets)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Rebuild `FormulaManager` as the expense editor (web)

Replace the operator dropdown with the 2-choice "คิดจาก" + ฐาน controls, show each line's baht and the per-car total, drop the reorder arrows, and apply the new copy.

**Files:**
- Modify (full rewrite): `apps/web/src/components/campaigns/FormulaManager.tsx`

**Interfaces:**
- Consumes: `formulaSubsidyAmount`, `sumCampaignSubsidies` from `@car-stock/shared/formulas`; `operatorToKind`, `priceTargetLabel`, `describeFormula`, `FORMULA_PRESETS` from `./formulaText`; `campaignService` + types from `../../services/campaign.service`.
- Produces: the same component export (`FormulaManager`, default export). No prop changes.

- [ ] **Step 1: Replace the file**

Replace the entire contents of `apps/web/src/components/campaigns/FormulaManager.tsx` with:

```tsx
import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { campaignService } from '../../services/campaign.service';
import type {
  CampaignFormula,
  CreateFormulaData,
  VehicleModelSummary,
} from '../../services/campaign.service';
import { Plus, Trash2, Edit, Save, X, Calculator } from 'lucide-react';
import { formulaSubsidyAmount, sumCampaignSubsidies } from '@car-stock/shared/formulas';
import { FORMULA_PRESETS, priceTargetLabel, describeFormula, operatorToKind } from './formulaText';

const fmt = (n: number) => n.toLocaleString('th-TH', { maximumFractionDigits: 2 });

interface FormulaFormProps {
  formData: CreateFormulaData;
  setFormData: React.Dispatch<React.SetStateAction<CreateFormulaData>>;
  onSubmit: () => void;
  onCancel: () => void;
  submitLabel: string;
  isPending: boolean;
  vehicleModel: VehicleModelSummary;
}

const FormulaForm: React.FC<FormulaFormProps> = ({
  formData,
  setFormData,
  onSubmit,
  onCancel,
  submitLabel,
  isPending,
  vehicleModel,
}) => {
  // Keep the value as raw text while typing so it can be cleared and accept decimals.
  const [valueText, setValueText] = useState(() =>
    Number.isFinite(formData.value) && formData.value !== 0 ? String(formData.value) : ''
  );

  const handleValueChange = (raw: string) => {
    if (raw !== '' && !/^\d*\.?\d*$/.test(raw)) return; // digits + one dot only
    setValueText(raw);
    const n = parseFloat(raw);
    setFormData((prev) => ({ ...prev, value: Number.isFinite(n) ? n : 0 }));
  };

  const isPercent = operatorToKind(formData.operator) === 'PERCENT';
  const valNum = Number.isFinite(formData.value) ? formData.value : 0;

  const cost = Number(vehicleModel.standardCost);
  const selling = Number(vehicleModel.price);
  const base = formData.priceTarget === 'COST_PRICE' ? cost : selling;
  const hasBase = Number.isFinite(base) && base > 0;
  const amount = formulaSubsidyAmount(formData.operator, valNum, formData.priceTarget, {
    cost: Number.isFinite(cost) ? cost : 0,
    selling: Number.isFinite(selling) ? selling : 0,
  });

  // Radio group names must be unique per model so multiple open editors don't collide.
  const kindName = `kind-${vehicleModel.id}`;
  const baseName = `base-${vehicleModel.id}`;

  return (
    <div className="bg-gray-50 rounded-lg p-4 space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">ชื่อรายการ</label>
        <input
          type="text"
          value={formData.name}
          onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          placeholder="เช่น เปิดบูธ, Marketing, ค่าขนส่ง"
        />
      </div>

      {/* คิดจาก: % ของราคา หรือ จำนวนเงินคงที่ */}
      <div className="flex flex-wrap items-center gap-4 text-base">
        <span className="text-gray-700">คิดจาก:</span>
        <label className="inline-flex items-center gap-1.5 cursor-pointer">
          <input
            type="radio"
            name={kindName}
            checked={isPercent}
            onChange={() => setFormData((prev) => ({ ...prev, operator: 'PERCENT' }))}
          />
          <span>% ของราคา</span>
        </label>
        <label className="inline-flex items-center gap-1.5 cursor-pointer">
          <input
            type="radio"
            name={kindName}
            checked={!isPercent}
            onChange={() => setFormData((prev) => ({ ...prev, operator: 'FIXED' }))}
          />
          <span>จำนวนเงินคงที่</span>
        </label>
      </div>

      {/* ฐาน (เฉพาะแบบ %) */}
      {isPercent && (
        <div className="flex flex-wrap items-center gap-4 text-base">
          <span className="text-gray-700">ฐาน:</span>
          <label className="inline-flex items-center gap-1.5 cursor-pointer">
            <input
              type="radio"
              name={baseName}
              checked={formData.priceTarget === 'SELLING_PRICE'}
              onChange={() => setFormData((prev) => ({ ...prev, priceTarget: 'SELLING_PRICE' }))}
            />
            <span>ราคาขาย</span>
          </label>
          <label className="inline-flex items-center gap-1.5 cursor-pointer">
            <input
              type="radio"
              name={baseName}
              checked={formData.priceTarget === 'COST_PRICE'}
              onChange={() => setFormData((prev) => ({ ...prev, priceTarget: 'COST_PRICE' }))}
            />
            <span>ราคาทุน</span>
          </label>
        </div>
      )}

      {/* ค่า */}
      <div className="flex items-center gap-2">
        <span className="text-gray-700">{isPercent ? 'เปอร์เซ็นต์:' : 'จำนวนเงิน:'}</span>
        <div className="relative">
          <input
            type="text"
            inputMode="decimal"
            value={valueText}
            onChange={(e) => handleValueChange(e.target.value)}
            className="w-32 px-3 py-2 pr-9 border border-gray-300 rounded-lg text-base focus:ring-2 focus:ring-blue-500"
            placeholder="0"
          />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-400 font-medium">
            {isPercent ? '%' : '฿'}
          </span>
        </div>
      </div>

      {/* ตัวอย่างค่าใช้จ่ายต่อคัน */}
      <div className="rounded-lg bg-purple-50 px-4 py-3 text-purple-900">
        {!isPercent ? (
          <div className="flex flex-wrap items-baseline gap-x-2">
            <span className="text-sm text-purple-700">จำนวนเงินคงที่</span>
            <span className="text-lg font-bold">{fmt(valNum)} บาท</span>
          </div>
        ) : hasBase ? (
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <span className="text-sm">
              {valNum}% ของ{priceTargetLabel(formData.priceTarget)} {fmt(base)}
            </span>
            <span className="text-sm text-purple-700">=</span>
            <span className="text-lg font-bold">{fmt(amount)} บาท</span>
          </div>
        ) : (
          <div className="text-sm text-purple-700">
            รุ่นนี้ยังไม่ได้ตั้ง{priceTargetLabel(formData.priceTarget)} จึงยังไม่แสดงตัวอย่างเป็นตัวเลข
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

interface FormulaManagerProps {
  campaignId: string;
  vehicleModel: VehicleModelSummary;
}

const EMPTY_FORM: CreateFormulaData = {
  name: '',
  operator: 'PERCENT',
  value: 0,
  priceTarget: 'SELLING_PRICE',
};

export const FormulaManager: React.FC<FormulaManagerProps> = ({ campaignId, vehicleModel }) => {
  const queryClient = useQueryClient();
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<CreateFormulaData>(EMPTY_FORM);

  const queryKey = ['campaign-formulas', campaignId, vehicleModel.id];

  const { data: formulas = [], isLoading } = useQuery({
    queryKey,
    queryFn: () => campaignService.getFormulas(campaignId, vehicleModel.id),
  });

  const createMutation = useMutation({
    mutationFn: (data: CreateFormulaData) =>
      campaignService.createFormula(campaignId, vehicleModel.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      resetForm();
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<CreateFormulaData> }) =>
      campaignService.updateFormula(campaignId, vehicleModel.id, id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      setEditingId(null);
      resetForm();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (formulaId: string) =>
      campaignService.deleteFormula(campaignId, vehicleModel.id, formulaId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
    },
  });

  const resetForm = () => {
    setFormData(EMPTY_FORM);
    setIsAdding(false);
    setEditingId(null);
  };

  const handleCreate = () => {
    if (!formData.name.trim()) return;
    createMutation.mutate(formData);
  };

  const handleUpdate = (id: string) => {
    if (!formData.name.trim()) return;
    updateMutation.mutate({ id, data: formData });
  };

  const startEdit = (formula: CampaignFormula) => {
    setEditingId(formula.id);
    setIsAdding(false);
    setFormData({
      name: formula.name,
      operator: formula.operator,
      value: formula.value,
      priceTarget: formula.priceTarget,
    });
  };

  const startWithPreset = (preset: (typeof FORMULA_PRESETS)[number]) => {
    setEditingId(null);
    setIsAdding(true);
    setFormData({
      name: preset.defaultName,
      operator: preset.operator,
      value: preset.value,
      priceTarget: preset.priceTarget,
    });
  };

  const bases = {
    cost: Number(vehicleModel.standardCost) || 0,
    selling: Number(vehicleModel.price) || 0,
  };

  return (
    <div className="border border-gray-200 rounded-lg">
      <div className="flex items-center justify-between p-4 bg-gray-50 rounded-t-lg border-b">
        <div className="flex items-center gap-2">
          <Calculator className="w-5 h-5 text-purple-600" />
          <h3 className="font-medium text-gray-900">
            {vehicleModel.brand} {vehicleModel.model} {vehicleModel.variant || ''}
          </h3>
          <span className="text-xs text-gray-500 bg-gray-200 px-2 py-0.5 rounded-full">
            {formulas.length} รายการ
          </span>
        </div>
        {!isAdding && !editingId && (
          <button
            onClick={() => {
              setIsAdding(true);
              setEditingId(null);
              setFormData(EMPTY_FORM);
            }}
            className="flex items-center gap-1 px-3 py-1.5 text-sm bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
          >
            <Plus className="w-4 h-4" />
            เพิ่มรายการ
          </button>
        )}
      </div>

      <p className="px-4 pt-3 text-xs text-gray-500">รายการค่าใช้จ่ายแต่ละรายการต่อคัน</p>

      {!isAdding && !editingId && (
        <div className="flex flex-wrap gap-2 px-4 pt-2 pb-1">
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
      )}

      <div className="p-4 space-y-3">
        {isLoading && <div className="text-center text-sm text-gray-500 py-4">กำลังโหลด...</div>}

        {!isLoading && formulas.length === 0 && !isAdding && (
          <div className="text-center py-6">
            <p className="text-sm text-gray-500 mb-3">ยังไม่มีรายการค่าใช้จ่ายสำหรับรุ่นนี้</p>
            <button
              onClick={() => {
                setIsAdding(true);
                setEditingId(null);
                setFormData(EMPTY_FORM);
              }}
              className="inline-flex items-center gap-1 px-4 py-2 text-sm bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
            >
              <Plus className="w-4 h-4" />
              เพิ่มรายการแรก
            </button>
          </div>
        )}

        {formulas.map((formula) => (
          <div key={formula.id}>
            {editingId === formula.id ? (
              <FormulaForm
                formData={formData}
                setFormData={setFormData}
                onSubmit={() => handleUpdate(formula.id)}
                onCancel={resetForm}
                submitLabel="บันทึก"
                isPending={updateMutation.isPending}
                vehicleModel={vehicleModel}
              />
            ) : (
              <div className="flex items-center gap-3 p-3 bg-white border border-gray-200 rounded-lg hover:shadow-sm transition-shadow">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-gray-900 text-sm">{formula.name}</span>
                    {operatorToKind(formula.operator) === 'PERCENT' && (
                      <span
                        className={`px-2 py-0.5 text-xs rounded-full ${
                          formula.priceTarget === 'COST_PRICE'
                            ? 'bg-orange-100 text-orange-700'
                            : 'bg-blue-100 text-blue-700'
                        }`}
                      >
                        {priceTargetLabel(formula.priceTarget)}
                      </span>
                    )}
                  </div>
                  <div className="text-sm text-gray-700 mt-0.5">
                    {describeFormula(formula.operator, formula.value, formula.priceTarget)}
                  </div>
                </div>

                <div className="text-base font-semibold text-purple-700 whitespace-nowrap">
                  {fmt(formulaSubsidyAmount(formula.operator, formula.value, formula.priceTarget, bases))}{' '}
                  บาท
                </div>

                <div className="flex items-center gap-1">
                  <button
                    onClick={() => startEdit(formula)}
                    className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                  >
                    <Edit className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => {
                      if (confirm('ต้องการลบรายการนี้?')) {
                        deleteMutation.mutate(formula.id);
                      }
                    }}
                    disabled={deleteMutation.isPending}
                    className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}

        {formulas.length > 0 && (
          <div className="mt-2 flex items-baseline justify-between border-t border-gray-200 pt-2">
            <span className="text-sm text-gray-600">รวมต้องเบิกต่อคัน</span>
            <span className="text-lg font-bold text-purple-700">
              {fmt(
                sumCampaignSubsidies(
                  formulas.map((f) => ({
                    operator: f.operator,
                    value: f.value,
                    priceTarget: f.priceTarget,
                  })),
                  bases
                )
              )}{' '}
              บาท
            </span>
          </div>
        )}

        {isAdding && (
          <FormulaForm
            formData={formData}
            setFormData={setFormData}
            onSubmit={handleCreate}
            onCancel={resetForm}
            submitLabel="เพิ่ม"
            isPending={createMutation.isPending}
            vehicleModel={vehicleModel}
          />
        )}
      </div>
    </div>
  );
};

export default FormulaManager;
```

- [ ] **Step 2: Typecheck the web app**

Run: `cd apps/web && bunx tsc -b`
Expected: no errors. (Per project note, the web `tsc -b` is the safe typecheck; the API full `tsc` OOMs — do not run it.)

- [ ] **Step 3: Lint the changed files**

Run: `bunx biome check apps/web/src/components/campaigns/FormulaManager.tsx apps/web/src/components/campaigns/formulaText.ts`
Expected: no errors (auto-fix formatting with `--write` if Biome reports only formatting diffs, then re-run).

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/campaigns/FormulaManager.tsx
git commit -m "feat(web): campaign setup becomes a per-car expense line-item editor

2-choice คิดจาก (% ของราคา / จำนวนเงินคงที่) + ฐาน, per-line baht, รวมต้องเบิกต่อคัน,
brand-standard presets, reorder arrows removed.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Repoint the campaign sales report to the expense model (api)

The on-screen `CampaignReportPage` reads exactly two values: each `formulaResults[].resultValue` and `rebatePerCar`. Make `resultValue` each line's expense amount and `rebatePerCar` their sum. Neutralize the now-meaningless chain fields. Also teach the printable report's symbol map about `FIXED`/percent expense display.

**Files:**
- Modify: `apps/api/src/modules/campaigns/campaigns.service.ts` (import line 4; the per-sale block at lines ~947–1003)
- Modify: `apps/api/src/modules/campaigns/campaigns.controller.ts` (`OPERATOR_SYMBOLS`, lines 9–15)

**Interfaces:**
- Consumes: `formulaSubsidyAmount`, `sumCampaignSubsidies` from `@car-stock/shared/formulas`.
- Produces: report `saleReportItem` with `rebatePerCar = sumCampaignSubsidies(...)`, `formulaResults[].resultValue = formulaSubsidyAmount(...)`, and `adjustedCostPrice/adjustedSellingPrice` = originals, `costPriceDiff/sellingPriceDiff = 0`.

- [ ] **Step 1: Swap the import**

In `apps/api/src/modules/campaigns/campaigns.service.ts`, replace line 4:

```ts
import { campaignFormulasService } from './campaign-formulas.service';
```

with:

```ts
import { formulaSubsidyAmount, sumCampaignSubsidies } from '@car-stock/shared/formulas';
```

(`campaignFormulasService` is used nowhere else in this file — confirmed — so removing its import is safe.)

- [ ] **Step 2: Replace the per-sale computation block**

In the same file, replace this block (lines ~947–970, from the `// Get base prices` comment through the `const rebatePerCar = ...` line):

```ts
      // Get base prices
      const costPrice = sale.stock ? Number(sale.stock.baseCost) : 0;
      const sellingPrice = Number(vmInfo.vehicleModel.price);

      // Delegate to the shared formula engine so the report and any other
      // caller (analytics, future quotation preview, etc.) all compute the
      // same rebate from the same code path — no drift, no per-step
      // rounding mismatch.
      const applied = campaignFormulasService.applyLoadedFormulas(
        vmInfo.formulas,
        costPrice,
        sellingPrice
      );
      const adjustedCostPrice = applied.adjustedCostPrice;
      const adjustedSellingPrice = applied.adjustedSellingPrice;
      const formulaResults = applied.formulaResults;

      // Rebate per car = the supplier-owed amount the dealership claims.
      // Convention: when formulas REDUCE the cost/selling price (a typical
      // supplier incentive), the diff is negative; the rebate is its
      // negation so a positive number always means "supplier pays dealership".
      const costPriceDiff = applied.costPriceDiff;
      const sellingPriceDiff = applied.sellingPriceDiff;
      const rebatePerCar = -(costPriceDiff + sellingPriceDiff);
```

with:

```ts
      // Get base prices
      const costPrice = sale.stock ? Number(sale.stock.baseCost) : 0;
      const sellingPrice = Number(vmInfo.vehicleModel.price);

      // Per-car claim = the sum of independent expense line items (each a % of
      // the chosen base, or a flat baht amount). No chaining: each line stands
      // alone, computed by the shared sum engine so the editor, this report,
      // and the claim PDF never drift.
      const bases = { cost: costPrice, selling: sellingPrice };
      const formulaResults = vmInfo.formulas.map((f: any) => ({
        formulaId: f.id,
        name: f.name,
        operator: f.operator,
        value: Number(f.value),
        priceTarget: f.priceTarget,
        sortOrder: f.sortOrder,
        resultValue: formulaSubsidyAmount(f.operator, Number(f.value), f.priceTarget, bases),
      }));
      const rebatePerCar = sumCampaignSubsidies(
        vmInfo.formulas.map((f: any) => ({
          operator: f.operator,
          value: Number(f.value),
          priceTarget: f.priceTarget,
        })),
        bases
      );

      // Chain-era fields are no longer meaningful under the additive model;
      // keep them in the payload (web does not render them) as neutral values.
      const adjustedCostPrice = costPrice;
      const adjustedSellingPrice = sellingPrice;
      const costPriceDiff = 0;
      const sellingPriceDiff = 0;
```

(The `saleReportItem` object that follows already references `adjustedCostPrice`, `adjustedSellingPrice`, `costPriceDiff`, `sellingPriceDiff`, `rebatePerCar`, and `formulaResults` — leave it unchanged.)

- [ ] **Step 3: Teach the printable report's symbol map about the expense model**

In `apps/api/src/modules/campaigns/campaigns.controller.ts`, replace `OPERATOR_SYMBOLS` (lines 9–15):

```ts
const OPERATOR_SYMBOLS: Record<string, string> = {
  ADD: '+',
  SUBTRACT: '-',
  MULTIPLY: '×',
  PERCENT: '+',
  PERCENT_SUBTRACT: '-',
};
```

with:

```ts
// Expense model: percent rows show a bare "n%", fixed rows a bare baht amount.
// Legacy SUBTRACT keeps its minus sign for old rows.
const OPERATOR_SYMBOLS: Record<string, string> = {
  ADD: '',
  SUBTRACT: '-',
  MULTIPLY: '×',
  PERCENT: '',
  PERCENT_SUBTRACT: '',
  FIXED: '',
};
```

- [ ] **Step 4: Run the api test suite to confirm no regressions**

Run: `cd apps/api && bun test 2>&1 | tail -30`
Expected: all suites PASS — in particular `campaign-claim-report.test.ts`, `campaign-subsidy-snapshot.test.ts`, and `campaign-formula-percent-subtract.test.ts` stay green (this task does not touch the chain helpers they exercise).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/campaigns/campaigns.service.ts apps/api/src/modules/campaigns/campaigns.controller.ts
git commit -m "feat(api): campaign sales report reflects per-car expense sum

rebatePerCar = sumCampaignSubsidies; each formula column = its expense amount.
Chain-era adjusted/diff fields neutralized. Printable report symbol map gains FIXED.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Repoint the claim PDF `baseCommission` to the expense sum (api, TDD)

`buildCampaignClaimReport` is exported and tested, so this is test-first. The legacy `SUBTRACT`-based tests keep passing (a `SUBTRACT` row is a flat 10,000 expense under both models); only the no-stock case changes meaning and is rewritten to the new % semantics.

**Files:**
- Modify: `apps/api/src/modules/reports/campaign-claim.helpers.ts` (import line 2; the `baseCommission` block at lines ~178–196)
- Test: `apps/api/src/__tests__/campaign-claim-report.test.ts`

**Interfaces:**
- Consumes: `sumCampaignSubsidies` from `@car-stock/shared/formulas`.
- Produces: `ClaimRow.baseCommission = sumCampaignSubsidies(cvm.formulas, { cost, selling })`, where `cost = stock ? baseCost : 0`, `selling = vm.price`.

- [ ] **Step 1: Add a PERCENT/FIXED expense test and rewrite the no-stock test**

In `apps/api/src/__tests__/campaign-claim-report.test.ts`, add this test inside the `describe('buildCampaignClaimReport', ...)` block (e.g. right after the first test):

```ts
  test('baseCommission sums expense lines: % of selling + fixed baht', () => {
    const report = buildCampaignClaimReport([
      baseSale({
        carDiscount: 0,
        campaign: {
          id: 'camp1',
          name: 'Expense campaign',
          vehicleModels: [
            {
              vehicleModelId: 'vm1',
              formulas: [
                { id: 'p', name: 'Marketing', operator: 'PERCENT' as const, value: 1, priceTarget: 'SELLING_PRICE' as const, sortOrder: 1 },
                { id: 'f', name: 'ค่าขนส่ง', operator: 'FIXED' as const, value: 3000, priceTarget: 'SELLING_PRICE' as const, sortOrder: 2 },
              ],
            },
          ],
        },
      }),
    ]);
    // 1% of 500,000 = 5,000 + fixed 3,000 = 8,000
    expect(report.rows[0].baseCommission).toBe(8000);
    expect(report.rows[0].claimTotal).toBe(8000); // carDiscount 0
  });
```

Then **replace** the existing test `'sale without stock still gets selling-side rebate, cost-side dropped'` (lines ~147–185) with:

```ts
  test('no stock: cost-based % yields 0 (no cost base), selling-based % still counts', () => {
    const report = buildCampaignClaimReport([
      baseSale({
        carDiscount: 0,
        stock: null,
        campaign: {
          id: 'camp1',
          name: 'NETA Q2 Push',
          vehicleModels: [
            {
              vehicleModelId: 'vm1',
              formulas: [
                { id: 'c', name: 'Marketing', operator: 'PERCENT' as const, value: 1, priceTarget: 'COST_PRICE' as const, sortOrder: 1 },
                { id: 's', name: 'เปิดบูธ', operator: 'PERCENT' as const, value: 1, priceTarget: 'SELLING_PRICE' as const, sortOrder: 2 },
              ],
            },
          ],
        },
      }),
    ]);
    // no stock → cost base 0 → cost-based % = 0 ; selling 1% of 500,000 = 5,000
    expect(report.rows[0].baseCommission).toBe(5000);
    expect(report.rows[0].claimTotal).toBe(5000);
  });
```

- [ ] **Step 2: Run the claim test to verify the new cases fail**

Run: `bun test apps/api/src/__tests__/campaign-claim-report.test.ts`
Expected: FAIL — under the old chain, the PERCENT rows *add* to the price (negative rebate) and FIXED contributes 0, so `baseCommission` is not 8000/5000.

- [ ] **Step 3: Swap the import**

In `apps/api/src/modules/reports/campaign-claim.helpers.ts`, replace line 2:

```ts
import { campaignFormulasService } from '../campaigns/campaign-formulas.service';
```

with:

```ts
import { sumCampaignSubsidies } from '@car-stock/shared/formulas';
```

(`campaignFormulasService` is used only at the block below — confirmed — so removing its import is safe.)

- [ ] **Step 4: Replace the `baseCommission` computation**

Replace this block (lines ~178–196):

```ts
    // Commission = supplier rebate from the shared formula engine.
    let baseCommission = 0;
    const vmId = vm?.id ?? null;
    const cvm = vmId
      ? sale.campaign?.vehicleModels.find((m) => m.vehicleModelId === vmId)
      : undefined;
    if (cvm && cvm.formulas.length > 0 && vm) {
      const costPrice = sale.stock ? toNum(sale.stock.baseCost) : 0;
      const sellingPrice = toNum(vm.price);
      const applied = campaignFormulasService.applyLoadedFormulas(
        cvm.formulas,
        costPrice,
        sellingPrice
      );
      // Without a stock there is no real cost base, so a cost-side rebate is meaningless.
      baseCommission = sale.stock
        ? round2(-(applied.costPriceDiff + applied.sellingPriceDiff))
        : round2(-applied.sellingPriceDiff);
    }
```

with:

```ts
    // Commission = the sum of this model's per-car expense line items (each a
    // % of the chosen base, or a flat baht amount). Without a stock there is no
    // real cost base, so cost-based % lines resolve to 0 automatically.
    let baseCommission = 0;
    const vmId = vm?.id ?? null;
    const cvm = vmId
      ? sale.campaign?.vehicleModels.find((m) => m.vehicleModelId === vmId)
      : undefined;
    if (cvm && cvm.formulas.length > 0 && vm) {
      const bases = {
        cost: sale.stock ? toNum(sale.stock.baseCost) : 0,
        selling: toNum(vm.price),
      };
      baseCommission = sumCampaignSubsidies(
        cvm.formulas.map((f) => ({
          operator: f.operator,
          value: toNum(f.value),
          priceTarget: f.priceTarget,
        })),
        bases
      );
    }
```

- [ ] **Step 5: Run the claim test to verify it passes**

Run: `bun test apps/api/src/__tests__/campaign-claim-report.test.ts`
Expected: PASS — including the unchanged `SUBTRACT`-10000 tests (flat 10,000 under both models) and the subsidy-bucket tests.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/reports/campaign-claim.helpers.ts apps/api/src/__tests__/campaign-claim-report.test.ts
git commit -m "feat(api): claim PDF commission = per-car expense sum

baseCommission = sumCampaignSubsidies over the model's expense lines; no-stock
cost-based % resolves to 0. Legacy flat rows unchanged.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: Deprecate the chain helpers + full verification sweep

The chain functions are now used only by their own direct tests. Mark them deprecated (do not delete — keeps the diff small and their tests green) and run the whole verification sweep.

**Files:**
- Modify: `apps/api/src/modules/campaigns/campaign-formulas.service.ts` (JSDoc only, above `applyLoadedFormulas` ~line 166 and `applyFormulas` ~line 233)

**Interfaces:**
- No behavior change.

- [ ] **Step 1: Add deprecation notes**

In `apps/api/src/modules/campaigns/campaign-formulas.service.ts`, add a line to the top of the existing JSDoc for `applyLoadedFormulas` (the block starting `* Apply pre-loaded formulas ...`) and for `applyFormulas`:

For `applyLoadedFormulas`, insert as the first line inside its `/** ... */`:

```ts
   * @deprecated Price-chain model. Production now uses the additive expense
   * engine (`sumCampaignSubsidies`). Retained only for its direct unit tests.
```

For `applyFormulas`, insert as the first line inside its `/** ... */`:

```ts
   * @deprecated See applyLoadedFormulas — superseded by the expense-sum engine.
```

- [ ] **Step 2: Run every affected test suite**

Run each and confirm PASS:

```bash
bun test packages/shared/src/formulas/index.test.ts
bun test apps/web/src/components/campaigns/formulaText.test.ts
cd apps/api && bun test 2>&1 | tail -30
```

Expected: all green, including `campaign-claim-report.test.ts`, `campaign-subsidy-snapshot.test.ts`, `campaign-formula-percent-subtract.test.ts`.

- [ ] **Step 3: Typecheck + lint the web changes**

```bash
cd apps/web && bunx tsc -b
bunx biome check apps/web/src/components/campaigns/ apps/api/src/modules/campaigns/ apps/api/src/modules/reports/campaign-claim.helpers.ts
```

Expected: no errors. (Do not run the API full `tsc` — it OOMs; rely on `bun test` + Biome for the API.)

- [ ] **Step 4: Manual UI verification**

Start the app (`bun run dev`), open a campaign detail page with at least one vehicle model that has a list price and standard cost, and confirm in the expense editor:
- The "คิดจาก" (% ของราคา / จำนวนเงินคงที่) + ฐาน controls appear; no เพิ่ม/ลด/คูณ dropdown; no up/down arrows.
- A `% ของราคา` row previews `n% ของราคาขาย <base> = <amount> บาท`; a `จำนวนเงินคงที่` row previews `<amount> บาท`.
- Each saved row shows its baht; the footer reads `รวมต้องเบิกต่อคัน <sum> บาท` and matches the worked example when you enter 1% + 5% + fixed 3,000 on a 1,000,000 model (→ 63,000).
- The brand-standard preset chips (เปิดบูธ / Marketing / After Sales / เป้าขาย) prefill name + base + %.

Capture a screenshot for the record (Playwright MCP `browser_take_screenshot` or the dev tooling).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/campaigns/campaign-formulas.service.ts
git commit -m "chore(api): deprecate the price-chain formula helpers

Production now uses the additive expense-sum engine; the chain helpers remain
only for their direct unit tests.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-Review

**1. Spec coverage:**
- Additive model / two operators → Tasks 1–3. ✓
- No DB migration → Global Constraints + confirmed (enum + selects already exist). ✓
- Single source of truth (sum engine) → Task 1 locks it; Tasks 3–5 consume it. ✓
- Repoint all three chain consumers → Task 3 (preview), Task 4 (sales report), Task 5 (claim PDF). ✓
- FIXED-less chain bug (why repoint is mandatory) → Task 5 red step demonstrates it. ✓
- Setup UI: 2-choice + ฐาน, per-row expense preview, footer total, label `รายการค่าใช้จ่ายแต่ละรายการต่อคัน`, reorder removed, brand presets → Task 3. ✓
- Deferred: claim-PDF per-line columns → explicitly out of scope (Global Constraints); Task 4/5 keep totals only. ✓
- Deprecate chain functions, no delete → Task 6. ✓
- TDD on pure functions + existing tests stay green → Tasks 1, 2, 5; Tasks 4 & 6 run the suites. ✓
- Positive-only expense assumption → Global Constraints. ✓

**2. Placeholder scan:** No TBD/TODO; every code step shows complete code; every command has expected output. The `(f: any)` casts in Task 4 match the existing file's style (`sale`/`f` are loosely typed Prisma results there). ✓

**3. Type consistency:** `operatorToKind`, `operatorUnitSuffix`, `describeFormula`, `priceTargetLabel`, `FORMULA_PRESETS` (with `value`) are defined in Task 2 and consumed with the same names/signatures in Task 3. `formulaSubsidyAmount(operator, value, priceTarget, { cost, selling })` and `sumCampaignSubsidies(formulas, { cost, selling })` are used identically in Tasks 1, 3, 4, 5. `FormulaManager` keeps its export name and props. Report fields (`rebatePerCar`, `formulaResults[].resultValue`, `adjusted*`, `*Diff`) match the existing `CampaignReportSaleItem` type, so no web service-type change is needed. ✓
