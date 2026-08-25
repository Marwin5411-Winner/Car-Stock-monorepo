import type { InterestMatchFilters, InterestSummary } from '../../services/interest.service';

export const BULK_INTEREST_CLIENT_LIMIT = 500;

export type PrincipalChoice = 'KEEP' | 'BASE_COST_ONLY' | 'TOTAL_COST';

export function isEntireFilteredLot(
  selectAllMatching: boolean,
  selectedCount: number,
  total: number
): boolean {
  return total > 0 && (selectAllMatching || selectedCount === total);
}

export function buildBulkScope(input: {
  selectAllMatching: boolean;
  matchFilters: InterestMatchFilters;
  excludedIds: string[];
  selectedIds: string[];
}): {
  stockIds?: string[];
  matchFilters?: InterestMatchFilters;
  excludeStockIds?: string[];
} {
  if (input.selectAllMatching) {
    return {
      matchFilters: input.matchFilters,
      excludeStockIds: input.excludedIds.length ? input.excludedIds : undefined,
    };
  }
  return { stockIds: input.selectedIds };
}

export function buildApplyRatePayload(input: {
  scope: ReturnType<typeof buildBulkScope>;
  notes?: string;
  effectiveDate?: string;
  rate: string;
  principalBase: PrincipalChoice;
  perRowRates: boolean;
  selectedItems: Record<string, InterestSummary>;
  selectedIds: string[];
  rowRates: Record<string, string>;
  rowBases: Record<string, PrincipalChoice>;
}) {
  const parsed = Number.parseFloat(input.rate);
  return {
    ...input.scope,
    notes: input.notes || undefined,
    effectiveDate: input.effectiveDate || undefined,
    annualRate: input.perRowRates || Number.isNaN(parsed) ? undefined : parsed,
    principalBase: input.principalBase,
    items: input.perRowRates
      ? Object.values(input.selectedItems)
          .filter((item) => input.selectedIds.includes(item.stockId))
          .map((item) => ({
            stockId: item.stockId,
            annualRate: Number.parseFloat(input.rowRates[item.stockId] || input.rate),
            principalBase: input.rowBases[item.stockId] ?? 'KEEP',
          }))
          .filter((item) => Number.isFinite(item.annualRate))
      : undefined,
  };
}
