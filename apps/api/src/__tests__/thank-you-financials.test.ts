import { describe, expect, test } from 'bun:test';
import {
  computeThankYouFinancials,
  resolveCarDiscount,
  resolveThankYouSellingPrice,
} from '../modules/pdf/thank-you-financials';

// Ground truth computed BY HAND, independent of the implementation, mirroring the
// customer's .ods "ขอขอบคุณ" sheet formulas:
//   คงเหลือ (remaining)        = ราคาขาย - ส่วนลดรถ
//   ยอดจัดไฟแนนซ์ (finance)     = คงเหลือ - เงินดาวน์
//   ค่างวด (monthlyPayment)     = round2( (finance + finance*(rate%/100)*(terms/12)) / terms )
//                                 flat-rate / add-on interest, kept to 2 decimals to match .ods
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
    // totalInterest = 600,000 * 0.0249 * 6 = 89,640 ; (600,000+89,640)/72 = 9578.3333 -> 9578.33
    expect(r.monthlyPayment).toBe(9_578.33);
  });

  test("matches the customer's .ods งวดละ to 2 decimals (9,620.55)", () => {
    // Exact scenario from the reported letter: ราคาขาย 759,900 / ส่วนลด 20,000 /
    // เงินดาวน์ 221,970 / ดอกเบี้ย 2.29% / 60 เดือน
    const r = computeThankYouFinancials({
      sellingPrice: 759_900,
      carDiscount: 20_000,
      downPayment: 221_970,
      interestRatePercentPerYear: 2.29,
      termMonths: 60,
      isFinanced: true,
    });
    expect(r.remaining).toBe(739_900); // 759,900 - 20,000
    expect(r.financeAmount).toBe(517_930); // 739,900 - 221,970
    // interest = 517,930 * 0.0229 * 5 = 59,302.985 ; (517,930+59,302.985)/60 = 9,620.5497.. -> 9,620.55
    expect(r.monthlyPayment).toBe(9_620.55);
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
    // CASH: remaining − deposit (0) + registration (0) = 480,000
    expect(r.totalDelivery).toBe(480_000);
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

  test('FINANCE รวมเงินออกรถ = down - downDiscount + insurance + act + registration', () => {
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

  test('CASH รวมเงินออกรถ = remaining - deposit + registration (คงเหลือ − จอง + จดทะเบียน)', () => {
    const r = computeThankYouFinancials({
      sellingPrice: 1_000_000,
      carDiscount: 50_000,
      downPayment: 0,
      deposit: 20_000,
      interestRatePercentPerYear: 0,
      termMonths: 0,
      isFinanced: false,
    });
    expect(r.remaining).toBe(950_000);
    expect(r.totalDelivery).toBe(930_000);
  });

  test('CASH totalDelivery ignores downPayment/insurance/act when not financed', () => {
    const r = computeThankYouFinancials({
      sellingPrice: 500_000,
      carDiscount: 0,
      downPayment: 100_000,
      deposit: 0,
      insurance: 25_000,
      actInsurance: 600,
      interestRatePercentPerYear: 0,
      termMonths: 0,
      isFinanced: false,
    });
    // remaining 500k − deposit 0 (not down + insurance/act)
    expect(r.totalDelivery).toBe(500_000);
  });

  test('CASH totalDelivery adds registrationFee', () => {
    const r = computeThankYouFinancials({
      sellingPrice: 500_000,
      carDiscount: 0,
      downPayment: 0,
      deposit: 0,
      registrationFee: 4_000,
      interestRatePercentPerYear: 0,
      termMonths: 0,
      isFinanced: false,
    });
    expect(r.totalDelivery).toBe(504_000);
  });

  test('CASH Maynie: 539900 − 20000 − 10000 + 4000 = 513900', () => {
    const r = computeThankYouFinancials({
      sellingPrice: 539_900,
      carDiscount: 20_000,
      downPayment: 0,
      deposit: 10_000,
      insurance: 0,
      actInsurance: 0,
      registrationFee: 4_000,
      interestRatePercentPerYear: 0,
      termMonths: 0,
      isFinanced: false,
    });
    expect(r.remaining).toBe(519_900);
    expect(r.totalDelivery).toBe(513_900);
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

// Regression: letter used Sale.totalAmount as ราคาขาย. totalAmount is already
// net of carDiscount (engine autoTotal), so subtracting discount again printed
// 739,900 / 20,000 / 719,900 instead of the customer's 759,900 / 20,000 / 739,900.
describe('resolveThankYouSellingPrice — list price, not net totalAmount', () => {
  test('reconstructs model list price from totalAmount + carDiscount', () => {
    expect(resolveThankYouSellingPrice(759_900, 739_900, 20_000)).toBe(759_900);
  });

  test('stock expectedSalePrice wins over model list price', () => {
    expect(resolveThankYouSellingPrice(759_900, 769_900, 0)).toBe(769_900);
    expect(resolveThankYouSellingPrice(759_900, 749_900, 20_000)).toBe(769_900);
  });

  test('falls back to totalAmount when model price is missing and there is no discount', () => {
    expect(resolveThankYouSellingPrice(null, 759_900)).toBe(759_900);
    expect(resolveThankYouSellingPrice(0, 759_900)).toBe(759_900);
  });

  // CARSTOCK01-18 / นิภาวรรณ: stock/model price was missing so the letter used
  // sale.totalAmount (already net of carDiscount) as ราคาขาย, then subtracted
  // the discount again → 739,900 / 20,000 / 719,900.
  test('reconstructs list price from net totalAmount + carDiscount when model price is missing', () => {
    expect(resolveThankYouSellingPrice(null, 739_900, 20_000)).toBe(759_900);
    expect(resolveThankYouSellingPrice(0, 739_900, 20_000)).toBe(759_900);
  });

  test('falls back to expectedSalePrice when model has no price and total is empty', () => {
    expect(resolveThankYouSellingPrice(null, 0, 0, 0, 769_900)).toBe(769_900);
  });

  test('customer screenshot: list 759900 + discount 20000 → remaining 739900, not 719900', () => {
    const sellingPrice = resolveThankYouSellingPrice(759_900, 739_900, 20_000);
    const r = computeThankYouFinancials({
      sellingPrice,
      carDiscount: 20_000,
      downPayment: 110_985,
      interestRatePercentPerYear: 3.29,
      termMonths: 60,
      isFinanced: true,
    });
    expect(sellingPrice).toBe(759_900);
    expect(r.remaining).toBe(739_900);
    expect(r.financeAmount).toBe(628_915);
  });

  test('นิภาวรรณ: missing list price, net 739900, discount 20000 → remaining 739900 ยอดจัด 628915', () => {
    const sellingPrice = resolveThankYouSellingPrice(null, 739_900, 20_000);
    const r = computeThankYouFinancials({
      sellingPrice,
      carDiscount: 20_000,
      downPayment: 110_985,
      interestRatePercentPerYear: 3.29,
      termMonths: 60,
      isFinanced: true,
    });
    expect(sellingPrice).toBe(759_900);
    expect(r.remaining).toBe(739_900);
    expect(r.financeAmount).toBe(628_915);
  });
});
