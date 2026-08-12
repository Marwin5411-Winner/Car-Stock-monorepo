import { describe, expect, test } from 'bun:test';
import { buildStockWritePayload, type StockFormFields } from './buildStockWritePayload';

const baseForm: StockFormFields = {
  vin: 'TESTVIN1234567890',
  engineNumber: '',
  motorNumber1: '',
  motorNumber2: '',
  vehicleModelId: 'model-1',
  exteriorColor: 'White',
  interiorColor: '',
  arrivalDate: '',
  orderDate: '',
  parkingSlot: '',
  baseCost: 1_500_000,
  transportCost: '',
  accessoryCost: 0,
  otherCosts: '',
  financeProvider: '',
  interestRate: 6.5,
  interestPrincipalBase: 'TOTAL_COST',
  expectedSalePrice: '',
  notes: '',
};

describe('buildStockWritePayload', () => {
  test('converts percent interest to API fraction', () => {
    const result = buildStockWritePayload(baseForm, { mode: 'create', createStatus: 'DEMO' });
    expect(result.ok).toBe(true);
    if (!result.ok || result.mode !== 'create') return;
    expect(result.data.interestRate).toBe(0.065);
    expect(result.data.status).toBe('DEMO');
    expect(result.data.transportCost).toBe(0);
    expect(result.data.otherCosts).toBe(0);
  });

  test('rejects interest percent above 100', () => {
    const result = buildStockWritePayload(
      { ...baseForm, interestRate: 150 },
      { mode: 'create' }
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.field).toBe('interestRate');
  });

  test('rejects empty baseCost instead of sending 0', () => {
    const result = buildStockWritePayload(
      { ...baseForm, baseCost: '' },
      { mode: 'create' }
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.field).toBe('baseCost');
  });

  test('omits empty dates (does not send null)', () => {
    const result = buildStockWritePayload(baseForm, { mode: 'create' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect('orderDate' in result.data).toBe(false);
    expect('arrivalDate' in result.data).toBe(false);
  });

  test('includes dates when provided', () => {
    const result = buildStockWritePayload(
      { ...baseForm, orderDate: '2026-08-01', arrivalDate: '2026-08-10' },
      { mode: 'edit' }
    );
    expect(result.ok).toBe(true);
    if (!result.ok || result.mode !== 'edit') return;
    expect(result.data.orderDate).toBeInstanceOf(Date);
    expect(result.data.arrivalDate).toBeInstanceOf(Date);
    expect('status' in result.data).toBe(false);
  });
});
