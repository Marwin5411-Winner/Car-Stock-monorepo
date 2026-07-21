import { describe, expect, test } from 'bun:test';
import { applyFormulaStep, formulaSubsidyAmount, splitVat, sumCampaignSubsidies } from './index';

describe('splitVat', () => {
  test('returns zeros for gross = 0', () => {
    expect(splitVat(0)).toEqual({ net: 0, vat: 0, gross: 0 });
  });
  test('clamps negative gross to zero', () => {
    expect(splitVat(-100)).toEqual({ net: 0, vat: 0, gross: 0 });
  });
  test('matches Excel baseCost=466650', () => {
    const result = splitVat(466650);
    expect(result.net).toBe(436121.5);
    expect(result.vat).toBe(30528.5);
  });
  test('net + vat === gross', () => {
    for (const gross of [100, 999.99, 12345.67, 1_000_000, 7]) {
      const { net, vat } = splitVat(gross);
      expect(Math.round((net + vat) * 100) / 100).toBe(gross);
    }
  });
});

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
