import { describe, expect, it } from 'bun:test';
import { dayKey, isValidStopDate, isValidResumeStartDate } from '../modules/interest/interest.dates';

describe('dayKey', () => {
  it('formats a Date as a local yyyy-MM-dd string', () => {
    // Local-midnight date → its own calendar day (no UTC shift)
    const d = new Date(2026, 5, 10, 0, 0, 0, 0); // 10 June 2026 local
    expect(dayKey(d)).toBe('2026-06-10');
  });

  it('slices an ISO string to its date portion', () => {
    expect(dayKey('2026-06-10T17:00:00.000Z')).toBe('2026-06-10');
    expect(dayKey('2026-06-10')).toBe('2026-06-10');
  });
});

describe('isValidStopDate', () => {
  const today = '2026-06-16';
  const periodStart = '2026-06-01';

  it('accepts dates within [period start, today] inclusive', () => {
    expect(isValidStopDate('2026-06-10', periodStart, today)).toBe(true);
    expect(isValidStopDate(periodStart, periodStart, today)).toBe(true);
    expect(isValidStopDate(today, periodStart, today)).toBe(true);
  });

  it('rejects before period start and after today', () => {
    expect(isValidStopDate('2026-05-31', periodStart, today)).toBe(false);
    expect(isValidStopDate('2026-06-17', periodStart, today)).toBe(false);
  });

  it('enforces only the upper bound when no active period', () => {
    expect(isValidStopDate('2020-01-01', null, today)).toBe(true);
    expect(isValidStopDate('2026-06-17', null, today)).toBe(false);
  });
});

describe('isValidResumeStartDate', () => {
  const today = '2026-06-16';
  const lastStop = '2026-06-10';

  it('accepts dates within [last stop, today] inclusive', () => {
    expect(isValidResumeStartDate('2026-06-12', lastStop, today)).toBe(true);
    expect(isValidResumeStartDate(lastStop, lastStop, today)).toBe(true);
    expect(isValidResumeStartDate(today, lastStop, today)).toBe(true);
  });

  it('rejects before last stop and after today', () => {
    expect(isValidResumeStartDate('2026-06-09', lastStop, today)).toBe(false);
    expect(isValidResumeStartDate('2026-06-17', lastStop, today)).toBe(false);
  });
});
