import { describe, expect, test } from 'bun:test';
import type { InterestSummary } from '../../services/interest.service';
import {
  buildApplyRatePayload,
  buildBulkScope,
  isEntireFilteredLot,
} from './buildBulkInterestPayload';

const row = (stockId: string): InterestSummary =>
  ({
    stockId,
    vin: stockId,
    vehicleModel: { brand: 'A', model: 'B', variant: '', year: 2024 },
    currentRate: 2,
  }) as InterestSummary;

describe('isEntireFilteredLot', () => {
  test('true when select-all-matching or every filtered row is selected', () => {
    expect(isEntireFilteredLot(true, 10, 12)).toBe(true);
    expect(isEntireFilteredLot(false, 8, 8)).toBe(true);
    expect(isEntireFilteredLot(false, 2, 8)).toBe(false);
    expect(isEntireFilteredLot(false, 0, 0)).toBe(false);
  });
});

describe('buildBulkScope', () => {
  test('select-all-matching sends filters and optional excludes', () => {
    expect(
      buildBulkScope({
        selectAllMatching: true,
        matchFilters: { search: 'VIN1', isCalculating: false },
        excludedIds: ['a'],
        selectedIds: ['b'],
      })
    ).toEqual({
      matchFilters: { search: 'VIN1', isCalculating: false },
      excludeStockIds: ['a'],
    });
  });

  test('manual selection sends stockIds only', () => {
    expect(
      buildBulkScope({
        selectAllMatching: false,
        matchFilters: { search: 'VIN1' },
        excludedIds: ['a'],
        selectedIds: ['b', 'c'],
      })
    ).toEqual({ stockIds: ['b', 'c'] });
  });
});

describe('buildApplyRatePayload', () => {
  test('sends KEEP explicitly and per-row KEEP even when a shared base exists', () => {
    const payload = buildApplyRatePayload({
      scope: { stockIds: ['s1', 's2'] },
      notes: 'promo',
      effectiveDate: '2026-08-17',
      rate: '2.5',
      principalBase: 'TOTAL_COST',
      perRowRates: true,
      selectedItems: { s1: row('s1'), s2: row('s2') },
      selectedIds: ['s1', 's2'],
      rowRates: { s1: '3', s2: '4' },
      rowBases: { s1: 'KEEP', s2: 'BASE_COST_ONLY' },
    });
    expect(payload.principalBase).toBe('TOTAL_COST');
    expect(payload.items).toEqual([
      { stockId: 's1', annualRate: 3, principalBase: 'KEEP' },
      { stockId: 's2', annualRate: 4, principalBase: 'BASE_COST_ONLY' },
    ]);
  });
});
