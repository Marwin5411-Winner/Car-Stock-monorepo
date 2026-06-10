/**
 * Unit tests for the remaining-amount recalculation in updateSale.
 *
 * Invariant under test:
 *   `remainingAmount = totalAmount + totalFees - paidAmount`
 *
 * We deliberately do NOT use `max(depositAmount, paidAmount)`. The earlier
 * `max()` formula over-counted whenever `depositAmount > paidAmount` — e.g.
 * an operator raised the agreed deposit on the form above what the customer
 * had actually paid, or a customer paid only a partial deposit. The test
 * cases below pin that down.
 *
 * The logic mirrors the production branch in
 * `apps/api/src/modules/sales/sales.service.ts` (updateSale), extracted so
 * it can be tested without a database. If the production formula changes,
 * update `recalcRemaining` here to match — the assertions are the spec.
 */

import { describe, it, expect } from 'bun:test';

// Mirror the formula. Numbers mirror `toNumber()` output: plain `number`.
// `fees` = insuranceFee + compulsoryInsuranceFee + registrationFee (buyer-charged).
function recalcRemaining(
  newTotal: number,
  newDeposit: number,
  paid: number,
  fees = 0
): { remaining: number; throws: false } | { throws: true; message: string } {
  if (newDeposit > newTotal) {
    return {
      throws: true,
      message: 'Deposit amount cannot exceed total amount',
    };
  }
  const remaining = newTotal + fees - paid;
  if (remaining < 0) {
    return {
      throws: true,
      message: `ยอดค้างชำระติดลบ — ไม่สามารถลดยอดได้ (ชำระแล้ว ${paid.toLocaleString()} บาท)`,
    };
  }
  return { remaining, throws: false };
}

describe('updateSale — remaining-amount recalculation', () => {
  // ─── Baseline: same agreed deposit, customer paid in full ────────────────
  it('full payment: remaining drops to 0', () => {
    const r = recalcRemaining(1_000_000, 100_000, 1_000_000);
    expect(r.throws).toBe(false);
    if (!r.throws) expect(r.remaining).toBe(0);
  });

  it('no payment yet: remaining = total (deposit is informational, not subtracted)', () => {
    // Customer has not paid anything. depositAmount on the form is just the
    // agreed target. The previous max() formula subtracted deposit from
    // total here, which overstated the settled amount.
    const r = recalcRemaining(1_000_000, 100_000, 0);
    expect(r.throws).toBe(false);
    if (!r.throws) expect(r.remaining).toBe(1_000_000);
  });

  it('deposit fully paid: remaining = total - deposit (matches createSale formula)', () => {
    const r = recalcRemaining(1_000_000, 100_000, 100_000);
    expect(r.throws).toBe(false);
    if (!r.throws) expect(r.remaining).toBe(900_000);
  });

  it('partial deposit: remaining = total - paid (NOT total - deposit)', () => {
    // Customer paid 50k against a 100k agreed deposit. With the old max()
    // formula this would compute 900,000 remaining, implying the customer
    // had settled 100k — wrong, they only paid 50k.
    const r = recalcRemaining(1_000_000, 100_000, 50_000);
    expect(r.throws).toBe(false);
    if (!r.throws) expect(r.remaining).toBe(950_000);
  });

  // ─── REGRESSION: the bug the old max() formula caused ────────────────────
  it('REGRESSION: operator raises deposit above paid → remaining must NOT drop', () => {
    // Customer paid 100k. Operator edits the form and bumps depositAmount
    // from 100k → 200k. With max(), remaining dropped to total - 200k,
    // pretending the customer had settled 200k they had not paid.
    // With the new formula, remaining stays at total - 100k = 900k.
    const r = recalcRemaining(1_000_000, 200_000, 100_000);
    expect(r.throws).toBe(false);
    if (!r.throws) expect(r.remaining).toBe(900_000);
  });

  it('REGRESSION: operator clears deposit, customer has not paid → remaining = total', () => {
    const r = recalcRemaining(1_000_000, 0, 0);
    expect(r.throws).toBe(false);
    if (!r.throws) expect(r.remaining).toBe(1_000_000);
  });

  // ─── Edge cases ──────────────────────────────────────────────────────────
  it('down payment + finance payment settle the rest', () => {
    // After deposit (100k) + down payment (200k) + finance disbursement (700k).
    const r = recalcRemaining(1_000_000, 100_000, 1_000_000);
    expect(r.throws).toBe(false);
    if (!r.throws) expect(r.remaining).toBe(0);
  });

  it('reducing total below paid throws (cannot owe negative)', () => {
    // Customer paid 1M. Operator tries to lower total to 900k.
    const r = recalcRemaining(900_000, 100_000, 1_000_000);
    expect(r.throws).toBe(true);
    if (r.throws) expect(r.message).toMatch(/ค้างชำระติดลบ/);
  });

  it('deposit > total throws (form-level validation, not a calc bug)', () => {
    const r = recalcRemaining(500_000, 600_000, 0);
    expect(r.throws).toBe(true);
    if (r.throws) expect(r.message).toMatch(/Deposit amount cannot exceed total/);
  });

  it('zero total, zero paid, zero deposit → remaining 0', () => {
    const r = recalcRemaining(0, 0, 0);
    expect(r.throws).toBe(false);
    if (!r.throws) expect(r.remaining).toBe(0);
  });
});

describe('updateSale — buyer-charged fees add to remaining', () => {
  it('fees only, nothing paid: remaining = total + fees', () => {
    // 1M car + 25k insurance + 600 พรบ + 2,400 registration
    const r = recalcRemaining(1_000_000, 0, 0, 28_000);
    expect(r.throws).toBe(false);
    if (!r.throws) expect(r.remaining).toBe(1_028_000);
  });

  it('car fully paid but fees outstanding: remaining = fees (not 0)', () => {
    const r = recalcRemaining(1_000_000, 100_000, 1_000_000, 28_000);
    expect(r.throws).toBe(false);
    if (!r.throws) expect(r.remaining).toBe(28_000);
  });

  it('car + fees fully paid: remaining = 0', () => {
    const r = recalcRemaining(1_000_000, 100_000, 1_028_000, 28_000);
    expect(r.throws).toBe(false);
    if (!r.throws) expect(r.remaining).toBe(0);
  });

  it('zero fees behaves exactly like before (backward compat)', () => {
    const r = recalcRemaining(1_000_000, 100_000, 50_000, 0);
    expect(r.throws).toBe(false);
    if (!r.throws) expect(r.remaining).toBe(950_000);
  });

  it('overpay beyond total + fees throws', () => {
    const r = recalcRemaining(900_000, 0, 1_000_000, 28_000);
    expect(r.throws).toBe(true);
    if (r.throws) expect(r.message).toMatch(/ค้างชำระติดลบ/);
  });
});
