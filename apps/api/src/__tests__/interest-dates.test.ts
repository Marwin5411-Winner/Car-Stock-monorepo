import { describe, expect, it } from 'bun:test';
import { classifyInterestPeriodActions } from '../modules/interest/interest-period-action';
import {
  buildImplicitClosedPeriod,
  buildImplicitDisplayPeriod,
  canAccrueWithoutPeriods,
  dayBefore,
  dayKey,
  daysBetween,
  implicitAccrualEndDate,
  isValidResumeStartDate,
  isValidStopDate,
  parseDay,
} from '../modules/interest/interest.dates';

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

describe('parseDay', () => {
  it('parses YYYY-MM-DD as local midnight, not UTC', () => {
    const d = parseDay('2026-09-01');
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(8);
    expect(d.getDate()).toBe(1);
    expect(d.getHours()).toBe(0);
  });

  it('strips time from a Date to local midnight', () => {
    const d = parseDay(new Date(2026, 0, 20, 15, 30, 0));
    expect(dayKey(d)).toBe('2026-01-20');
    expect(d.getHours()).toBe(0);
  });
});

describe('daysBetween', () => {
  it('returns 0 for the same calendar day even when UTC midnight is mixed with local midnight', () => {
    const local = new Date(2026, 8, 1, 0, 0, 0, 0);
    const utcIso = '2026-09-01T00:00:00.000Z';
    expect(daysBetween(local, utcIso)).toBe(0);
  });

  it('counts exclusive calendar days', () => {
    expect(daysBetween('2026-01-20', '2026-01-20')).toBe(0);
    expect(daysBetween('2026-01-20', '2026-01-21')).toBe(1);
    expect(daysBetween('2026-01-01', '2026-01-31')).toBe(30);
  });
});

describe('dayBefore', () => {
  it('returns the previous local calendar day', () => {
    expect(dayKey(dayBefore('2026-09-01'))).toBe('2026-08-31');
  });
});

describe('canAccrueWithoutPeriods', () => {
  it('accrues while calculating, and after stop when a stop date exists', () => {
    expect(
      canAccrueWithoutPeriods({
        debtStatus: 'ACTIVE',
        stopInterestCalc: false,
        interestStoppedAt: null,
      })
    ).toBe(true);
    expect(
      canAccrueWithoutPeriods({
        debtStatus: 'ACTIVE',
        stopInterestCalc: true,
        interestStoppedAt: new Date(2026, 8, 1),
      })
    ).toBe(true);
  });

  it('does not accrue for paid-off stock without a stop date', () => {
    expect(
      canAccrueWithoutPeriods({
        debtStatus: 'PAID_OFF',
        stopInterestCalc: false,
        interestStoppedAt: null,
      })
    ).toBe(false);
  });
});

describe('implicitAccrualEndDate', () => {
  it('uses the earlier of sold/today and the stop date', () => {
    const today = new Date(2026, 8, 1);
    const stopped = new Date(2026, 5, 10);
    const end = implicitAccrualEndDate({
      stopInterestCalc: true,
      interestStoppedAt: stopped,
      today,
    });
    expect(dayKey(end)).toBe('2026-06-10');
  });
});

describe('buildImplicitClosedPeriod', () => {
  it('closes orderDate → stopDate with calendar days and interest', () => {
    const period = buildImplicitClosedPeriod({
      startDate: new Date(2026, 0, 20),
      endDate: new Date(2026, 0, 30),
      annualRatePercent: 3,
      principalAmount: 100_000,
    });
    expect(period).not.toBeNull();
    expect(period!.daysCount).toBe(10);
    expect(period!.calculatedInterest).toBeCloseTo(100_000 * (3 / 100 / 365) * 10, 6);
  });

  it('returns null when end is before start', () => {
    expect(
      buildImplicitClosedPeriod({
        startDate: new Date(2026, 0, 20),
        endDate: new Date(2026, 0, 19),
        annualRatePercent: 3,
        principalAmount: 100_000,
      })
    ).toBeNull();
  });
});

