import { describe, expect, test } from 'bun:test';
import {
  OPERATOR_OPTIONS,
  operatorUnitSuffix,
  describeFormula,
  FORMULA_PRESETS,
} from './formulaText';

describe('formulaText', () => {
  test('OPERATOR_OPTIONS covers all six operators', () => {
    expect(OPERATOR_OPTIONS.map((o) => o.operator).sort()).toEqual([
      'ADD',
      'FIXED',
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

  test('FIXED is offered and described without a base', () => {
    expect(OPERATOR_OPTIONS.map((o) => o.operator)).toContain('FIXED');
    expect(operatorUnitSuffix('FIXED')).toBe('฿');
    expect(describeFormula('FIXED', 20000, 'COST_PRICE')).toBe('จำนวนเงินตายตัว 20,000 บาท');
  });
});
