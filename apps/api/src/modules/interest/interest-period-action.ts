import { daysBetween } from './interest.dates';

export type PeriodStartAction = 'INITIAL' | 'RATE_CHANGE' | 'RESUME' | 'DEBT_ADJUST';
export type PeriodEndAction = 'OPEN' | 'RATE_CHANGE' | 'STOPPED' | 'DEBT_ADJUST' | 'PAID_OFF';

export type PeriodForClassification = {
  startDate: Date | string;
  endDate: Date | string | null;
  annualRate: number;
  principalAmount: number;
  notes: string | null;
};

export type StockForClassification = {
  stopInterestCalc: boolean;
  debtStatus: string;
};

export type ClassifiedPeriodActions = {
  startAction: PeriodStartAction;
  endAction: PeriodEndAction;
  previousRate: number | null;
};

const STOPPED_NOTE = /\[Stopped\]|หยุดคิด/;
const PAID_OFF_NOTE = /ปิดหนี้|paid off|Debt fully paid/i;
const DEBT_NOTE = /\[Debt Payment\]|Principal adjusted|ปรับเงินต้น|Initial period created from debt/i;
const INITIAL_NOTE = /Initial interest period|Closed implicit|เริ่มคิดดอกเบี้ย(?!ใหม่)/;
const RESUME_NOTE = /เริ่มคิดดอกเบี้ยใหม่/;

function hasNote(notes: string | null | undefined, pattern: RegExp): boolean {
  return !!notes && pattern.test(notes);
}

function isPaidOff(stock: StockForClassification, notes: string | null): boolean {
  return stock.debtStatus === 'PAID_OFF' || hasNote(notes, PAID_OFF_NOTE);
}

function isConsecutive(endDate: Date | string, nextStart: Date | string): boolean {
  return daysBetween(endDate, nextStart) === 1;
}

function looksLikeDebtAdjust(
  current: PeriodForClassification,
  next?: PeriodForClassification
): boolean {
  if (hasNote(current.notes, DEBT_NOTE)) return true;
  if (!next) return false;
  if (hasNote(next.notes, DEBT_NOTE)) return true;
  return current.annualRate === next.annualRate && current.principalAmount !== next.principalAmount;
}

function classifyEndAction(
  period: PeriodForClassification,
  next: PeriodForClassification | undefined,
  isLast: boolean,
  stock: StockForClassification
): PeriodEndAction {
  if (!period.endDate) return 'OPEN';

  if (hasNote(period.notes, STOPPED_NOTE) || hasNote(period.notes, PAID_OFF_NOTE)) {
    return isPaidOff(stock, period.notes) ? 'PAID_OFF' : 'STOPPED';
  }

  if (hasNote(period.notes, DEBT_NOTE) && !next) return 'DEBT_ADJUST';

  if (next) {
    if (isConsecutive(period.endDate, next.startDate)) {
      if (looksLikeDebtAdjust(period, next)) return 'DEBT_ADJUST';
      return 'RATE_CHANGE';
    }
    return isPaidOff(stock, period.notes) ? 'PAID_OFF' : 'STOPPED';
  }

  if (isLast && isPaidOff(stock, period.notes)) return 'PAID_OFF';
  if (isLast && (stock.stopInterestCalc || hasNote(period.notes, STOPPED_NOTE))) return 'STOPPED';
  if (hasNote(period.notes, DEBT_NOTE)) return 'DEBT_ADJUST';
  return 'RATE_CHANGE';
}

function classifyStartAction(
  period: PeriodForClassification,
  index: number,
  prev: PeriodForClassification | undefined,
  prevEnd: PeriodEndAction | undefined
): PeriodStartAction {
  if (hasNote(period.notes, RESUME_NOTE)) return 'RESUME';
  if (hasNote(period.notes, DEBT_NOTE)) return index === 0 ? 'INITIAL' : 'DEBT_ADJUST';
  if (index === 0 || hasNote(period.notes, INITIAL_NOTE)) return 'INITIAL';

  if (prevEnd === 'STOPPED' || prevEnd === 'PAID_OFF') return 'RESUME';
  if (prev?.endDate && !isConsecutive(prev.endDate, period.startDate)) return 'RESUME';

  if (
    prev &&
    prev.annualRate === period.annualRate &&
    prev.principalAmount !== period.principalAmount
  ) {
    return 'DEBT_ADJUST';
  }

  return 'RATE_CHANGE';
}

/**
 * Infer why each interest period started and ended, without a schema field.
 * Consecutive calendar days (end → next start = 1 exclusive day) match a rate
 * change or debt-principal split; a gap or a last closed row on a stopped stock
 * is a stop. Notes (Thai + legacy English) override the date heuristic.
 */
export function classifyInterestPeriodActions(
  periods: PeriodForClassification[],
  stock: StockForClassification
): ClassifiedPeriodActions[] {
  const endActions = periods.map((period, index) =>
    classifyEndAction(period, periods[index + 1], index === periods.length - 1, stock)
  );

  return periods.map((period, index) => {
    const prev = index > 0 ? periods[index - 1] : undefined;
    return {
      startAction: classifyStartAction(period, index, prev, endActions[index - 1]),
      endAction: endActions[index],
      previousRate: prev ? prev.annualRate : null,
    };
  });
}

/** Append a system label without duplicating it, then optional user notes. */
export function formatPeriodNote(
  system: string,
  existing?: string | null,
  user?: string | null
): string {
  const chunks: string[] = [];
  const existingTrim = existing?.trim() || '';
  const userTrim = user?.trim() || '';

  if (existingTrim) chunks.push(existingTrim);
  if (!existingTrim.includes(system)) chunks.push(system);
  if (userTrim && !chunks.join('\n').includes(userTrim)) chunks.push(userTrim);

  return chunks.join('\n');
}

export function formatRatePercent(rate: number): string {
  return `${Number(rate).toFixed(2)}%`;
}
