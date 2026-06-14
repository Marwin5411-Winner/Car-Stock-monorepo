import type { InterestBase } from '@prisma/client';
import type { Decimal } from '@prisma/client/runtime/library';

const ONE_DAY = 1000 * 60 * 60 * 24;

const round2 = (n: number): number => Math.round(n * 100) / 100;

const toNum = (val: Decimal | number | null | undefined): number => {
  if (val === null || val === undefined) return 0;
  if (typeof val === 'number') return val;
  return Number(val);
};

const midnight = (date: Date): number => {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

/**
 * Inclusive day count between two dates (counts BOTH endpoints).
 * Normalizes both to midnight to avoid time-of-day off-by-one.
 * This is what the TISCO bill uses: NO_DAY = (TO − FROM) + 1.
 */
export const daysInclusive = (from: Date, to: Date): number => {
  return Math.floor((midnight(to) - midnight(from)) / ONE_DAY) + 1;
};

/**
 * Bank interest for a single row: principal × (rate/100) × days / 365,
 * rounded to 2dp PER ROW (the bank rounds each line, then sums).
 * `rate` is already a percent (e.g. 3.35).
 */
export const computeBankInterest = (principal: number, rate: number, days: number): number => {
  return round2((principal * (rate / 100) * days) / 365);
};

interface BankInterestPeriodInput {
  startDate: Date;
  endDate: Date | null;
  annualRate: Decimal | number; // already a % e.g. 3.35
  principalAmount: Decimal | number;
}

export interface BankInterestStockInput {
  id: string;
  stockNumber: string | null;
  vin: string;
  exteriorColor: string;
  orderDate: Date | null;
  arrivalDate: Date | null;
  interestStoppedAt: Date | null;
  interestRate: Decimal | number; // field stores a fraction → ×100 for %
  interestPrincipalBase: InterestBase;
  baseCost: Decimal | number;
  transportCost: Decimal | number;
  accessoryCost: Decimal | number;
  otherCosts: Decimal | number;
  vehicleModel: {
    brand: string;
    model: string;
    variant: string | null;
    year: number;
  };
  interestPeriods: BankInterestPeriodInput[];
}

export interface BankInterestRow {
  stockId: string;
  stockNumber: string;
  vin: string;
  vehicleInfo: string;
  exteriorColor: string;
  principalAmount: number;
  rate: number;
  periodFrom: Date;
  periodTo: Date;
  days: number;
  interest: number;
}

export interface BankInterestSummary {
  vehicleCount: number;
  rowCount: number;
  totalInterest: number;
}

interface Segment {
  start: Date;
  end: Date;
  rate: number;
  principal: number;
}

/**
 * Pure builder: takes already-fetched stocks (finance provider set, not soft-deleted)
 * and produces the bank-style interest rows + summary for the [cycleStart, cycleEnd] window.
 * `cycleEnd` is the last day of the cycle (inclusive). No DB access here so it is unit-testable.
 */
export function buildBankInterestRows(
  stocks: BankInterestStockInput[],
  cycleStart: Date,
  cycleEnd: Date
): { rows: BankInterestRow[]; summary: BankInterestSummary } {
  const cycleStartMs = midnight(cycleStart);
  const cycleEndMs = midnight(cycleEnd);

  const rows: BankInterestRow[] = [];

  for (const stock of stocks) {
    const baseCost = toNum(stock.baseCost);
    const fallbackPrincipal =
      stock.interestPrincipalBase === 'BASE_COST_ONLY'
        ? baseCost
        : baseCost +
          toNum(stock.transportCost) +
          toNum(stock.accessoryCost) +
          toNum(stock.otherCosts);

    // 1) Build segments.
    let segments: Segment[];
    if (stock.interestPeriods.length > 0) {
      segments = stock.interestPeriods.map((p) => ({
        start: p.startDate,
        end: p.endDate ?? stock.interestStoppedAt ?? cycleEnd,
        rate: toNum(p.annualRate),
        principal: toNum(p.principalAmount),
      }));
    } else {
      const start = stock.orderDate ?? stock.arrivalDate ?? cycleStart;
      segments = [
        {
          start,
          end: stock.interestStoppedAt ?? cycleEnd,
          // interestRate is a fraction (e.g. 0.0335); ×100 → percent. round2 to
          // avoid IEEE-754 artifacts (0.0335 * 100 = 3.3500000000000003) leaking
          // into the PDF rate column.
          rate: round2(toNum(stock.interestRate) * 100),
          principal: fallbackPrincipal,
        },
      ];
    }

    const vehicleInfo = `${stock.vehicleModel.brand} ${stock.vehicleModel.model} ${
      stock.vehicleModel.variant || ''
    }`
      .trim()
      .concat(` (${stock.vehicleModel.year})`);

    // 2) Clip each segment to the cycle window and emit a row.
    for (const seg of segments) {
      const fromMs = Math.max(midnight(seg.start), cycleStartMs);
      const toMs = Math.min(midnight(seg.end), cycleEndMs);
      if (fromMs > toMs) continue; // no overlap → skip

      const periodFrom = new Date(fromMs);
      const periodTo = new Date(toMs);
      const days = daysInclusive(periodFrom, periodTo);
      const interest = computeBankInterest(seg.principal, seg.rate, days);

      rows.push({
        stockId: stock.id,
        stockNumber: stock.stockNumber ?? '',
        vin: stock.vin,
        vehicleInfo,
        exteriorColor: stock.exteriorColor,
        principalAmount: seg.principal,
        rate: seg.rate,
        periodFrom,
        periodTo,
        days,
        interest,
      });
    }
  }

  // Sort by (periodFrom asc, vin asc).
  rows.sort((a, b) => {
    const byDate = a.periodFrom.getTime() - b.periodFrom.getTime();
    if (byDate !== 0) return byDate;
    return a.vin.localeCompare(b.vin);
  });

  const summary: BankInterestSummary = {
    vehicleCount: new Set(rows.map((r) => r.stockId)).size,
    rowCount: rows.length,
    totalInterest: round2(rows.reduce((sum, r) => sum + r.interest, 0)),
  };

  return { rows, summary };
}
