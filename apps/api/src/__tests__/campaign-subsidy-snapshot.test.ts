import { describe, expect, test } from 'bun:test';
import { sumCampaignSubsidies } from '@car-stock/shared/formulas';

// Ground truth: the helper resolves cost = stock.baseCost, selling = vm.price,
// then sums. This locks the contract the DB helper must honor.
describe('sale campaign subsidy snapshot math', () => {
  test('marketing 1% + retail 2% of cost 500k + ส่วนรถ FIXED 20k = 35,000', () => {
    const formulas = [
      { operator: 'PERCENT' as const, value: 1, priceTarget: 'COST_PRICE' as const },
      { operator: 'PERCENT' as const, value: 2, priceTarget: 'COST_PRICE' as const },
      { operator: 'FIXED' as const, value: 20_000, priceTarget: 'COST_PRICE' as const },
    ];
    expect(sumCampaignSubsidies(formulas, { cost: 500_000, selling: 700_000 })).toBe(35_000);
  });
});
