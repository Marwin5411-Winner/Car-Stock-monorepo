import { describe, expect, test } from 'bun:test';
import {
  classifyInterestPeriodActions,
  formatPeriodNote,
  formatRatePercent,
} from '../modules/interest/interest-period-action';

const accruing = { stopInterestCalc: false, debtStatus: 'ACTIVE' };
const stopped = { stopInterestCalc: true, debtStatus: 'ACTIVE' };
const paidOff = { stopInterestCalc: true, debtStatus: 'PAID_OFF' };

function d(year: number, month: number, day: number) {
  return new Date(year, month - 1, day);
}

describe('classifyInterestPeriodActions', () => {
  test('single open period → เริ่มคิด / ปัจจุบัน', () => {
    const [row] = classifyInterestPeriodActions(
      [
        {
          startDate: d(2026, 8, 17),
          endDate: null,
          annualRate: 3.35,
          principalAmount: 500_000,
          notes: 'เริ่มคิดดอกเบี้ย',
        },
      ],
      accruing
    );
    expect(row).toEqual({
      startAction: 'INITIAL',
      endAction: 'OPEN',
      previousRate: null,
    });
  });

  test('rate change closes previous day-before and opens next day', () => {
    const rows = classifyInterestPeriodActions(
      [
        {
          startDate: d(2026, 8, 1),
          endDate: d(2026, 8, 16),
          annualRate: 3.35,
          principalAmount: 500_000,
          notes: 'ปิดงวดเพื่อเปลี่ยนอัตราเป็น 5.00%',
        },
        {
          startDate: d(2026, 8, 17),
          endDate: null,
          annualRate: 5,
          principalAmount: 500_000,
          notes: 'เปลี่ยนอัตราจาก 3.35% เป็น 5.00%',
        },
      ],
      accruing
    );
    expect(rows[0]).toEqual({
      startAction: 'INITIAL',
      endAction: 'RATE_CHANGE',
      previousRate: null,
    });
    expect(rows[1]).toEqual({
      startAction: 'RATE_CHANGE',
      endAction: 'OPEN',
      previousRate: 3.35,
    });
  });

  test('stopped last period with no notes still classifies as STOPPED', () => {
    const [row] = classifyInterestPeriodActions(
      [
        {
          startDate: d(2026, 8, 17),
          endDate: d(2026, 8, 27),
          annualRate: 3.35,
          principalAmount: 500_000,
          notes: null,
        },
      ],
      stopped
    );
    expect(row.startAction).toBe('INITIAL');
    expect(row.endAction).toBe('STOPPED');
  });

  test('stop then resume with a date gap → STOPPED + RESUME', () => {
    const rows = classifyInterestPeriodActions(
      [
        {
          startDate: d(2026, 8, 1),
          endDate: d(2026, 8, 10),
          annualRate: 3.35,
          principalAmount: 500_000,
          notes: 'หยุดคิดดอกเบี้ย',
        },
        {
          startDate: d(2026, 8, 17),
          endDate: null,
          annualRate: 4,
          principalAmount: 500_000,
          notes: 'เริ่มคิดดอกเบี้ยใหม่',
        },
      ],
      accruing
    );
    expect(rows[0].endAction).toBe('STOPPED');
    expect(rows[1].startAction).toBe('RESUME');
    expect(rows[1].endAction).toBe('OPEN');
    expect(rows[1].previousRate).toBe(3.35);
  });

  test('legacy English debt-payment notes → DEBT_ADJUST', () => {
    const rows = classifyInterestPeriodActions(
      [
        {
          startDate: d(2026, 8, 1),
          endDate: d(2026, 8, 10),
          annualRate: 3.35,
          principalAmount: 500_000,
          notes: '[Debt Payment] Interest 100, Principal 50,000 - Remaining 450,000',
        },
        {
          startDate: d(2026, 8, 11),
          endDate: null,
          annualRate: 3.35,
          principalAmount: 450_000,
          notes: 'Principal adjusted after debt payment (Interest: 100, Principal: 50,000)',
        },
      ],
      accruing
    );
    expect(rows[0].endAction).toBe('DEBT_ADJUST');
    expect(rows[1].startAction).toBe('DEBT_ADJUST');
    expect(rows[1].endAction).toBe('OPEN');
  });

  test('paid-off [Stopped] notes → PAID_OFF', () => {
    const [row] = classifyInterestPeriodActions(
      [
        {
          startDate: d(2026, 8, 1),
          endDate: d(2026, 8, 20),
          annualRate: 3.35,
          principalAmount: 500_000,
          notes: '[Stopped] Debt fully paid off on 2026-08-20',
        },
      ],
      paidOff
    );
    expect(row.endAction).toBe('PAID_OFF');
  });

  test('Thai paid-off notes → PAID_OFF', () => {
    const [row] = classifyInterestPeriodActions(
      [
        {
          startDate: d(2026, 8, 1),
          endDate: d(2026, 8, 20),
          annualRate: 3.35,
          principalAmount: 500_000,
          notes: 'หยุดคิดเพราะปิดหนี้ (จ่าย 500,000 ดอกเบี้ย 1,200 เงินต้น 498,800)',
        },
      ],
      paidOff
    );
    expect(row.endAction).toBe('PAID_OFF');
  });

  test('same-day resume (stop date = resume start) is STOPPED then RESUME, not a rate change', () => {
    const rows = classifyInterestPeriodActions(
      [
        {
          startDate: d(2026, 8, 1),
          endDate: d(2026, 8, 17),
          annualRate: 3.35,
          principalAmount: 500_000,
          notes: 'หยุดคิดดอกเบี้ย',
        },
        {
          startDate: d(2026, 8, 17),
          endDate: null,
          annualRate: 5,
          principalAmount: 500_000,
          notes: 'เริ่มคิดดอกเบี้ยใหม่',
        },
      ],
      accruing
    );
    expect(rows[0].endAction).toBe('STOPPED');
    expect(rows[1].startAction).toBe('RESUME');
  });
});

describe('formatPeriodNote', () => {
  test('system only, system + user, and does not duplicate the system phrase', () => {
    expect(formatPeriodNote('หยุดคิดดอกเบี้ย')).toBe('หยุดคิดดอกเบี้ย');
    expect(formatPeriodNote('หยุดคิดดอกเบี้ย', null, 'ลูกค้าขอพัก')).toBe('หยุดคิดดอกเบี้ย\nลูกค้าขอพัก');
    expect(formatPeriodNote('หยุดคิดดอกเบี้ย', 'เริ่มคิดดอกเบี้ย', 'ลูกค้าขอพัก')).toBe(
      'เริ่มคิดดอกเบี้ย\nหยุดคิดดอกเบี้ย\nลูกค้าขอพัก'
    );
    expect(formatPeriodNote('หยุดคิดดอกเบี้ย', 'เริ่มคิดดอกเบี้ย\nหยุดคิดดอกเบี้ย')).toBe(
      'เริ่มคิดดอกเบี้ย\nหยุดคิดดอกเบี้ย'
    );
  });
});

describe('formatRatePercent', () => {
  test('always two decimal places', () => {
    expect(formatRatePercent(3.35)).toBe('3.35%');
    expect(formatRatePercent(5)).toBe('5.00%');
  });
});
