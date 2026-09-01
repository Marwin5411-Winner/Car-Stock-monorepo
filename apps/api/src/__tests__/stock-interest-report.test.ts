import { describe, expect, it } from 'bun:test';
import {
  type StockInterestStockInput,
  resolveStockInterestDisplay,
} from '../modules/interest/stock-interest-display';

const today = new Date(2026, 8, 1); // 1 Sep 2026 local

function stock(overrides: Partial<StockInterestStockInput> = {}): StockInterestStockInput {
  return {
    orderDate: new Date(2026, 0, 20),
    arrivalDate: new Date(2026, 0, 22),
    soldDate: null,
    stopInterestCalc: false,
    interestStoppedAt: null,
    debtStatus: 'ACTIVE',
    interestRate: 0.03,
    interestPrincipalBase: 'BASE_COST_ONLY',
    baseCost: 118_504,
    transportCost: 0,
    accessoryCost: 0,
    otherCosts: 0,
    interestPeriods: [],
    ...overrides,
  };
}

describe('resolveStockInterestDisplay', () => {
  it('uses orderDate and accrues to today when there are no periods', () => {
    const row = resolveStockInterestDisplay(stock(), today);
    expect(row.interestStartDate).toEqual(new Date(2026, 0, 20));
    expect(row.interestActionDate).toEqual(new Date(2026, 0, 20));
    expect(row.isCalculating).toBe(true);
    expect(row.daysCount).toBe(224);
    expect(row.currentRate).toBe(3);
    expect(row.principalAmount).toBe(118_504);
    expect(row.accumulatedInterest).toBeCloseTo(118_504 * (3 / 100 / 365) * 224, 6);
  });

  it('after resume, start date follows the new open period not orderDate', () => {
    const row = resolveStockInterestDisplay(
      stock({
        interestPeriods: [
          {
            startDate: new Date(2026, 0, 20),
            endDate: new Date(2026, 5, 1),
            annualRate: 3,
            principalBase: 'BASE_COST_ONLY',
            principalAmount: 118_504,
            calculatedInterest: 1000,
            daysCount: 132,
          },
          {
            startDate: new Date(2026, 7, 15),
            endDate: null,
            annualRate: 3.5,
            principalBase: 'BASE_COST_ONLY',
            principalAmount: 118_504,
            calculatedInterest: 0,
            daysCount: 0,
          },
        ],
      }),
      today
    );
    expect(row.interestStartDate).toEqual(new Date(2026, 7, 15));
    expect(row.interestActionDate).toEqual(new Date(2026, 7, 15));
    expect(row.isCalculating).toBe(true);
    expect(row.daysCount).toBe(17);
    expect(row.currentRate).toBe(3.5);
    expect(row.accumulatedInterest).toBeGreaterThan(1000);
  });

  it('when stopped, uses the last closed period for start/days and keeps closed interest', () => {
    const row = resolveStockInterestDisplay(
      stock({
        stopInterestCalc: true,
        interestStoppedAt: new Date(2026, 5, 1),
        interestPeriods: [
          {
            startDate: new Date(2026, 0, 20),
            endDate: new Date(2026, 5, 1),
            annualRate: 3,
            principalBase: 'BASE_COST_ONLY',
            principalAmount: 118_504,
            calculatedInterest: 4321.5,
            daysCount: 132,
          },
        ],
      }),
      today
    );
    expect(row.interestStartDate).toEqual(new Date(2026, 0, 20));
    expect(row.interestActionDate).toEqual(new Date(2026, 5, 1));
    expect(row.interestStoppedAt).toEqual(new Date(2026, 5, 1));
    expect(row.isCalculating).toBe(false);
    expect(row.daysCount).toBe(132);
    expect(row.currentRate).toBe(3);
    expect(row.accumulatedInterest).toBe(4321.5);
  });

  it('when several closed periods share a start date, uses the one that ended last', () => {
    const row = resolveStockInterestDisplay(
      stock({
        orderDate: null,
        arrivalDate: null,
        stopInterestCalc: true,
        interestStoppedAt: new Date(2026, 7, 27),
        interestPeriods: [
          {
            startDate: new Date(2026, 7, 17),
            endDate: new Date(2026, 7, 16),
            annualRate: 0,
            principalBase: 'BASE_COST_ONLY',
            principalAmount: 1_500_000,
            calculatedInterest: 0,
            daysCount: 1,
          },
          {
            startDate: new Date(2026, 7, 17),
            endDate: new Date(2026, 7, 27),
            annualRate: 2.5,
            principalBase: 'BASE_COST_ONLY',
            principalAmount: 1_500_000,
            calculatedInterest: 1027.4,
            daysCount: 10,
          },
        ],
      }),
      today
    );
    expect(row.interestStartDate).toEqual(new Date(2026, 7, 17));
    expect(row.interestActionDate).toEqual(new Date(2026, 7, 27));
    expect(row.isCalculating).toBe(false);
    expect(row.daysCount).toBe(10);
    expect(row.currentRate).toBe(2.5);
    expect(row.accumulatedInterest).toBe(1027.4);
  });

  it('uses the period start when orderDate and arrivalDate are missing', () => {
    const row = resolveStockInterestDisplay(
      stock({
        orderDate: null,
        arrivalDate: null,
        stopInterestCalc: true,
        interestStoppedAt: new Date(2026, 7, 20),
        interestPeriods: [
          {
            startDate: new Date(2026, 7, 1),
            endDate: new Date(2026, 7, 20),
            annualRate: 2.5,
            principalBase: 'TOTAL_COST',
            principalAmount: 200_000,
            calculatedInterest: 260,
            daysCount: 19,
          },
        ],
      }),
      today
    );
    expect(row.interestStartDate).toEqual(new Date(2026, 7, 1));
    expect(row.interestActionDate).toEqual(new Date(2026, 7, 20));
    expect(row.isCalculating).toBe(false);
    expect(row.daysCount).toBe(19);
    expect(row.currentRate).toBe(2.5);
    expect(row.accumulatedInterest).toBe(260);
  });
});
