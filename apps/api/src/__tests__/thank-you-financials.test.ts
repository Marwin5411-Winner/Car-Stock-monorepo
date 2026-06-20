import { describe, expect, test } from 'bun:test';
import { computeThankYouFinancials, resolveCarDiscount } from '../modules/pdf/thank-you-financials';

// Ground truth computed BY HAND, independent of the implementation, mirroring the
// customer's .ods "ขอขอบคุณ" sheet formulas:
//   คงเหลือ (remaining)        = ราคาขาย - ส่วนลดรถ
//   ยอดจัดไฟแนนซ์ (finance)     = คงเหลือ - เงินดาวน์
//   ค่างวด (monthlyPayment)     = round( (finance + finance*(rate%/100)*(terms/12)) / terms )
//                                 flat-rate / add-on interest (same as SalesFormPage)
describe('computeThankYouFinancials — ODS ขอบคุณ formulas', () => {
  test('finance sale: full chain remaining -> finance -> monthly', () => {
    const r = computeThankYouFinancials({
      sellingPrice: 800_000,
      carDiscount: 50_000,
      downPayment: 150_000,
      interestRatePercentPerYear: 2.49,
      termMonths: 72,
      isFinanced: true,
    });
    expect(r.remaining).toBe(750_000); // 800,000 - 50,000
    expect(r.financeAmount).toBe(600_000); // 750,000 - 150,000
    // totalInterest = 600,000 * 0.0249 * 6 = 89,640 ; (600,000+89,640)/72 = 9578.33 -> 9578
    expect(r.monthlyPayment).toBe(9_578);
  });

  test('matches SalesFormPage flat-rate exactly (round numbers)', () => {
    const r = computeThankYouFinancials({
      sellingPrice: 620_000,
      carDiscount: 20_000,
      downPayment: 0,
      interestRatePercentPerYear: 5,
      termMonths: 12,
      isFinanced: true,
    });
    expect(r.financeAmount).toBe(600_000);
    // interest = 600,000 * 0.05 * 1 = 30,000 ; (630,000)/12 = 52,500
    expect(r.monthlyPayment).toBe(52_500);
  });

  test('cash sale: no financing, monthly = 0, finance = 0', () => {
    const r = computeThankYouFinancials({
      sellingPrice: 500_000,
      carDiscount: 20_000,
      downPayment: 0,
      interestRatePercentPerYear: 0,
      termMonths: 0,
      isFinanced: false,
    });
    expect(r.remaining).toBe(480_000); // still shows price after discount
    expect(r.financeAmount).toBe(0);
    expect(r.monthlyPayment).toBe(0);
  });

  test('finance sale with zero terms does not divide by zero', () => {
    const r = computeThankYouFinancials({
      sellingPrice: 300_000,
      carDiscount: 0,
      downPayment: 100_000,
      interestRatePercentPerYear: 3,
      termMonths: 0,
      isFinanced: true,
    });
    expect(r.financeAmount).toBe(200_000);
    expect(r.monthlyPayment).toBe(0);
  });

  test('รวมเงินออกรถ = down - downDiscount + insurance + act + registration', () => {
    const r = computeThankYouFinancials({
      sellingPrice: 800_000,
      carDiscount: 0,
      downPayment: 150_000,
      downPaymentDiscount: 5_000,
      insurance: 20_000,
      actInsurance: 600,
      registrationFee: 3_000,
      interestRatePercentPerYear: 0,
      termMonths: 0,
      isFinanced: true,
    });
    // 150,000 - 5,000 + 20,000 + 600 + 3,000 = 168,600
    expect(r.totalDelivery).toBe(168_600);
  });

  test('totalDelivery defaults missing fee fields to 0', () => {
    const r = computeThankYouFinancials({
      sellingPrice: 500_000,
      carDiscount: 0,
      downPayment: 100_000,
      interestRatePercentPerYear: 0,
      termMonths: 0,
      isFinanced: false,
    });
    expect(r.totalDelivery).toBe(100_000); // only downPayment present
  });

  test('rounds money fields to 2 decimals (no float drift)', () => {
    const r = computeThankYouFinancials({
      sellingPrice: 100_000.5,
      carDiscount: 0.25,
      downPayment: 10_000.1,
      interestRatePercentPerYear: 0,
      termMonths: 0,
      isFinanced: true,
    });
    expect(r.remaining).toBe(100_000.25);
    expect(r.financeAmount).toBe(90_000.15);
  });
});

// Regression for: thank-you letter showed ส่วนลด (รถยนต์) = 0 because the controller
// sourced the discount from sale.discountSnapshot only, while the sale form writes the
// manual "ส่วนลดตัวรถ" to sale.carDiscount. Precedence must match reports.service.ts.
describe('resolveCarDiscount — ส่วนลดตัวรถ field precedence', () => {
  test('prefers carDiscount (the manual sale-form entry) over discountSnapshot', () => {
    expect(resolveCarDiscount(20_000, 0)).toBe(20_000);
    expect(resolveCarDiscount(20_000, 5_000)).toBe(20_000);
  });

  test('uses carDiscount even when it is 0 (explicit no-discount)', () => {
    // carDiscount present-but-zero must NOT silently fall through to a stale snapshot
    expect(resolveCarDiscount(0, 5_000)).toBe(0);
  });

  test('falls back to discountSnapshot when carDiscount is null (quotation-derived sale)', () => {
    expect(resolveCarDiscount(null, 20_000)).toBe(20_000);
  });

  test('returns 0 when neither field is set', () => {
    expect(resolveCarDiscount(null, null)).toBe(0);
    expect(resolveCarDiscount(undefined, undefined)).toBe(0);
  });

  test('accepts Prisma Decimal-like objects (toString)', () => {
    const decimal = (s: string) => ({ toString: () => s });
    expect(resolveCarDiscount(decimal('20000'), decimal('0'))).toBe(20_000);
    expect(resolveCarDiscount(null, decimal('15000.5'))).toBe(15_000.5);
  });
});
