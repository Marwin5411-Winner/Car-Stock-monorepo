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