describe('buildImplicitDisplayPeriod', () => {
  const today = new Date(2026, 8, 2);

  it('returns an open period while still calculating', () => {
    const period = buildImplicitDisplayPeriod({
      startDate: new Date(2026, 7, 31),
      annualRatePercent: 3.35,
      principalAmount: 714_306,
      debtStatus: 'ACTIVE',
      stopInterestCalc: false,
      interestStoppedAt: null,
      today,
    });
    expect(period).not.toBeNull();
    expect(period!.endDate).toBeNull();
    expect(period!.daysCount).toBe(2);
    expect(period!.calculatedInterest).toBeCloseTo(714_306 * (3.35 / 100 / 365) * 2, 6);
  });

  it('closes at the stop date when interest was stopped', () => {
    const period = buildImplicitDisplayPeriod({
      startDate: new Date(2026, 0, 20),
      annualRatePercent: 3,
      principalAmount: 100_000,
      debtStatus: 'ACTIVE',
      stopInterestCalc: true,
      interestStoppedAt: new Date(2026, 0, 30),
      today,
    });
    expect(period).not.toBeNull();
    expect(dayKey(period!.endDate!)).toBe('2026-01-30');
    expect(period!.daysCount).toBe(10);
    expect(period!.calculatedInterest).toBeCloseTo(100_000 * (3 / 100 / 365) * 10, 6);
  });

  it('returns null without a start date, or for paid-off stock with no stop date', () => {
    const base = {
      annualRatePercent: 3,
      principalAmount: 100_000,
      today,
      interestStoppedAt: null as Date | null,
    };
    expect(
      buildImplicitDisplayPeriod({
        ...base,
        startDate: null,
        debtStatus: 'ACTIVE',
        stopInterestCalc: false,
      })
    ).toBeNull();
    expect(
      buildImplicitDisplayPeriod({
        ...base,
        startDate: new Date(2026, 0, 20),
        debtStatus: 'PAID_OFF',
        stopInterestCalc: false,
      })
    ).toBeNull();
  });

  it('classifies the open implicit row as เริ่มคิด / ปัจจุบัน', () => {
    const implicit = buildImplicitDisplayPeriod({
      startDate: new Date(2026, 7, 31),
      annualRatePercent: 3.35,
      principalAmount: 714_306,
      debtStatus: 'ACTIVE',
      stopInterestCalc: false,
      interestStoppedAt: null,
      today,
    });
    const [row] = classifyInterestPeriodActions(
      [
        {
          startDate: implicit!.startDate,
          endDate: implicit!.endDate,
          annualRate: 3.35,
          principalAmount: 714_306,
          notes: 'เริ่มคิดดอกเบี้ย',
        },
      ],
      { stopInterestCalc: false, debtStatus: 'ACTIVE' }
    );
    expect(row).toEqual({
      startAction: 'INITIAL',
      endAction: 'OPEN',
      previousRate: null,
    });
  });

  it('classifies a stopped implicit row as เริ่มคิด / หยุดคิด', () => {
    const implicit = buildImplicitDisplayPeriod({
      startDate: new Date(2026, 0, 20),
      annualRatePercent: 3,
      principalAmount: 100_000,
      debtStatus: 'ACTIVE',
      stopInterestCalc: true,
      interestStoppedAt: new Date(2026, 0, 30),
      today,
    });
    const [row] = classifyInterestPeriodActions(
      [
        {
          startDate: implicit!.startDate,
          endDate: implicit!.endDate,
          annualRate: 3,
          principalAmount: 100_000,
          notes: 'เริ่มคิดดอกเบี้ย',
        },
      ],
      { stopInterestCalc: true, debtStatus: 'ACTIVE' }
    );
    expect(row).toEqual({
      startAction: 'INITIAL',
      endAction: 'STOPPED',
      previousRate: null,
    });
  });
});
