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
