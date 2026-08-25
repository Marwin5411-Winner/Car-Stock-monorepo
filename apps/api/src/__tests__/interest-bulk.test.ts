import { describe, expect, test } from 'bun:test';
import {
  assertBulkStockCount,
  buildInterestListWhere,
  classifyForApplyRate,
  classifyForStop,
  resolveBulkPrincipalBase,
  resolveBulkRate,
} from '../modules/interest/interest.bulk';

describe('classifyForStop', () => {
  test('applies to a calculating stock', () => {
    expect(
      classifyForStop({
        id: '1',
        vin: 'A',
        stopInterestCalc: false,
        debtStatus: 'ACTIVE',
      })
    ).toBe('apply');
  });

  test('skips already stopped and paid off', () => {
    expect(
      classifyForStop({
        id: '1',
        vin: 'A',
        stopInterestCalc: true,
        debtStatus: 'ACTIVE',
      })
    ).toBe('หยุดคิดดอกอยู่แล้ว');
    expect(
      classifyForStop({
        id: '1',
        vin: 'A',
        stopInterestCalc: false,
        debtStatus: 'PAID_OFF',
      })
    ).toBe('ปิดหนี้แล้ว');
  });
});

describe('classifyForApplyRate', () => {
  test('calculating → update, stopped → resume, paid off → skip', () => {
    expect(
      classifyForApplyRate({
        id: '1',
        vin: 'A',
        stopInterestCalc: false,
        debtStatus: 'ACTIVE',
      })
    ).toBe('update');
    expect(
      classifyForApplyRate({
        id: '1',
        vin: 'A',
        stopInterestCalc: true,
        debtStatus: 'ACTIVE',
      })
    ).toBe('resume');
    expect(
      classifyForApplyRate({
        id: '1',
        vin: 'A',
        stopInterestCalc: false,
        debtStatus: 'PAID_OFF',
      })
    ).toBe('ปิดหนี้แล้ว');
  });
});

describe('buildInterestListWhere', () => {
  test('calculating filter excludes paid-off and stopped', () => {
    const where = buildInterestListWhere({ isCalculating: true, status: 'AVAILABLE' });
    expect(where.deletedAt).toBeNull();
    expect(where.status).toBe('AVAILABLE');
    expect(where.stopInterestCalc).toBe(false);
    expect(where.debtStatus).toEqual({ not: 'PAID_OFF' });
  });

  test('search AND stopped filter do not overwrite each other', () => {
    const where = buildInterestListWhere({ search: 'VIN1', isCalculating: false });
    const and = where.AND;
    expect(Array.isArray(and)).toBe(true);
    const clauses = and as { OR?: unknown[] }[];
    expect(clauses.some((c) => JSON.stringify(c).includes('VIN1'))).toBe(true);
    expect(
      clauses.some(
        (c) =>
          JSON.stringify(c.OR) ===
          JSON.stringify([{ stopInterestCalc: true }, { debtStatus: 'PAID_OFF' }])
      )
    ).toBe(true);
    expect(where.OR).toBeUndefined();
  });

  test('search AND calculating filter keep both constraints', () => {
    const where = buildInterestListWhere({ search: 'VIN1', isCalculating: true });
    expect(where.stopInterestCalc).toBe(false);
    expect(where.debtStatus).toEqual({ not: 'PAID_OFF' });
    expect(JSON.stringify(where.AND)).toContain('VIN1');
  });
});

describe('assertBulkStockCount', () => {
  test('allows count at the limit and rejects above it', () => {
    expect(() => assertBulkStockCount(500)).not.toThrow();
    expect(() => assertBulkStockCount(501)).toThrow('ทำได้สูงสุด 500 คันต่อครั้ง');
  });
});

describe('resolveBulkRate', () => {
  test('per-row rate wins over shared rate', () => {
    expect(
      resolveBulkRate('s2', 5, [
        { stockId: 's1', annualRate: 3 },
        { stockId: 's2', annualRate: 7.5 },
      ])
    ).toBe(7.5);
  });

  test('falls back to shared annualRate', () => {
    expect(resolveBulkRate('s9', 6.25)).toBe(6.25);
  });
});

describe('resolveBulkPrincipalBase', () => {
  test('per-row base wins, else shared, else keep (undefined)', () => {
    expect(
      resolveBulkPrincipalBase('s2', 'BASE_COST_ONLY', [
        { stockId: 's2', principalBase: 'TOTAL_COST' },
      ])
    ).toBe('TOTAL_COST');
    expect(resolveBulkPrincipalBase('s1', 'TOTAL_COST')).toBe('TOTAL_COST');
    expect(resolveBulkPrincipalBase('s1')).toBeUndefined();
    expect(resolveBulkPrincipalBase('s1', 'KEEP')).toBeUndefined();
  });

  test('per-row KEEP wins over shared TOTAL_COST', () => {
    expect(
      resolveBulkPrincipalBase('s2', 'TOTAL_COST', [{ stockId: 's2', principalBase: 'KEEP' }])
    ).toBeUndefined();
  });
});
