/**
 * Pure helpers for sale remaining-amount math.
 * Used by sales.service update/create paths and unit tests so formula and
 * "skip recalc when unchanged" guards cannot drift.
 */

/** Compare money amounts at 2 decimal places (satang). */
export function moneyEquals(a: number, b: number): boolean {
  return Math.round(a * 100) === Math.round(b * 100);
}

export type RecalcRemainingResult =
  | { ok: true; remaining: number }
  | { ok: false; message: string };

/**
 * remainingAmount = totalAmount + fees − paidAmount
 * depositAmount is validated ≤ total but is not subtracted (informational only).
 */
export function recalcRemaining(
  newTotal: number,
  newDeposit: number,
  paid: number,
  fees = 0
): RecalcRemainingResult {
  if (newDeposit > newTotal) {
    return {
      ok: false,
      message: 'จำนวนเงินมัดจำต้องไม่เกินยอดรวม',
    };
  }
  const remaining = newTotal + fees - paid;
  if (remaining < 0) {
    return {
      ok: false,
      message: `ยอดค้างชำระติดลบ — ไม่สามารถลดยอดได้ (ชำระแล้ว ${paid.toLocaleString()} บาท)`,
    };
  }
  return { ok: true, remaining };
}

/** Only recompute remaining when money fields actually change vs DB. */
export function shouldRecalcRemaining(opts: {
  oldTotal: number;
  oldDeposit: number;
  oldFees: number;
  newTotal: number;
  newDeposit: number;
  newFees: number;
  totalPresent: boolean;
  depositPresent: boolean;
}): boolean {
  const totalChanged = opts.totalPresent && !moneyEquals(opts.newTotal, opts.oldTotal);
  const depositChanged = opts.depositPresent && !moneyEquals(opts.newDeposit, opts.oldDeposit);
  const feesChanged = !moneyEquals(opts.newFees, opts.oldFees);
  return totalChanged || depositChanged || feesChanged;
}

/** createSale: initial remaining = total + fees − depositAmount (agreed deposit). */
export function initialRemaining(total: number, deposit: number, fees = 0): number {
  return total + fees - deposit;
}
