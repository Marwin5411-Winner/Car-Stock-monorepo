import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { formatThaiDate, resolveThankYouLetterDate } from '../modules/pdf/helpers';

const here = dirname(fileURLToPath(import.meta.url));

// Maynie: วันที่สร้างรายการ 06/08/2026, วันที่ลูกค้ารับรถ 09/08/2026.
// Letter printed "11 สิงหาคม 2569" / "13 สิงหาคม 2569" — the print day, not pickup.
describe('resolveThankYouLetterDate — CARSTOCK01-20 pickup date, not print date', () => {
  const pickup = new Date(2026, 7, 9); // 9 Aug 2026 local
  const created = new Date(2026, 7, 6); // 6 Aug 2026 local

  test('uses วันที่รับรถ (deliveryDate) when set — 9 สิงหาคม 2569', () => {
    expect(resolveThankYouLetterDate(pickup, created)).toBe('9 สิงหาคม 2569');
  });

  test('does not use the print day when deliveryDate is set', () => {
    const printed = formatThaiDate(new Date(), 'full');
    const letterDate = resolveThankYouLetterDate(pickup, created);
    expect(letterDate).toBe('9 สิงหาคม 2569');
    expect(letterDate).not.toBe(printed);
  });

  test('falls back to วันที่สร้างรายการ (createdAt) when deliveryDate is missing', () => {
    expect(resolveThankYouLetterDate(null, created)).toBe('6 สิงหาคม 2569');
    expect(resolveThankYouLetterDate(undefined, created)).toBe('6 สิงหาคม 2569');
  });

  test('falls back to createdAt even when print day is later', () => {
    const printed = formatThaiDate(new Date(), 'full');
    const letterDate = resolveThankYouLetterDate(null, created);
    expect(letterDate).toBe('6 สิงหาคม 2569');
    expect(letterDate).not.toBe(printed);
  });
});

describe('thank-you letter controller wires pickup date, not new Date()', () => {
  const source = readFileSync(join(here, '../modules/pdf/pdf.controller.ts'), 'utf-8');
  const thankYouHandler = source.slice(
    source.indexOf("'/thank-you-letter/:saleId'"),
    source.indexOf("'/sales-confirmation/:saleId'"),
  );

  test('thank-you handler uses resolveThankYouLetterDate(deliveryDate, createdAt)', () => {
    expect(thankYouHandler).toContain('resolveThankYouLetterDate');
    expect(thankYouHandler).toMatch(
      /resolveThankYouLetterDate\(\s*sale\.deliveryDate\s*,\s*sale\.createdAt\s*\)/,
    );
  });

  test('thank-you handler does not stamp thaiDate from new Date()', () => {
    expect(thankYouHandler).not.toMatch(/formatThaiDate\(\s*new Date\(\)/);
  });
});
