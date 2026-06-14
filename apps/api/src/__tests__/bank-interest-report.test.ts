// apps/api/src/__tests__/bank-interest-report.test.ts
import { describe, expect, test } from 'bun:test';
import {
  type BankInterestStockInput,
  buildBankInterestRows,
  computeBankInterest,
  daysInclusive,
} from '../modules/reports/bank-interest.helpers';

// ============================================
// daysInclusive (counts BOTH endpoints)
// ============================================
describe('daysInclusive', () => {
  test('16 → 24 May = 9 days', () => {
    expect(daysInclusive(new Date('2026-05-16'), new Date('2026-05-24'))).toBe(9);
  });

  test('20 → 28 May = 9 days', () => {
    expect(daysInclusive(new Date('2026-05-20'), new Date('2026-05-28'))).toBe(9);
  });

  test('20 May → 15 Jun = 27 days', () => {
    expect(daysInclusive(new Date('2026-05-20'), new Date('2026-06-15'))).toBe(27);
  });

  test('same day = 1 day', () => {
    expect(daysInclusive(new Date('2026-05-20'), new Date('2026-05-20'))).toBe(1);
  });

  test('normalizes time-of-day to midnight (no off-by-one)', () => {
    expect(daysInclusive(new Date('2026-05-16T23:30:00Z'), new Date('2026-05-24T01:15:00Z'))).toBe(
      9
    );
  });
});

// ============================================
// computeBankInterest — bank formula, round per row
// ============================================
describe('computeBankInterest (TISCO bill 6BFPCR109428)', () => {
  const RATE = 3.35;

  // Per-row inputs transcribed from the real TISCO bill (6BFPCR109428): 24 rows,
  // two principals, rate 3.35%. Each row's (principal, days) reproduces the bill's
  // printed AMOUNT DUE exactly, and the per-row-rounded sum equals the bill's printed
  // total 17406.28 with NO adjustments. Principal split is 15 × 714306 and 9 × 836506
  // (the 7-day 537.43 line is an 836506 row, not 714306 — 714306×7 = 458.92).
  const group1Days = [9, 9, 10, 9, 9, 13, 6, 16, 8, 8, 7, 7, 7, 7, 7]; // 15 × principal 714306
  const group2Days = [27, 19, 16, 16, 7, 8, 7, 7, 7]; // 9 × principal 836506

  test('each row amount matches the bank (round2 per row)', () => {
    // Spot-checks against the bill's printed AMOUNT DUE values.
    expect(computeBankInterest(714306, RATE, 9)).toBe(590.04);
    expect(computeBankInterest(714306, RATE, 10)).toBe(655.6);
    expect(computeBankInterest(714306, RATE, 13)).toBe(852.27);
    expect(computeBankInterest(714306, RATE, 6)).toBe(393.36);
    expect(computeBankInterest(714306, RATE, 16)).toBe(1048.95);
    expect(computeBankInterest(714306, RATE, 8)).toBe(524.48);
    expect(computeBankInterest(714306, RATE, 7)).toBe(458.92);
    expect(computeBankInterest(836506, RATE, 27)).toBe(2072.93);
    expect(computeBankInterest(836506, RATE, 19)).toBe(1458.73);
    expect(computeBankInterest(836506, RATE, 16)).toBe(1228.4);
    expect(computeBankInterest(836506, RATE, 8)).toBe(614.2);
    expect(computeBankInterest(836506, RATE, 7)).toBe(537.43);
  });

  test('row count matches the bill (24 rows: 15 + 9)', () => {
    expect(group1Days).toHaveLength(15);
    expect(group2Days).toHaveLength(9);
    expect(group1Days.length + group2Days.length).toBe(24);
  });

  test('grand total of all 24 rows = 17406.28', () => {
    let total = 0;
    for (const d of group1Days) {
      total += computeBankInterest(714306, RATE, d);
    }
    for (const d of group2Days) {
      total += computeBankInterest(836506, RATE, d);
    }
    expect(Math.round(total * 100) / 100).toBe(17406.28);
  });
});

// ============================================
// buildBankInterestRows — clipping & segments
// ============================================
const ymd = (s: string) => new Date(s);

const baseStock = (overrides: Partial<BankInterestStockInput> = {}): BankInterestStockInput => ({
  id: 'st1',
  stockNumber: 'SK-0001',
  vin: 'VINAAA',
  exteriorColor: 'ขาว',
  orderDate: ymd('2026-05-01'),
  arrivalDate: ymd('2026-05-01'),
  interestStoppedAt: null,
  interestRate: 0.0335, // fraction → 3.35%
  interestPrincipalBase: 'BASE_COST_ONLY',
  baseCost: 714306,
  transportCost: 0,
  accessoryCost: 0,
  otherCosts: 0,
  vehicleModel: { brand: 'NETA', model: 'V', variant: 'LITE', year: 2026 },
  interestPeriods: [],
  ...overrides,
});

