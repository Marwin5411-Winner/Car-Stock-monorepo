import { describe, expect, it } from 'bun:test';
import { splitVat } from '../modules/reports/reports.service';

describe('splitVat', () => {
  it('returns zeros for gross = 0', () => {
    expect(splitVat(0)).toEqual({ net: 0, vat: 0, gross: 0 });
  });

  it('clamps negative gross to zero', () => {
    expect(splitVat(-100)).toEqual({ net: 0, vat: 0, gross: 0 });
  });

  it('matches Excel row 3 (baseCost=466650)', () => {
    const result = splitVat(466650);
    expect(result.net).toBe(436121.5);
    expect(result.vat).toBe(30528.5);
    expect(result.gross).toBe(466650);
  });

  it('matches Excel row 4 (baseCost=521000)', () => {
    const result = splitVat(521000);
    expect(result.net).toBe(486915.89);
    expect(result.vat).toBe(34084.11);
    expect(result.gross).toBe(521000);
  });

  it('net + vat === gross invariant holds for many values', () => {
    for (const gross of [100, 999.99, 12345.67, 1_000_000, 7]) {
      const { net, vat } = splitVat(gross);
      expect(Math.round((net + vat) * 100) / 100).toBe(gross);
    }
  });
});
