import { describe, expect, test } from 'bun:test';
import { resolveSaleCarPrice, sumCustomCustomerCharges } from './resolve-sale-car-price';

describe('resolveSaleCarPrice', () => {
  test('stock selection wins over model list price', () => {
    expect(
      resolveSaleCarPrice({
        totalAmount: 769_900,
        vehicleModelPrice: 759_900,
        expectedSalePrice: 769_900,
      })
    ).toBe(769_900);
  });

  test('model selection uses vehicleModel.price via saved totalAmount', () => {
    expect(
      resolveSaleCarPrice({
        totalAmount: 759_900,
        vehicleModelPrice: 759_900,
        expectedSalePrice: 769_900,
      })
    ).toBe(759_900);
  });

  test('reconstructs list price after a car discount (stock source)', () => {
    expect(
      resolveSaleCarPrice({
        totalAmount: 749_900,
        carDiscount: 20_000,
        vehicleModelPrice: 759_900,
        expectedSalePrice: 769_900,
      })
    ).toBe(769_900);
  });

  test('regression: model list + discount does not double-count', () => {
    expect(
      resolveSaleCarPrice({
        totalAmount: 739_900,
        carDiscount: 20_000,
        vehicleModelPrice: 759_900,
      })
    ).toBe(759_900);
  });

  test('falls back to expectedSalePrice when model has no price', () => {
    expect(
      resolveSaleCarPrice({
        totalAmount: 0,
        vehicleModelPrice: null,
        expectedSalePrice: 769_900,
      })
    ).toBe(769_900);
    expect(
      resolveSaleCarPrice({
        vehicleModelPrice: 0,
        expectedSalePrice: 620_000,
      })
    ).toBe(620_000);
  });

  test('CUSTOMER_CHARGE is not included in ราคารถ', () => {
    expect(
      resolveSaleCarPrice({
        totalAmount: 774_900,
        customCustomerCharges: 5_000,
        vehicleModelPrice: 759_900,
        expectedSalePrice: 769_900,
      })
    ).toBe(769_900);
  });
});

describe('sumCustomCustomerCharges', () => {
  test('sums CUSTOMER_CHARGE lines only', () => {
    expect(
      sumCustomCustomerCharges([
        { group: 'CUSTOMER_CHARGE', amount: 5_000 },
        { group: 'DEALER', amount: 9_000 },
        { group: 'CUSTOMER_CHARGE', amount: '1500' },
      ])
    ).toBe(6_500);
  });

  test('empty / missing lines are 0', () => {
    expect(sumCustomCustomerCharges(undefined)).toBe(0);
    expect(sumCustomCustomerCharges([])).toBe(0);
  });
});
