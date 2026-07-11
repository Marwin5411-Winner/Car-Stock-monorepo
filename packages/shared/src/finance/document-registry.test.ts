import { describe, expect, test } from 'bun:test';
import { SYSTEM_ROW_CATALOG } from './catalog';
import { FINANCE_DOCUMENT_REGISTRY, getDocumentMapsForKey } from './document-registry';

describe('FINANCE_DOCUMENT_REGISTRY', () => {
  test('every system catalog key has an explicit registry entry (array may be empty)', () => {
    for (const row of SYSTEM_ROW_CATALOG) {
      expect(FINANCE_DOCUMENT_REGISTRY).toHaveProperty(row.key);
      expect(Array.isArray(FINANCE_DOCUMENT_REGISTRY[row.key])).toBe(true);
    }
  });

  test('down_payment maps to thank-you letter field เงินดาวน์', () => {
    const maps = getDocumentMapsForKey('down_payment');
    expect(maps.some((m) => m.doc === 'thank-you-letter' && m.fieldLabel === 'เงินดาวน์')).toBe(true);
  });

  test('custom keys return empty maps', () => {
    expect(getDocumentMapsForKey('custom:abc')).toEqual([]);
  });
});
