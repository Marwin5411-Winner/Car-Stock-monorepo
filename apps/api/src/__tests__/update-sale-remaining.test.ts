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
 * Also covers the "metadata-only save" path: the form re-sends total/deposit
 * on every save (including when only deliveryDate changes). Remaining must
 * only recompute when financial values actually differ from the DB, so
 * delivery-date edits don't fail with BAD_REQUEST on inconsistent rows.
 *
 * Helpers are imported from sales-remaining.ts (same module used by production).
 */

import { describe, it, expect } from 'bun:test';
import {
  initialRemaining,
  moneyEquals,
  recalcRemaining,
  shouldRecalcRemaining,
} from '../modules/sales/sales-remaining';

describe('updateSale — remaining-amount recalculation', () => {
  // ─── Baseline: same agreed deposit, customer paid in full ────────────────
  it('full payment: remaining drops to 0', () => {
    const r = recalcRemaining(1_000_000, 100_000, 1_000_000);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.remaining).toBe(0);
  });

  it('no payment yet: remaining = total (deposit is informational, not subtracted)', () => {
    // Customer has not paid anything. depositAmount on the form is just the
    // agreed target. The previous max() formula subtracted deposit from
    // total here, which overstated the settled amount.
    const r = recalcRemaining(1_000_000, 100_000, 0);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.remaining).toBe(1_000_000);
  });

  it('deposit fully paid: remaining = total - deposit (matches createSale formula)', () => {
    const r = recalcRemaining(1_000_000, 100_000, 100_000);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.remaining).toBe(900_000);
  });

  it('partial deposit: remaining = total - paid (NOT total - deposit)', () => {
    // Customer paid 50k against a 100k agreed deposit. With the old max()
    // formula this would compute 900,000 remaining, implying the customer
    // had settled 100k — wrong, they only paid 50k.
    const r = recalcRemaining(1_000_000, 100_000, 50_000);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.remaining).toBe(950_000);
  });

  // ─── REGRESSION: the bug the old max() formula caused ────────────────────
  it('REGRESSION: operator raises deposit above paid → remaining must NOT drop', () => {
    // Customer paid 100k. Operator edits the form and bumps depositAmount
    // from 100k → 200k. With max(), remaining dropped to total - 200k,
    // pretending the customer had settled 200k they had not paid.
    // With the new formula, remaining stays at total - 100k = 900k.
    const r = recalcRemaining(1_000_000, 200_000, 100_000);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.remaining).toBe(900_000);
  });

  it('REGRESSION: operator clears deposit, customer has not paid → remaining = total', () => {
    const r = recalcRemaining(1_000_000, 0, 0);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.remaining).toBe(1_000_000);
  });

  // ─── Edge cases ──────────────────────────────────────────────────────────
  it('down payment + finance payment settle the rest', () => {
    // After deposit (100k) + down payment (200k) + finance disbursement (700k).
    const r = recalcRemaining(1_000_000, 100_000, 1_000_000);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.remaining).toBe(0);
  });

  it('reducing total below paid throws (cannot owe negative)', () => {
    // Customer paid 1M. Operator tries to lower total to 900k.
    const r = recalcRemaining(900_000, 100_000, 1_000_000);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toMatch(/ค้างชำระติดลบ/);
  });

  it('deposit > total throws (form-level validation, not a calc bug)', () => {
    const r = recalcRemaining(500_000, 600_000, 0);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toMatch(/มัดจำต้องไม่เกินยอดรวม/);
  });

  it('zero total, zero paid, zero deposit → remaining 0', () => {
    const r = recalcRemaining(0, 0, 0);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.remaining).toBe(0);
  });
});

describe('updateSale — skip remaining when financials unchanged (deliveryDate edit)', () => {
  it('REGRESSION: re-sending same total/deposit/fees must NOT recalculate', () => {
    // Form always re-sends money fields when user only edits deliveryDate.
    // If paid already exceeds total+fees (legacy inconsistency), recalculating
    // would throw BAD_REQUEST and block the date save.
    const should = shouldRecalcRemaining({
      oldTotal: 1_000_000,
      oldDeposit: 100_000,
      oldFees: 0,
      newTotal: 1_000_000,
      newDeposit: 100_000,
      newFees: 0,
      totalPresent: true,
      depositPresent: true,
    });
    expect(should).toBe(false);

    // Even if paid is inconsistent, skipping recalc lets the date save.
    const wouldThrowIfRecalc = recalcRemaining(1_000_000, 100_000, 1_200_000, 0);
    expect(wouldThrowIfRecalc.ok).toBe(false);
  });

  it('float noise at sub-satang level is treated as unchanged', () => {
    expect(
      shouldRecalcRemaining({
        oldTotal: 1_000_000,
        oldDeposit: 100_000,
        oldFees: 0,
        newTotal: 1_000_000.001,
        newDeposit: 100_000,
        newFees: 0,
        totalPresent: true,
        depositPresent: true,
      })
    ).toBe(false);
    // Both round to 1000 satang; half-satang cases stay distinct when rounds differ
    expect(moneyEquals(10.001, 10.004)).toBe(true);
    expect(moneyEquals(10.0, 10.01)).toBe(false);
  });

  it('actual total change still recalculates', () => {
    expect(
      shouldRecalcRemaining({
        oldTotal: 1_000_000,
        oldDeposit: 100_000,
        oldFees: 0,
        newTotal: 900_000,
        newDeposit: 100_000,
        newFees: 0,
        totalPresent: true,
        depositPresent: true,
      })
    ).toBe(true);
  });

  it('actual fee change still recalculates', () => {
    expect(
      shouldRecalcRemaining({
        oldTotal: 1_000_000,
        oldDeposit: 0,
        oldFees: 0,
        newTotal: 1_000_000,
        newDeposit: 0,
        newFees: 28_000,
        totalPresent: true,
        depositPresent: true,
      })
    ).toBe(true);
  });
});

describe('updateSale — buyer-charged fees add to remaining', () => {
  it('fees only, nothing paid: remaining = total + fees', () => {
    // 1M car + 25k insurance + 600 พรบ + 2,400 registration
    const r = recalcRemaining(1_000_000, 0, 0, 28_000);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.remaining).toBe(1_028_000);
  });

  it('car fully paid but fees outstanding: remaining = fees (not 0)', () => {
    const r = recalcRemaining(1_000_000, 100_000, 1_000_000, 28_000);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.remaining).toBe(28_000);
  });

  it('car + fees fully paid: remaining = 0', () => {
    const r = recalcRemaining(1_000_000, 100_000, 1_028_000, 28_000);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.remaining).toBe(0);
  });

  it('zero fees behaves exactly like before (backward compat)', () => {
    const r = recalcRemaining(1_000_000, 100_000, 50_000, 0);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.remaining).toBe(950_000);
  });

  it('overpay beyond total + fees throws', () => {
    const r = recalcRemaining(900_000, 0, 1_000_000, 28_000);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toMatch(/ค้างชำระติดลบ/);
  });
});

describe('createSale — initial remaining includes buyer-charged fees', () => {
  it('with deposit and fees: remaining = total + fees − deposit', () => {
    expect(initialRemaining(1_000_000, 100_000, 28_000)).toBe(928_000);
  });

  it('no fees: unchanged legacy behavior', () => {
    expect(initialRemaining(1_000_000, 100_000)).toBe(900_000);
  });
});
