import { computeDeliveryTotal, resolveSaleCarPrice } from '@car-stock/shared/finance';

/**
 * Thank-you letter (หนังสือขอบคุณ) financial chain.
 *
 * Recomputes คงเหลือ / ยอดจัดไฟแนนซ์ / ค่างวด / รวมเงินออกรถ live from the sale's
 * base inputs instead of trusting stored DB columns, so the printed letter always
 * agrees with the customer's .ods "ขอขอบคุณ" sheet (and with FinanceSheet).
 *
 * NOTE on "คงเหลือ": the ODS "คงเหลือ" = ราคาขาย − ส่วนลดรถ (price after the car
 * discount). This is NOT the same as Sale.remainingAmount, which in this system
 * is the outstanding balance (totalAmount + fees − paid). We must derive it here.
 *
 * NOTE on "รวมเงินออกรถ" (mode-dependent, same as FinanceSheet / sales-record):
 * - CASH: คงเหลือ − เงินจอง + ค่าจดทะเบียน
 * - FINANCE/MIXED: เงินดาวน์ − ส่วนลดดาวน์ + ประกัน + พรบ + จดทะเบียน
 */
export interface ThankYouFinancialsInput {
  /** ราคาขาย = FinanceSheet carPrice (ราคาที่เลือกจากรุ่นรถหรือ Stock) */
  sellingPrice: number;
  /** ส่วนลด (รถยนต์) — resolveCarDiscount(sale.carDiscount, sale.discountSnapshot) */
  carDiscount: number;
  /** เงินดาวน์ (sale.downPayment) */
  downPayment: number;
  /** เงินจอง / เงินมัดจำ (sale.depositAmount) — used for CASH totalDelivery */
  deposit?: number;
  /** ส่วนลด (เงินดาวน์) (sale.downPaymentDiscount) */
  downPaymentDiscount?: number;
  /** ค่าประกันภัยชั้น 1 (sale.insuranceFee) */
  insurance?: number;
  /** ค่าพรบ. (sale.compulsoryInsuranceFee) */
  actInsurance?: number;
  /** ค่าจดทะเบียน (sale.registrationFee) */
  registrationFee?: number;
  /** อัตราดอกเบี้ยต่อปี as a percent, e.g. 2.49 = 2.49%/yr (sale.interestRate) */
  interestRatePercentPerYear: number;
  /** จำนวนงวด (เดือน) (sale.numberOfTerms) */
  termMonths: number;
  /** true unless this is a cash sale — cash sales carry no finance/installment */
  isFinanced: boolean;
}

export interface ThankYouFinancials {
  /** คงเหลือ = ราคาขาย − ส่วนลดรถ */
  remaining: number;
  /**
   * รวมเงินออกรถ:
   * - cash: remaining − deposit + registration
   * - finance: down − downDiscount + insurance + act + registration
   */
  totalDelivery: number;
  /** ยอดจัดไฟแนนซ์ = คงเหลือ − เงินดาวน์ (0 for cash sales) */
  financeAmount: number;
  /** ค่างวด, flat-rate add-on interest, 2 decimals (0 when not financed / no terms) */
  monthlyPayment: number;
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

/** Prisma Decimal columns arrive as objects with toString(); accept those, numbers, or null. */
type Decimalish = { toString(): string } | number | null | undefined;

const toNum = (v: Decimalish): number | null => (v == null ? null : Number(v));

/**
 * ส่วนลด (รถยนต์) shown on the thank-you letter.
 *
 * The sale form ("ส่วนลดตัวรถ") writes the manual discount to Sale.carDiscount.
 * Sale.discountSnapshot is only populated when a sale is converted from a quotation.
 * Prefer carDiscount, fall back to discountSnapshot, else 0 — same precedence used by
 * reports.service.ts and campaign-claim.helpers.ts so every document agrees.
 */
export function resolveCarDiscount(carDiscount: Decimalish, discountSnapshot: Decimalish): number {
  const car = toNum(carDiscount);
  if (car != null) return car;
  return toNum(discountSnapshot) ?? 0;
}

/**
 * ราคาขาย on the thank-you letter = FinanceSheet carPrice (the price the user
 * picked from model or Stock), not Sale.totalAmount. totalAmount is already
 * net of carDiscount (engine: totalAmount = carPrice − carDiscount + charges).
 * Using it as ราคาขาย then subtracting carDiscount again double-counts.
 *
 * Reconstructs list price from saved sale fields so a Stock expectedSalePrice
 * selection is not overwritten by vehicleModel.price. If list price is missing
 * (CARSTOCK01-18), same reconstruct: net + ส่วนลดรถ.
 */
export function resolveThankYouSellingPrice(
  vehicleModelPrice: Decimalish,
  totalAmount: Decimalish,
  carDiscount: Decimalish = 0,
  customCustomerCharges: Decimalish = 0,
  expectedSalePrice: Decimalish = 0
): number {
  return resolveSaleCarPrice({
    totalAmount,
    carDiscount,
    customCustomerCharges,
    vehicleModelPrice,
    expectedSalePrice,
  });
}

export function computeThankYouFinancials(input: ThankYouFinancialsInput): ThankYouFinancials {
  const remaining = round2(input.sellingPrice - input.carDiscount);

  // รวมเงินออกรถ — same helper as FinanceSheet / sales-record
  const totalDelivery = round2(
    computeDeliveryTotal({
      paymentMode: input.isFinanced ? 'FINANCE' : 'CASH',
      totalAmount: remaining,
      deposit: input.deposit ?? 0,
      downPayment: input.downPayment,
      downPaymentDiscount: input.downPaymentDiscount ?? 0,
      insuranceFee: input.insurance ?? 0,
      compulsoryInsuranceFee: input.actInsurance ?? 0,
      registrationFee: input.registrationFee ?? 0,
    })
  );

  const financeAmount = input.isFinanced ? round2(remaining - input.downPayment) : 0;

  // งวดละ = (finance + finance × (rate/100) × (terms/12)) / terms. Same flat-rate
  // formula as SalesFormPage:584-586 but kept to 2 decimals (not whole baht) so the
  // printed letter matches the customer's .ods "ขอบคุณ" sheet exactly. Guard divide-by-zero.
  let monthlyPayment = 0;
  if (input.isFinanced && input.termMonths > 0 && financeAmount > 0) {
    const years = input.termMonths / 12;
    const totalInterest = financeAmount * (input.interestRatePercentPerYear / 100) * years;
    monthlyPayment = round2((financeAmount + totalInterest) / input.termMonths);
  }

  return { remaining, totalDelivery, financeAmount, monthlyPayment };
}
