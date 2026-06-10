/**
 * Mirror tests for the monthly sales report per-sale money mapping.
 *
 * Formula under test (spec: docs/superpowers/specs/2026-06-10-sale-expense-fields-design.md):
 *   netProfit = (sellingPrice − totalCostWithInterest)
 *             + financeCommission − salesCommission − salesExpense
 * Buyer-charged fees (insurance / พรบ / registration) are pass-through and
 * must NOT change netProfit. The logic mirrors getSalesSummaryReport in
 * apps/api/src/modules/reports/reports.service.ts — the assertions are the spec.
 */

import { describe, it, expect } from 'bun:test';

function computeNetProfit(input: {
  sellingPrice: number;
  totalCostWithInterest: number;
  financeCommission?: number | null;
  salesCommission?: number | null;
  salesExpense?: number | null;
}): number {
  return (
    input.sellingPrice -
    input.totalCostWithInterest +
    (input.financeCommission || 0) -
    (input.salesCommission || 0) -
    (input.salesExpense || 0)
  );
}

function computeTransportFee(input: {
  registrationFee?: number | null;
  compulsoryInsuranceFee?: number | null;
}): number {
  return (input.registrationFee || 0) + (input.compulsoryInsuranceFee || 0);
}

describe('monthly sales report — per-sale money mapping', () => {
  it('netProfit = gross profit + finance commission − staff commission − sales expense', () => {
    expect(
      computeNetProfit({
        sellingPrice: 1_000_000,
        totalCostWithInterest: 900_000,
        financeCommission: 15_000,
        salesCommission: 5_000,
        salesExpense: 3_000,
      })
    ).toBe(107_000);
  });

  it('null dealer-side fields behave as 0 (old sales)', () => {
    expect(
      computeNetProfit({
        sellingPrice: 1_000_000,
        totalCostWithInterest: 900_000,
        financeCommission: null,
        salesCommission: null,
        salesExpense: null,
      })
    ).toBe(100_000);
  });

  it('buyer-charged fees are pass-through — absent from netProfit inputs by design', () => {
    // The formula takes no insurance/registration argument at all; this test
    // documents the decision (spec §2) rather than guarding a code path.
    const base = computeNetProfit({ sellingPrice: 500_000, totalCostWithInterest: 450_000 });
    expect(base).toBe(50_000);
  });

  it('ทะเบียน/พรบ/ขนส่ง column = registrationFee + compulsoryInsuranceFee', () => {
    expect(computeTransportFee({ registrationFee: 2_400, compulsoryInsuranceFee: 600 })).toBe(3_000);
    expect(computeTransportFee({})).toBe(0);
  });
});
