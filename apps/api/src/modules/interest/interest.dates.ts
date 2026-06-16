/**
 * Pure, inclusive day-range validators for interest stop/resume actions.
 * All comparisons are at day granularity on yyyy-MM-dd strings.
 */

/** Reduce a Date (local calendar day) or ISO string to a yyyy-MM-dd day key. */
export function dayKey(value: Date | string): string {
  if (typeof value === 'string') return value.slice(0, 10);
  const y = value.getFullYear();
  const m = String(value.getMonth() + 1).padStart(2, '0');
  const d = String(value.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
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
