import { describe, expect, test } from 'bun:test';
import { normalizeCustomLines } from '../modules/sales/sale-finance-lines.helpers';

describe('normalizeCustomLines', () => {
  test('assigns custom keys and sortOrder', () => {
    const out = normalizeCustomLines([{ label: 'X', group: 'INFO', amount: 1 }]);
    expect(out[0].key.startsWith('custom:')).toBe(true);
    expect(out[0].key).toBe('custom:new-0');
    expect(out[0].sortOrder).toBe(0);
    expect(out[0].source).toBe('CUSTOM');
    expect(out[0].notes).toBeNull();
  });

  test('uses provided id for key and preserves sortOrder/notes', () => {
    const out = normalizeCustomLines([
      { id: 'abc123', label: 'ค่าขนส่ง', group: 'CUSTOMER_CHARGE', amount: 5_000, sortOrder: 3, notes: 'note' },
      { label: 'Other', group: 'DEALER', amount: 100 },
    ]);
    expect(out[0].key).toBe('custom:abc123');
    expect(out[0].sortOrder).toBe(3);
    expect(out[0].notes).toBe('note');
    expect(out[0].label).toBe('ค่าขนส่ง');
    expect(out[0].amount).toBe(5_000);
    expect(out[1].key).toBe('custom:new-1');
    expect(out[1].sortOrder).toBe(1);
  });

  test('returns empty array for empty input', () => {
    expect(normalizeCustomLines([])).toEqual([]);
  });
});
