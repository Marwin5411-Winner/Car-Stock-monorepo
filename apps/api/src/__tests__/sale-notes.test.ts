import { describe, expect, test } from 'bun:test';
import {
  isNotesOnlySaleUpdate,
  normalizeSharedNotes,
  pickSharedNotes,
  resolveReportStockNotes,
} from '../modules/sales/sale-notes';

describe('isNotesOnlySaleUpdate', () => {
  test('allows a notes-only payload, including empty string', () => {
    expect(isNotesOnlySaleUpdate({ notes: 'ลูกค้าขอสีดำ' })).toBe(true);
    expect(isNotesOnlySaleUpdate({ notes: '' })).toBe(true);
  });

  test('ignores keys that are undefined (controller fills optional fields)', () => {
    expect(isNotesOnlySaleUpdate({ notes: 'x', totalAmount: undefined })).toBe(true);
  });

  test('rejects other fields, even alongside notes', () => {
    expect(isNotesOnlySaleUpdate({ totalAmount: 1_000_000 })).toBe(false);
    expect(isNotesOnlySaleUpdate({ notes: 'x', deliveryDate: '2026-01-01' })).toBe(false);
    expect(isNotesOnlySaleUpdate({})).toBe(false);
  });
});

describe('shared notes helpers', () => {
  test('normalizeSharedNotes trims and treats blank as null', () => {
    expect(normalizeSharedNotes('  รอใบกำกับ  ')).toBe('รอใบกำกับ');
    expect(normalizeSharedNotes('')).toBe(null);
    expect(normalizeSharedNotes('   ')).toBe(null);
    expect(normalizeSharedNotes(null)).toBe(null);
  });

  test('pickSharedNotes prefers sale text, then stock', () => {
    expect(pickSharedNotes('จากขาย', 'จากสต็อก')).toBe('จากขาย');
    expect(pickSharedNotes('', 'จากสต็อก')).toBe('จากสต็อก');
    expect(pickSharedNotes(null, 'จากสต็อก')).toBe('จากสต็อก');
    expect(pickSharedNotes(null, '  ')).toBe(null);
  });

  test('PDF หมายเหตุ prefers stock, falls back to sale, else -', () => {
    expect(resolveReportStockNotes('จากสต็อก', 'จากขาย')).toBe('จากสต็อก');
    expect(resolveReportStockNotes(null, 'จากขาย')).toBe('จากขาย');
    expect(resolveReportStockNotes('  ', '')).toBe('-');
    expect(resolveReportStockNotes(undefined, undefined)).toBe('-');
  });
});
