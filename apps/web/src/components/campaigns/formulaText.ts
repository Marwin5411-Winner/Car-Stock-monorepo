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
  { operator: 'FIXED', label: 'จำนวนเงินตายตัว (฿)' },
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
    case 'FIXED':
      return `จำนวนเงินตายตัว ${n.toLocaleString('th-TH')} บาท`;
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
