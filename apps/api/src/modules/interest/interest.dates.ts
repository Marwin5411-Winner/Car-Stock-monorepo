/**
 * Pure, inclusive day-range validators for interest stop/resume actions.
 * All comparisons are at day granularity on yyyy-MM-dd strings.
 */

const DAY_RE = /^(\d{4})-(\d{2})-(\d{2})/;
const MS_PER_DAY = 1000 * 60 * 60 * 24;

/** Reduce a Date (local calendar day) or ISO string to a yyyy-MM-dd day key. */
export function dayKey(value: Date | string): string {
  if (typeof value === 'string') return value.slice(0, 10);
  const y = value.getFullYear();
  const m = String(value.getMonth() + 1).padStart(2, '0');
  const d = String(value.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Parse a yyyy-MM-DD (or Date) as local midnight.
 * `new Date("2026-09-01")` is UTC midnight and undercounts days in UTC+7.
 */
export function parseDay(value: Date | string): Date {
  if (typeof value === 'string') {
    const m = DAY_RE.exec(value);
    if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    const parsed = new Date(value);
    return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
  }
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

export function parseOptionalDay(value?: string | null): Date | undefined {
  if (!value) return undefined;
  return parseDay(value);
}

/** Exclusive calendar-day count (same day = 0), matching existing interest tests. */
export function daysBetween(start: Date | string, end: Date | string): number {
  const a = parseDay(start).getTime();
  const b = parseDay(end).getTime();
  return Math.abs(Math.round((b - a) / MS_PER_DAY));
}

export function dayBefore(value: Date | string): Date {
  const d = parseDay(value);
  d.setDate(d.getDate() - 1);
  return d;
}

export function canAccrueWithoutPeriods(input: {
  debtStatus: string;
  stopInterestCalc: boolean;
  interestStoppedAt: Date | null | undefined;
}): boolean {
  const hasStopDate = !!(input.stopInterestCalc && input.interestStoppedAt);
  return input.debtStatus !== 'PAID_OFF' || hasStopDate;
}

export function implicitAccrualEndDate(input: {
  stopInterestCalc: boolean;
  interestStoppedAt: Date | null | undefined;
  soldDate?: Date | null;
  today: Date;
}): Date {
  const soldOrToday = input.soldDate || input.today;
  if (input.stopInterestCalc && input.interestStoppedAt) {
    return new Date(Math.min(soldOrToday.getTime(), input.interestStoppedAt.getTime()));
  }
  return soldOrToday;
}

export function buildImplicitClosedPeriod(input: {
  startDate: Date | null | undefined;
  endDate: Date;
  annualRatePercent: number;
  principalAmount: number;
}): {
  startDate: Date;
  endDate: Date;
  daysCount: number;
  calculatedInterest: number;
} | null {
  if (!input.startDate) return null;
  const startDate = parseDay(input.startDate);
  const endDate = parseDay(input.endDate);
  if (dayKey(endDate) < dayKey(startDate)) return null;
  const daysCount = daysBetween(startDate, endDate);
  const calculatedInterest =
    input.principalAmount * (input.annualRatePercent / 100 / 365) * daysCount;
  return { startDate, endDate, daysCount, calculatedInterest };
}

/**
 * Display stand-in for a stock that is accruing (or has accrued) without any
 * InterestPeriod row. Open while still calculating; closed at the stop/sold
 * cap so the history table can show the implicit current period.
 */
export function buildImplicitDisplayPeriod(input: {
  startDate: Date | null | undefined;
  annualRatePercent: number;
  principalAmount: number;
  debtStatus: string;
  stopInterestCalc: boolean;
  interestStoppedAt: Date | null | undefined;
  soldDate?: Date | null;
  today: Date;
}): {
  startDate: Date;
  endDate: Date | null;
  daysCount: number;
  calculatedInterest: number;
} | null {
  if (!canAccrueWithoutPeriods(input) || !input.startDate) return null;

  const accrualEnd = implicitAccrualEndDate({
    stopInterestCalc: input.stopInterestCalc,
    interestStoppedAt: input.interestStoppedAt,
    soldDate: input.soldDate,
    today: input.today,
  });
  const isClosed = !!(input.stopInterestCalc && input.interestStoppedAt);

  if (isClosed) {
    const closed = buildImplicitClosedPeriod({
      startDate: input.startDate,
      endDate: accrualEnd,
      annualRatePercent: input.annualRatePercent,
      principalAmount: input.principalAmount,
    });
    if (!closed) return null;
    return {
      startDate: closed.startDate,
      endDate: closed.endDate,
      daysCount: closed.daysCount,
      calculatedInterest: closed.calculatedInterest,
    };
  }

  const startDate = parseDay(input.startDate);
  const endForCalc = parseDay(accrualEnd);
  if (dayKey(endForCalc) < dayKey(startDate)) return null;
  const daysCount = daysBetween(startDate, endForCalc);
  return {
    startDate,
    endDate: null,
    daysCount,
    calculatedInterest: input.principalAmount * (input.annualRatePercent / 100 / 365) * daysCount,
  };
}

/** Persist an implicit period only when history would otherwise stay empty. */
export function shouldMaterializeImplicitPeriod(input: {
  periodCount: number;
  annualRatePercent: number;
  startDate: Date | null | undefined;
  debtStatus: string;
  stopInterestCalc: boolean;
  interestStoppedAt: Date | null | undefined;
}): boolean {
  if (input.periodCount > 0) return false;
  if (!(input.annualRatePercent > 0)) return false;
  if (!input.startDate) return false;
  return canAccrueWithoutPeriods(input);
}

/**
 * Fields to write for a materialized implicit period.
 * Open periods store 0 interest/days — GET recalculates while the period is active.
 */
export function implicitPeriodWriteFields(implicit: {
  startDate: Date;
  endDate: Date | null;
  daysCount: number;
  calculatedInterest: number;
}): {
  startDate: Date;
  endDate: Date | null;
  daysCount: number;
  calculatedInterest: number;
} {
  if (implicit.endDate) {
    return {
      startDate: implicit.startDate,
      endDate: implicit.endDate,
      daysCount: implicit.daysCount,
      calculatedInterest: implicit.calculatedInterest,
    };
  }
  return {
    startDate: implicit.startDate,
    endDate: null,
    daysCount: 0,
    calculatedInterest: 0,
  };
}

/** Stop date must be within [active period start, today] (empty bound = unbounded). */
export function isValidStopDate(
  stopDate: string,
  activePeriodStart: string | null,
  today: string
): boolean {
  if (stopDate > today) return false;
  if (activePeriodStart && stopDate < activePeriodStart) return false;
  return true;
}

/** Resume start date must be within [last stop date, today]. */
export function isValidResumeStartDate(
  startDate: string,
  lastStopDate: string | null,
  today: string
): boolean {
  if (startDate > today) return false;
  if (lastStopDate && startDate < lastStopDate) return false;
  return true;
}
