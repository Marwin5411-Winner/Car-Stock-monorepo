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