describe('buildBankInterestRows', () => {
  const cycleStart = ymd('2026-05-16');
  const cycleEnd = ymd('2026-06-15');

  test('active car spanning whole window → clips to cycleStart..cycleEnd', () => {
    const { rows, summary } = buildBankInterestRows([baseStock()], cycleStart, cycleEnd);
    expect(rows).toHaveLength(1);
    const r = rows[0];
    expect(r.periodFrom.getTime()).toBe(cycleStart.getTime());
    expect(r.periodTo.getTime()).toBe(cycleEnd.getTime());
    expect(r.days).toBe(31); // 16 May..15 Jun inclusive
    expect(r.rate).toBe(3.35);
    expect(r.principalAmount).toBe(714306);
    expect(r.vehicleInfo).toBe('NETA V LITE (2026)');
    expect(summary.vehicleCount).toBe(1);
    expect(summary.rowCount).toBe(1);
  });

  test('interestStoppedAt mid-window → `to` clamps to stop date', () => {
    const { rows } = buildBankInterestRows(
      [baseStock({ interestStoppedAt: ymd('2026-05-24') })],
      cycleStart,
      cycleEnd
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].periodTo.getTime()).toBe(ymd('2026-05-24').getTime());
    expect(rows[0].days).toBe(9); // 16..24 May inclusive
    expect(rows[0].interest).toBe(590.04);
  });

  test('car ordered after cycleEnd → no row', () => {
    const { rows, summary } = buildBankInterestRows(
      [baseStock({ orderDate: ymd('2026-07-01'), arrivalDate: ymd('2026-07-01') })],
      cycleStart,
      cycleEnd
    );
    expect(rows).toHaveLength(0);
    expect(summary.vehicleCount).toBe(0);
    expect(summary.totalInterest).toBe(0);
  });

  test('debt closed before cycleStart → no row', () => {
    const { rows } = buildBankInterestRows(
      [
        baseStock({
          orderDate: ymd('2026-01-01'),
          arrivalDate: ymd('2026-01-01'),
          interestStoppedAt: ymd('2026-05-10'),
        }),
      ],
      cycleStart,
      cycleEnd
    );
    expect(rows).toHaveLength(0);
  });

  test('two interestPeriods in the window → two rows, no overlap / no gap', () => {
    const { rows, summary } = buildBankInterestRows(
      [
        baseStock({
          interestPeriods: [
            {
              startDate: ymd('2026-05-01'),
              endDate: ymd('2026-05-24'),
              annualRate: 3.35,
              principalAmount: 714306,
            },
            {
              startDate: ymd('2026-05-25'),
              endDate: null,
              annualRate: 3.35,
              principalAmount: 836506,
            },
          ],
        }),
      ],
      cycleStart,
      cycleEnd
    );
    expect(rows).toHaveLength(2);

    // Sorted by periodFrom asc → first period first.
    const [p1, p2] = rows;
    expect(p1.periodFrom.getTime()).toBe(cycleStart.getTime()); // clipped to 16 May
    expect(p1.periodTo.getTime()).toBe(ymd('2026-05-24').getTime());
    expect(p1.days).toBe(9);
    expect(p1.principalAmount).toBe(714306);

    expect(p2.periodFrom.getTime()).toBe(ymd('2026-05-25').getTime());
    expect(p2.periodTo.getTime()).toBe(cycleEnd.getTime()); // active → clamps to cycleEnd
    expect(p2.principalAmount).toBe(836506);

    // Consecutive: prev.end + 1 day == next.start (no overlap, no gap).
    const gapMs = p2.periodFrom.getTime() - p1.periodTo.getTime();
    expect(gapMs).toBe(24 * 60 * 60 * 1000);

    // Distinct stock count is 1 even though there are 2 rows.
    expect(summary.vehicleCount).toBe(1);
    expect(summary.rowCount).toBe(2);
  });

  test('rows sort by (periodFrom asc, vin asc)', () => {
    const { rows } = buildBankInterestRows(
      [
        baseStock({
          id: 'b',
          vin: 'VINB',
          orderDate: ymd('2026-05-20'),
          arrivalDate: ymd('2026-05-20'),
        }),
        baseStock({
          id: 'a',
          vin: 'VINA',
          orderDate: ymd('2026-05-20'),
          arrivalDate: ymd('2026-05-20'),
        }),
        baseStock({
          id: 'c',
          vin: 'VINC',
          orderDate: ymd('2026-05-01'),
          arrivalDate: ymd('2026-05-01'),
        }),
      ],
      cycleStart,
      cycleEnd
    );
    expect(rows.map((r) => r.vin)).toEqual(['VINC', 'VINA', 'VINB']);
  });

  test('fallback principal uses total cost when base is not BASE_COST_ONLY', () => {
    const { rows } = buildBankInterestRows(
      [
        baseStock({
          interestPrincipalBase: 'TOTAL_COST',
          baseCost: 700000,
          transportCost: 10000,
          accessoryCost: 3000,
          otherCosts: 1306,
        }),
      ],
      cycleStart,
      cycleEnd
    );
    expect(rows[0].principalAmount).toBe(714306);
  });
});
