import { describe, expect, test } from 'bun:test';
import { applyFormulaStep, formulaSubsidyAmount, sumCampaignSubsidies } from './index';

// Ground truth computed by hand, independent of the implementation.
describe('applyFormulaStep', () => {
  test('ADD adds the value', () => expect(applyFormulaStep(1000, 'ADD', 50)).toBe(1050));
  test('SUBTRACT subtracts the value', () => expect(applyFormulaStep(1000, 'SUBTRACT', 50)).toBe(950));
  test('MULTIPLY multiplies', () => expect(applyFormulaStep(1000, 'MULTIPLY', 1.5)).toBe(1500));
  test('PERCENT adds a percentage', () => expect(applyFormulaStep(1000, 'PERCENT', 5)).toBe(1050));
  test('PERCENT_SUBTRACT subtracts a percentage', () =>
    expect(applyFormulaStep(1000, 'PERCENT_SUBTRACT', 5)).toBe(950));
});

describe('formulaSubsidyAmount', () => {
  const bases = { cost: 500_000, selling: 700_000 };
  test('PERCENT is % of the chosen base (cost)', () =>
    expect(formulaSubsidyAmount('PERCENT', 1, 'COST_PRICE', bases)).toBe(5_000));
  test('PERCENT_SUBTRACT is also magnitude % of base (selling)', () =>
    expect(formulaSubsidyAmount('PERCENT_SUBTRACT', 2, 'SELLING_PRICE', bases)).toBe(14_000));
  test('FIXED is the flat value, base-independent', () =>
    expect(formulaSubsidyAmount('FIXED', 20_000, 'COST_PRICE', bases)).toBe(20_000));
  test('ADD/SUBTRACT are flat values too', () => {
    expect(formulaSubsidyAmount('ADD', 8_000, 'COST_PRICE', bases)).toBe(8_000);
    expect(formulaSubsidyAmount('SUBTRACT', 8_000, 'COST_PRICE', bases)).toBe(8_000);
  });
  test('MULTIPLY contributes nothing to a subsidy', () =>
    expect(formulaSubsidyAmount('MULTIPLY', 1.5, 'COST_PRICE', bases)).toBe(0));
});

describe('sumCampaignSubsidies', () => {
  test('sums independent rows: 1% + 2% of cost + FIXED 20,000 = 35,000', () => {
    const total = sumCampaignSubsidies(
      [
        { operator: 'PERCENT', value: 1, priceTarget: 'COST_PRICE' },
        { operator: 'PERCENT', value: 2, priceTarget: 'COST_PRICE' },
        { operator: 'FIXED', value: 20_000, priceTarget: 'COST_PRICE' },
      ],
      { cost: 500_000, selling: 700_000 }
    );
    expect(total).toBe(35_000);
  });
  test('empty list is 0', () =>
    expect(sumCampaignSubsidies([], { cost: 1, selling: 1 })).toBe(0));
});
