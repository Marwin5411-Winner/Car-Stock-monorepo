import type { FinanceEngineInput, FinanceEngineResult } from '@car-stock/shared/finance';
import type { PaymentMode, SaleFinanceCustomLine } from '../../services/sales.service';

/** Sale-like money fields + finance overrides used by the sheet. */
export interface FinanceSheetValue {
  paymentMode?: PaymentMode;
  totalAmount?: number;
  depositAmount?: number;
  carDiscount?: number | string | null;
  downPaymentDiscount?: number | null;
  insuranceFee?: number | null;
  compulsoryInsuranceFee?: number | null;
  registrationFee?: number | null;
  downPayment?: number | null;
  financeAmount?: number | null;
  financeProvider?: string | null;
  interestRate?: number | null;
  numberOfTerms?: number | null;
  monthlyInstallment?: number | null;
  salesCommission?: number | null;
  salesExpense?: number | null;
  financeCommission?: number | null;
  financeEditedKeys?: string[];
  customLines?: SaleFinanceCustomLine[];
}

export type SaleLikeForEngine = FinanceSheetValue & {
  paymentMode: PaymentMode;
};

export function saleToEngineInput(
  saleLike: SaleLikeForEngine,
  carPrice: number
): FinanceEngineInput {
  const num = (v: unknown) => (v == null || v === '' ? 0 : Number(v));
  return {
    paymentMode: saleLike.paymentMode,
    carPrice,
    values: {
      car_price: carPrice,
      car_discount: num(saleLike.carDiscount),
      down_payment_discount: num(saleLike.downPaymentDiscount),
      insurance_fee: num(saleLike.insuranceFee),
      compulsory_insurance_fee: num(saleLike.compulsoryInsuranceFee),
      registration_fee: num(saleLike.registrationFee),
      deposit: num(saleLike.depositAmount),
      total_amount: num(saleLike.totalAmount),
      down_payment: num(saleLike.downPayment),
      finance_amount: num(saleLike.financeAmount),
      finance_provider: saleLike.financeProvider ?? '',
      interest_rate: num(saleLike.interestRate),
      number_of_terms: num(saleLike.numberOfTerms),
      monthly_installment: num(saleLike.monthlyInstallment),
      sales_commission: num(saleLike.salesCommission),
      sales_expense: num(saleLike.salesExpense),
      finance_commission: num(saleLike.financeCommission),
    },
    editedKeys: saleLike.financeEditedKeys ?? [],
    customLines: saleLike.customLines ?? [],
  };
}

export function engineResultToFormPatch(result: Pick<FinanceEngineResult, 'salePatch'>) {
  return result.salePatch;
}

/** Merge engine output + overrides into a FinanceSheetValue for parent form state. */
export function engineInputToSheetValue(
  base: FinanceSheetValue,
  engineInput: FinanceEngineInput,
  result: FinanceEngineResult
): FinanceSheetValue {
  return {
    ...base,
    paymentMode: engineInput.paymentMode,
    ...engineResultToFormPatch(result),
    financeEditedKeys: engineInput.editedKeys,
    customLines: engineInput.customLines as SaleFinanceCustomLine[],
  };
}
