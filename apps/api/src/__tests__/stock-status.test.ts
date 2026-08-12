import { describe, expect, test } from 'bun:test';
import {
  CREATE_STOCK_STATUSES,
  getManualStockStatusTargets,
  isManualStockStatusTransitionAllowed,
} from '@car-stock/shared/constants';
import { CreateStockSchema } from '@car-stock/shared/schemas';

const baseCreate = {
  vin: 'TESTVIN1234567890',
  vehicleModelId: 'model-1',
  exteriorColor: 'White',
  baseCost: 1000000,
  transportCost: 0,
  accessoryCost: 0,
  otherCosts: 0,
  interestRate: 0,
  interestPrincipalBase: 'TOTAL_COST' as const,
};

describe('CreateStockSchema status', () => {
  test('defaults to AVAILABLE when status is omitted', () => {
    const result = CreateStockSchema.parse(baseCreate);
    expect(result.status).toBe('AVAILABLE');
  });

  test('accepts DEMO', () => {
    const result = CreateStockSchema.parse({ ...baseCreate, status: 'DEMO' });
    expect(result.status).toBe('DEMO');
  });

  test('accepts AVAILABLE', () => {
    const result = CreateStockSchema.parse({ ...baseCreate, status: 'AVAILABLE' });
    expect(result.status).toBe('AVAILABLE');
  });

  test('rejects RESERVED / PREPARING / SOLD on create', () => {
    for (const status of ['RESERVED', 'PREPARING', 'SOLD'] as const) {
      const parsed = CreateStockSchema.safeParse({ ...baseCreate, status });
      expect(parsed.success).toBe(false);
    }
  });

  test('CREATE_STOCK_STATUSES matches schema allow-list', () => {
    expect([...CREATE_STOCK_STATUSES]).toEqual(['AVAILABLE', 'DEMO']);
  });
});

describe('manual stock status transitions (shared policy)', () => {
  test('allows AVAILABLE <-> DEMO', () => {
    expect(isManualStockStatusTransitionAllowed('AVAILABLE', 'DEMO')).toBe(true);
    expect(isManualStockStatusTransitionAllowed('DEMO', 'AVAILABLE')).toBe(true);
  });

  test('allows no-op same status', () => {
    expect(isManualStockStatusTransitionAllowed('AVAILABLE', 'AVAILABLE')).toBe(true);
    expect(isManualStockStatusTransitionAllowed('DEMO', 'DEMO')).toBe(true);
  });

  test('rejects sales-lifecycle transitions', () => {
    expect(isManualStockStatusTransitionAllowed('AVAILABLE', 'RESERVED')).toBe(false);
    expect(isManualStockStatusTransitionAllowed('AVAILABLE', 'PREPARING')).toBe(false);
    expect(isManualStockStatusTransitionAllowed('AVAILABLE', 'SOLD')).toBe(false);
    expect(isManualStockStatusTransitionAllowed('RESERVED', 'AVAILABLE')).toBe(false);
    expect(isManualStockStatusTransitionAllowed('RESERVED', 'PREPARING')).toBe(false);
    expect(isManualStockStatusTransitionAllowed('PREPARING', 'SOLD')).toBe(false);
    expect(isManualStockStatusTransitionAllowed('PREPARING', 'RESERVED')).toBe(false);
    expect(isManualStockStatusTransitionAllowed('SOLD', 'AVAILABLE')).toBe(false);
    expect(isManualStockStatusTransitionAllowed('DEMO', 'RESERVED')).toBe(false);
  });

  test('getManualStockStatusTargets exposes only manual destinations', () => {
    expect(getManualStockStatusTargets('AVAILABLE')).toEqual(['DEMO']);
    expect(getManualStockStatusTargets('DEMO')).toEqual(['AVAILABLE']);
    expect(getManualStockStatusTargets('RESERVED')).toBeUndefined();
    expect(getManualStockStatusTargets('PREPARING')).toBeUndefined();
    expect(getManualStockStatusTargets('SOLD')).toBeUndefined();
  });
});
