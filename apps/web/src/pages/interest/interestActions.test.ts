import { describe, expect, it } from 'bun:test';
import {
  type InterestActionState,
  canShowInitialize,
  getInterestHeaderAction,
} from './interestActions';

/**
 * Regression tests for the "คำขอไม่ถูกต้อง" (BAD_REQUEST) bug on the interest
 * update page.
 *
 * Root cause: the detail page offered the "เริ่มคิดดอกเบี้ยใหม่" (resume) button
 * for ANY non-calculating stock, including paid-off ones. resumeInterestCalculation
 * rejects paid-off stocks → BAD_REQUEST → toast "คำขอไม่ถูกต้อง".
 */

// --- Ground truth: faithful mirror of the backend service guards ----------
// apps/api/src/modules/interest/interest.service.ts

// resumeInterestCalculation() (lines ~550-556)
function serviceRejectsResume(s: { stopInterestCalc: boolean; debtStatus: string }): boolean {
  if (!s.stopInterestCalc) return true; // 'Interest calculation is not stopped'
  if (s.debtStatus === 'PAID_OFF') return true; // 'Cannot resume interest ... paid off debt'
  return false;
}

// getStockInterestDetail() (line ~327): isCalculating derived from stock flags
function deriveIsCalculating(s: { stopInterestCalc: boolean; debtStatus: string }): boolean {
  return !s.stopInterestCalc && s.debtStatus !== 'PAID_OFF';
}

// --- The buggy gating that shipped (InterestDetailPage before the fix) -----
function oldHeaderOffersResume(isCalculating: boolean): boolean {
  return !isCalculating; // offered resume for EVERY non-calculating stock
}

interface RawStock {
  stopInterestCalc: boolean;
  debtStatus: 'NO_DEBT' | 'ACTIVE' | 'PAID_OFF';
  periodCount: number;
  stockStatus: string;
}

function toActionState(s: RawStock): InterestActionState {
  return {
    isCalculating: deriveIsCalculating(s),
    debtStatus: s.debtStatus,
    periodCount: s.periodCount,
    stockStatus: s.stockStatus,
  };
}

// Representative stock states across the relevant dimensions.
const CASES: Record<string, RawStock> = {
  activeCalculating: {
    stopInterestCalc: false,
    debtStatus: 'ACTIVE',
    periodCount: 1,
    stockStatus: 'AVAILABLE',
  },
  manuallyStopped: {
    stopInterestCalc: true,
    debtStatus: 'ACTIVE',
    periodCount: 1,
    stockStatus: 'AVAILABLE',
  },
  stoppedNoDebt: {
    stopInterestCalc: true,
    debtStatus: 'NO_DEBT',
    periodCount: 1,
    stockStatus: 'AVAILABLE',
  },
  paidOffStopped: {
    stopInterestCalc: true,
    debtStatus: 'PAID_OFF',
    periodCount: 2,
    stockStatus: 'SOLD',
  },
  paidOffNotStopped: {
    stopInterestCalc: false,
    debtStatus: 'PAID_OFF',
    periodCount: 2,
    stockStatus: 'SOLD',
  },
};

describe('interest header action — bug reproduction (old gating)', () => {
  it('documents the bug: a paid-off stock was offered resume, which the API rejects', () => {
    const s = CASES.paidOffStopped;
    const isCalculating = deriveIsCalculating(s);

    // Old UI offered the resume button...
    expect(oldHeaderOffersResume(isCalculating)).toBe(true);
    // ...but the service rejects resuming a paid-off stock → BAD_REQUEST.
    expect(serviceRejectsResume(s)).toBe(true);
    // => the user saw "คำขอไม่ถูกต้อง" when pressing บันทึก.
  });
});

describe('interest header action — fixed gating', () => {
  it('offers EDIT_AND_STOP while actively calculating', () => {
    expect(getInterestHeaderAction(toActionState(CASES.activeCalculating))).toBe('EDIT_AND_STOP');
  });

  it('offers RESUME for a manually stopped stock (service accepts)', () => {
    expect(getInterestHeaderAction(toActionState(CASES.manuallyStopped))).toBe('RESUME');
    expect(getInterestHeaderAction(toActionState(CASES.stoppedNoDebt))).toBe('RESUME');
  });

  it('does NOT offer RESUME for a paid-off stock (shows PAID_OFF instead)', () => {
    expect(getInterestHeaderAction(toActionState(CASES.paidOffStopped))).toBe('PAID_OFF');
    expect(getInterestHeaderAction(toActionState(CASES.paidOffNotStopped))).toBe('PAID_OFF');
  });

  it('INVARIANT: whenever the UI offers RESUME, the service accepts it', () => {
    for (const [name, s] of Object.entries(CASES)) {
      const action = getInterestHeaderAction(toActionState(s));
      if (action === 'RESUME') {
        expect(serviceRejectsResume(s), `resume offered but rejected for "${name}"`).toBe(false);
      }
    }
  });
});

describe('interest initialize link gating', () => {
  it('hides initialize for paid-off and sold stocks', () => {
    expect(canShowInitialize(toActionState(CASES.paidOffStopped))).toBe(false);
    expect(
      canShowInitialize({
        isCalculating: false,
        debtStatus: 'ACTIVE',
        periodCount: 1,
        stockStatus: 'AVAILABLE',
      })
    ).toBe(false); // has periods already
  });

  it('shows initialize for a fresh, non-sold stock with no periods', () => {
    expect(
      canShowInitialize({
        isCalculating: false,
        debtStatus: 'NO_DEBT',
        periodCount: 0,
        stockStatus: 'AVAILABLE',
      })
    ).toBe(true);
  });
});
