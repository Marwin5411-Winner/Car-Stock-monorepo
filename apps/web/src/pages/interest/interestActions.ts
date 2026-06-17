import type { DebtStatus } from '../../services/interest.service';

/**
 * Decides which action the interest detail page may offer for a stock.
 *
 * This mirrors the guards in the backend service so the UI never offers an
 * action the API will reject with BAD_REQUEST ("คำขอไม่ถูกต้อง"):
 *  - resumeInterestCalculation() throws when debt is PAID_OFF (or the stock is
 *    not actually stopped), so a paid-off stock must NOT be offered "resume".
 *  - A paid-off car is permanently done accruing interest, so it gets a
 *    read-only "ปิดหนี้แล้ว" indicator instead.
 */
export type InterestHeaderAction = 'EDIT_AND_STOP' | 'RESUME' | 'PAID_OFF';

export interface InterestActionState {
  /** summary.isCalculating from the interest detail response */
  isCalculating: boolean;
  /** debtSummary.debtStatus (undefined while the debt summary is still loading) */
  debtStatus?: DebtStatus;
  /** summary.periodCount from the interest detail response */
  periodCount: number;
  /** stock.status */
  stockStatus: string;
}

export function getInterestHeaderAction(state: InterestActionState): InterestHeaderAction {
  if (state.isCalculating) return 'EDIT_AND_STOP';
  // Not calculating: either manually stopped (resumable) or paid off (terminal).
  if (state.debtStatus === 'PAID_OFF') return 'PAID_OFF';
  return 'RESUME';
}

/**
 * Whether the empty-history "เริ่มคิดดอกเบี้ย" (initialize) link may be shown.
 * Paid-off and sold stocks should never be initialized.
 */
export function canShowInitialize(state: InterestActionState): boolean {
  return (
    state.periodCount === 0 &&
    !state.isCalculating &&
    state.stockStatus !== 'SOLD' &&
    state.debtStatus !== 'PAID_OFF'
  );
}

/** Reduce an ISO date or datetime string to its yyyy-MM-dd day portion. */
const toDay = (iso: string | null | undefined): string => (iso ?? '').slice(0, 10);

/**
 * Today's LOCAL calendar date as yyyy-MM-dd. Uses local date fields (not
 * toISOString, which is UTC) so it agrees with the server's day-key
 * convention — avoids the early-morning off-by-one in UTC+ timezones.
 */
export function todayIso(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Inclusive day-range check on ISO date strings (empty bound = unbounded). */
function withinDayRange(
  dateIso: string,
  minIso: string | null | undefined,
  maxIso: string | null | undefined
): boolean {
  const d = toDay(dateIso);
  if (!d) return false;
  const min = toDay(minIso);
  const max = toDay(maxIso);
  if (min && d < min) return false;
  if (max && d > max) return false;
  return true;
}

/** Stop date must be within [active period start, today]. */
export function isValidStopDate(
  stopDate: string,
  activePeriodStart: string | null | undefined,
  today: string
): boolean {
  return withinDayRange(stopDate, activePeriodStart, today);
}

/** Resume start date must be within [last stop date, today]. */
export function isValidResumeStartDate(
  startDate: string,
  lastStopDate: string | null | undefined,
  today: string
): boolean {
  return withinDayRange(startDate, lastStopDate, today);
}
