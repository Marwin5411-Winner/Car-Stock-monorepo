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
