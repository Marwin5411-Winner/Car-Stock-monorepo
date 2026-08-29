import { describe, expect, test } from 'bun:test';
import {
  CREATE_STOCK_STATUSES,
  INTEREST_RATE_FRACTION_MAX,
  getManualStockStatusTargets,
  isManualStockStatusTransitionAllowed,
  percentToInterestRate,
} from '@car-stock/shared/constants';
import { CreateStockSchema } from '@car-stock/shared/schemas';
import { isNotesOnlyStockUpdate } from '../modules/stock/stock.service';

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

describe('CreateStockSchema interest and empty optionals', () => {
  test('accepts valid fraction interestRate', () => {
    const result = CreateStockSchema.parse({
      ...baseCreate,
      interestRate: percentToInterestRate(6.5),
    });
    expect(result.interestRate).toBe(0.065);
  });

  test('rejects interestRate above fraction max', () => {
    const parsed = CreateStockSchema.safeParse({ ...baseCreate, interestRate: 12 });
    expect(parsed.success).toBe(false);
  });

  test('accepts interestRate at fraction max boundary', () => {
    const result = CreateStockSchema.parse({
      ...baseCreate,
      interestRate: INTEREST_RATE_FRACTION_MAX,
    });
    expect(result.interestRate).toBe(INTEREST_RATE_FRACTION_MAX);
  });

  test('empty expectedSalePrice becomes undefined', () => {
    const result = CreateStockSchema.parse({
      ...baseCreate,
      expectedSalePrice: '',
    });
    expect(result.expectedSalePrice).toBeUndefined();
  });

  test('empty string dates are omitted (undefined)', () => {
    const result = CreateStockSchema.parse({
      ...baseCreate,
      orderDate: '',
      arrivalDate: '',
    });
    expect(result.orderDate).toBeUndefined();
    expect(result.arrivalDate).toBeUndefined();
  });

  test('null dates are omitted (undefined)', () => {
    const result = CreateStockSchema.parse({
      ...baseCreate,
      orderDate: null,
      arrivalDate: null,
    });
    expect(result.orderDate).toBeUndefined();
    expect(result.arrivalDate).toBeUndefined();
  });
});

describe('isNotesOnlyStockUpdate (SOLD stock may change notes)', () => {
  test('allows a notes-only payload, including empty string', () => {
    expect(isNotesOnlyStockUpdate({ notes: 'เบิกแคมเปญแล้ว' })).toBe(true);
    expect(isNotesOnlyStockUpdate({ notes: '' })).toBe(true);
  });

  test('rejects other fields, even alongside notes', () => {
    expect(isNotesOnlyStockUpdate({ baseCost: 1_000_000 })).toBe(false);
    expect(isNotesOnlyStockUpdate({ notes: 'x', exteriorColor: 'White' })).toBe(false);
    expect(isNotesOnlyStockUpdate({})).toBe(false);
  });
});
