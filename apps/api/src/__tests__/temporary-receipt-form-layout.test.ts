import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = dirname(fileURLToPath(import.meta.url));
const formSource = readFileSync(
  join(dir, '../modules/pdf/templates/temporary-receipt.hbs'),
  'utf-8'
);
const overlaySource = readFileSync(
  join(dir, '../modules/pdf/templates/temporary-receipt-bg.hbs'),
  'utf-8'
);

const PAGE_WIDTH_MM = 9.5 * 25.4; // 241.3 — physical pinfeed sheet
const OVERLAY_WIDTH_MM = 9 * 25.4; // 228.6 — pre-printed form origin
const TEAROFF_BODY_MM = 8.5 * 25.4; // 215.9 — pinfeed sheet after left+right stubs
const STUB_MM = 0.5 * 25.4; // 12.7

function cssBlock(source: string, selector: string): string {
  const re = new RegExp(`${selector.replaceAll('.', '\\.')}\\s*\\{([^}]+)\\}`);
  const match = source.match(re);
  if (!match) throw new Error(`no CSS block for ${selector}`);
  return match[1];
}

function cssDecl(block: string, prop: string): string {
  const match = block.match(new RegExp(`${prop}\\s*:\\s*([^;]+);`));
  if (!match) throw new Error(`no declaration ${prop}`);
  return match[1].trim();
}

function toMm(raw: string): number {
  if (raw.endsWith('mm')) return Number.parseFloat(raw);
  if (raw.endsWith('in')) return Number.parseFloat(raw) * 25.4;
  throw new Error(`unsupported unit: ${raw}`);
}

function horizontalPaddingMm(padding: string): { left: number; right: number } {
  const parts = padding.trim().split(/\s+/);
  if (parts.length === 1) return { left: toMm(parts[0]), right: toMm(parts[0]) };
  if (parts.length === 2 || parts.length === 3) {
    return { left: toMm(parts[1]), right: toMm(parts[1]) };
  }
  if (parts.length === 4) return { left: toMm(parts[3]), right: toMm(parts[1]) };
  throw new Error(`bad padding shorthand: ${padding}`);
}

describe('temporary-receipt form layout — CARSTOCK01-23 pinfeed tear-off', () => {
  test('keeps @page 9.5×5.5in so the driver gets the physical continuous sheet', () => {
    expect(formSource).toMatch(/@page\s*\{[^}]*size:\s*9\.5in\s+5\.5in/s);
    expect(formSource).toMatch(/@page\s*\{[^}]*margin:\s*0/s);
  });

  test('insets the form 0.5in each side so the table stays inside the 8.5in tear-off', () => {
    const block = cssBlock(formSource, '.receipt-container');
    const widthMm = toMm(cssDecl(block, 'width'));
    const pad = horizontalPaddingMm(cssDecl(block, 'padding'));
    const contentMm = widthMm - pad.left - pad.right;

    expect(widthMm).toBeCloseTo(PAGE_WIDTH_MM, 1);
    expect(pad.left).toBeGreaterThanOrEqual(STUB_MM - 0.05);
    expect(pad.right).toBeGreaterThanOrEqual(STUB_MM - 0.05);
    expect(contentMm).toBeLessThanOrEqual(TEAROFF_BODY_MM + 0.05);
  });

  test('uses border-box so the 9.5in width includes the stub insets', () => {
    const block = cssBlock(formSource, '.receipt-container');
    expect(cssDecl(block, 'box-sizing')).toBe('border-box');
  });

  test('A4 branch is a separate landscape page, not a scaled 9.5in box', () => {
    expect(formSource).toMatch(/\{\{#if paperA4\}\}[\s\S]*size:\s*A4 landscape/);
    expect(formSource).toMatch(/\{\{#if paperA4\}\}[\s\S]*margin:\s*10mm/);
    expect(formSource).toMatch(/\{\{#if paperA4\}\}[\s\S]*width:\s*100%/);
    expect(formSource).toMatch(/\{\{else\}\}\s*@page\s*\{[^}]*size:\s*9\.5in\s+5\.5in/s);
  });

  test('does not move the overlay (pre-printed form) field grid', () => {
    const ovl = cssBlock(overlaySource, '.ovl');
    expect(toMm(cssDecl(ovl, 'width'))).toBeCloseTo(OVERLAY_WIDTH_MM, 1);
    expect(overlaySource).toMatch(/@page\s*\{[^}]*size:\s*9in\s+5\.5in/s);
    expect(overlaySource).toContain('left: 161mm'); // .f-date
    expect(overlaySource).toContain('left: 154mm'); // .f-contract
    expect(overlaySource).toContain('left: 152mm'); // .f-bank-account
    expect(ovl).not.toMatch(/padding\s*:/);
  });
});
