/**
 * Thank-you letter (หนังสือขอบคุณ) financial chain.
 *
 * Recomputes คงเหลือ / ยอดจัดไฟแนนซ์ / ค่างวด live from the sale's base inputs
 * instead of trusting stored DB columns, so the printed letter always agrees
 * with the customer's .ods "ขอขอบคุณ" sheet (and with SalesFormPage). Acts as a
 * safety net: if a stored value drifts (manual edit, override, partial entry),
 * the document still shows the formula result.
 *
 * NOTE on "คงเหลือ": the ODS "คงเหลือ" = ราคาขาย − ส่วนลดรถ (price after the car
 * discount). This is NOT the same as Sale.remainingAmount, which in this system
 * is the outstanding balance (totalAmount + fees − paid). We must derive it here.
 */
export interface ThankYouFinancialsInput {
  /** ราคาขาย (sale.totalAmount) */
  sellingPrice: number;
  /** ส่วนลด (รถยนต์) — resolveCarDiscount(sale.carDiscount, sale.discountSnapshot) */
  carDiscount: number;
  /** เงินดาวน์ (sale.downPayment ?? depositAmount) */
  downPayment: number;
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
  /** รวมเงินออกรถ = เงินดาวน์ − ส่วนลดดาวน์ + ประกันชั้น1 + พรบ + จดทะเบียน */
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

export function computeThankYouFinancials(input: ThankYouFinancialsInput): ThankYouFinancials {
  const remaining = round2(input.sellingPrice - input.carDiscount);

  // รวมเงินออกรถ — cash due at delivery (ODS: I53−I54+I55+I56+I57). Independent of
  // financing; applies to cash and finance sales alike.
  const totalDelivery = round2(
    input.downPayment -
      (input.downPaymentDiscount ?? 0) +
      (input.insurance ?? 0) +
      (input.actInsurance ?? 0) +
      (input.registrationFee ?? 0)
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
