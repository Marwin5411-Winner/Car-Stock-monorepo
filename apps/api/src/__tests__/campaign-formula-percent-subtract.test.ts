import { describe, expect, test } from 'bun:test';
import { campaignFormulasService } from '../modules/campaigns/campaign-formulas.service';

// Ground truth computed by hand, independent of the implementation:
//   PERCENT_SUBTRACT n on base  =>  base - base * n / 100
describe('campaign formula PERCENT_SUBTRACT operator', () => {
  test('calculateFormulaValue subtracts a percentage of the base', () => {
    // 1000 - (1000 * 5)/100 = 1000 - 50 = 950
    expect(campaignFormulasService.calculateFormulaValue(1000, 'PERCENT_SUBTRACT', 5)).toBe(950);
  });

  test('PERCENT (add) is unchanged — no regression', () => {
    // 1000 + (1000 * 5)/100 = 1050
    expect(campaignFormulasService.calculateFormulaValue(1000, 'PERCENT', 5)).toBe(1050);
  });

  test('applyLoadedFormulas reduces selling price by the percentage', () => {
    const applied = campaignFormulasService.applyLoadedFormulas(
      [
        {
          id: 'f1',
          name: 'ลด 5%',
          operator: 'PERCENT_SUBTRACT',
          value: 5,
          priceTarget: 'SELLING_PRICE',
          sortOrder: 0,
        },
      ],
      800_000, // cost
      1_000_000 // selling
    );
    // 1,000,000 - (1,000,000 * 5)/100 = 950,000
    expect(applied.adjustedSellingPrice).toBe(950_000);
    expect(applied.adjustedCostPrice).toBe(800_000); // untouched
    expect(applied.sellingPriceDiff).toBe(-50_000);
  });

  test('chained +10% then -5% compounds in order', () => {
    const applied = campaignFormulasService.applyLoadedFormulas(
      [
        { id: 'a', name: '+10%', operator: 'PERCENT', value: 10, priceTarget: 'SELLING_PRICE', sortOrder: 0 },
        { id: 'b', name: '-5%', operator: 'PERCENT_SUBTRACT', value: 5, priceTarget: 'SELLING_PRICE', sortOrder: 1 },
      ],
      0,
      1_000_000
    );
    // 1,000,000 +10% = 1,100,000 ; then -5% of 1,100,000 = 1,100,000 - 55,000 = 1,045,000
    expect(applied.adjustedSellingPrice).toBe(1_045_000);
  });
});
