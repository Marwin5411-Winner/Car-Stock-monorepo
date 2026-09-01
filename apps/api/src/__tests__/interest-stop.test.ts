import { describe, expect, test } from 'bun:test';
import { resolveStopPeriodSource } from '../modules/interest/interest.stop';

const base = {
  activePeriod: null,
  periodCount: 0,
  debtStatus: 'ACTIVE',
  interestStartDate: new Date('2026-01-01'),
  stockAnnualRate: 3.35,
  stockPrincipalBase: 'BASE_COST_ONLY' as const,
  stockPrincipalAmount: 518_104,
};

describe('resolveStopPeriodSource', () => {
  test('closes the active period when one exists', () => {
    const source = resolveStopPeriodSource({
      ...base,
      periodCount: 2,
      activePeriod: {
        id: 'p1',
        startDate: new Date('2026-03-01'),
        annualRate: 4,
        principalBase: 'TOTAL_COST',
        principalAmount: 600_000,
        notes: 'old',
      },
    });
    expect(source).toEqual({
      existingPeriodId: 'p1',
      startDate: new Date('2026-03-01'),
      annualRate: 4,
      principalBase: 'TOTAL_COST',
      principalAmount: 600_000,
      notes: 'old',
    });
  });

  // The customer-reported bug: stopping a never-initialized car recorded nothing,
  // so history was empty and every report read 0 until you resumed and stopped again.
  test('materialises the implicit period when the stock has no period rows', () => {
    const source = resolveStopPeriodSource(base);
    expect(source).toEqual({
      existingPeriodId: null,
      startDate: new Date('2026-01-01'),
      annualRate: 3.35,
      principalBase: 'BASE_COST_ONLY',
      principalAmount: 518_104,
      notes: null,
    });
  });

  test('records nothing for paid-off debt, missing start date, or already-closed periods', () => {
    expect(resolveStopPeriodSource({ ...base, debtStatus: 'PAID_OFF' })).toBeNull();
    expect(resolveStopPeriodSource({ ...base, interestStartDate: null })).toBeNull();
    expect(resolveStopPeriodSource({ ...base, periodCount: 1 })).toBeNull();
  });
});
