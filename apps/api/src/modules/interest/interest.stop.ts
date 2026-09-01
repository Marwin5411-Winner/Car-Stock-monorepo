import type { InterestBase } from '@prisma/client';

/**
 * A stock is only given an InterestPeriod row once someone initializes / changes /
 * resumes its rate. Until then interest still accrues *implicitly* from
 * stock.interestRate since orderDate (or arrivalDate) — that is what the list and
 * every report show. Stopping such a stock therefore has to materialise that
 * implicit period as a closed one, otherwise the accrual silently disappears:
 * no history row, and 0 in every report.
 */
export type StopPeriodSource = {
  /** null = nothing on file yet, create a closed period instead of updating one */
  existingPeriodId: string | null;
  startDate: Date;
  annualRate: number; // percent per year
  principalBase: InterestBase;
  principalAmount: number;
  notes: string | null;
};

export function resolveStopPeriodSource(input: {
  activePeriod: {
    id: string;
    startDate: Date;
    annualRate: number;
    principalBase: InterestBase;
    principalAmount: number;
    notes: string | null;
  } | null;
  periodCount: number;
  debtStatus: string;
  interestStartDate: Date | null;
  stockAnnualRate: number; // percent per year
  stockPrincipalBase: InterestBase;
  stockPrincipalAmount: number;
}): StopPeriodSource | null {
  if (input.activePeriod) {
    const { id, ...rest } = input.activePeriod;
    return { existingPeriodId: id, ...rest };
  }

  // Same condition the list/report use to accrue interest without any period row.
  if (input.periodCount > 0 || input.debtStatus === 'PAID_OFF' || !input.interestStartDate) {
    return null;
  }

  return {
    existingPeriodId: null,
    startDate: input.interestStartDate,
    annualRate: input.stockAnnualRate,
    principalBase: input.stockPrincipalBase,
    principalAmount: input.stockPrincipalAmount,
    notes: null,
  };
}
