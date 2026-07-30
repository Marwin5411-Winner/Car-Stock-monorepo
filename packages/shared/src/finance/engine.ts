import { SYSTEM_ROW_CATALOG } from './catalog';
import type {
  FinanceEngineInput,
  FinanceEngineResult,
  FinanceSheetRow,
  SystemFinanceKey,
} from './types';

const n = (v: unknown, fallback = 0): number => {
  const x = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(x) ? x : fallback;
};

const isEdited = (editedKeys: string[], key: string) => editedKeys.includes(key);

function monthlyInstallment(finance: number, ratePercent: number, terms: number): number {
  if (finance <= 0 || terms <= 0 || ratePercent <= 0) return 0;
  const years = terms / 12;
  const totalInterest = finance * (ratePercent / 100) * years;
  return Math.round((finance + totalInterest) / terms);
}

/** Keys the engine auto-computes; only these enter editedKeys when user overrides. */
const AUTO_EDITABLE_KEYS = new Set<SystemFinanceKey>([
  'car_price',
  'total_amount',
  'finance_amount',
  'monthly_installment',
  'finance_commission',
]);

/** Sales staff commission: locked at 9% of car list price. */
export const SALES_COMMISSION_RATE = 0.09;

export function previewSalesCommission(carPrice: number): number {
  if (carPrice <= 0) return 0;
  return Math.round(carPrice * SALES_COMMISSION_RATE);
}

/** 8% finance commission preview (same structure as SalesDetailPage). */
export function previewFinanceCommission(
  financeAmount: number,
  interestRatePercent: number,
  numberOfTerms: number
): number {
  if (financeAmount <= 0 || interestRatePercent <= 0 || numberOfTerms <= 0) return 0;
  const years = numberOfTerms / 12;
  const cappedYears = Math.min(years, 4);
  const beforeVat = financeAmount / 1.07;
  return Math.round(beforeVat * (interestRatePercent / 100) * cappedYears * 0.08 * 100) / 100;
}

export type DeliveryTotalInput = {
  paymentMode: 'CASH' | 'FINANCE' | 'MIXED';
  /** Resolved total (after car discount + CUSTOMER_CHARGE custom lines). */
  totalAmount: number;
  deposit: number;
  downPayment: number;
  downPaymentDiscount: number;
  insuranceFee: number;
  compulsoryInsuranceFee: number;
  registrationFee: number;
};

/**
 * รวมเงินออกรถ — mode-dependent (customer / sales-record rules).
 * - CASH: totalAmount − deposit (ราคาขายหักส่วนลด แล้วหักจอง)
 * - FINANCE/MIXED: down − downDiscount + insurance + act + registration
 */
export function computeDeliveryTotal(input: DeliveryTotalInput): number {
  const financed = input.paymentMode === 'FINANCE' || input.paymentMode === 'MIXED';
  if (!financed) {
    return Math.max(0, n(input.totalAmount) - n(input.deposit));
  }
  return Math.max(
    0,
    n(input.downPayment) -
      n(input.downPaymentDiscount) +
      n(input.insuranceFee) +
      n(input.compulsoryInsuranceFee) +
      n(input.registrationFee)
  );
}

export function computeFinanceSheet(input: FinanceEngineInput): FinanceEngineResult {
  const { paymentMode, carPrice, values, editedKeys, customLines } = input;
  const financed = paymentMode === 'FINANCE' || paymentMode === 'MIXED';

  const car_discount = n(values.car_discount);
  const customCustomerCharges = customLines
    .filter((l) => l.group === 'CUSTOMER_CHARGE')
    .reduce((s, l) => s + n(l.amount), 0);

  const priceAfterDiscount = n(carPrice) - car_discount;
  const autoTotal = priceAfterDiscount + customCustomerCharges;

  const total_amount = isEdited(editedKeys, 'total_amount')
    ? n(values.total_amount, autoTotal)
    : autoTotal;

  const insurance_fee = n(values.insurance_fee);
  const compulsory_insurance_fee = n(values.compulsory_insurance_fee);
  const registration_fee = n(values.registration_fee);
  const buyerFees = insurance_fee + compulsory_insurance_fee + registration_fee;

  const down_payment = n(values.down_payment);
  const autoFinance = Math.max(0, priceAfterDiscount - down_payment);
  const finance_amount = !financed
    ? n(values.finance_amount)
    : isEdited(editedKeys, 'finance_amount')
      ? n(values.finance_amount, autoFinance)
      : autoFinance;

  const interest_rate = n(values.interest_rate);
  const number_of_terms = n(values.number_of_terms);
  const autoInstallment = monthlyInstallment(finance_amount, interest_rate, number_of_terms);
  const monthly_installment = !financed
    ? n(values.monthly_installment)
    : isEdited(editedKeys, 'monthly_installment')
      ? n(values.monthly_installment, autoInstallment)
      : autoInstallment;

  const autoFinComm = previewFinanceCommission(finance_amount, interest_rate, number_of_terms);
  const finance_commission = isEdited(editedKeys, 'finance_commission')
    ? n(values.finance_commission, autoFinComm)
    : autoFinComm;

  // Locked formula — always 9% of car list price (not overridable via editedKeys).
  const sales_commission = previewSalesCommission(n(carPrice));

  const deposit = n(values.deposit);
  const down_payment_discount = n(values.down_payment_discount);
  // Locked formula — mode-dependent delivery cash due (not overridable).
  const delivery_total = computeDeliveryTotal({
    paymentMode,
    totalAmount: total_amount,
    deposit,
    downPayment: down_payment,
    downPaymentDiscount: down_payment_discount,
    insuranceFee: insurance_fee,
    compulsoryInsuranceFee: compulsory_insurance_fee,
    registrationFee: registration_fee,
  });

  const resolved: Record<SystemFinanceKey, number | string> = {
    car_price: n(carPrice),
    car_discount,
    down_payment_discount,
    insurance_fee,
    compulsory_insurance_fee,
    registration_fee,
    deposit,
    total_amount,
    delivery_total,
    down_payment,
    finance_amount,
    finance_provider: String(values.finance_provider ?? ''),
    interest_rate,
    number_of_terms,
    monthly_installment,
    sales_commission,
    sales_expense: n(values.sales_expense),
    finance_commission,
  };

  const rows: FinanceSheetRow[] = [];

  for (const def of SYSTEM_ROW_CATALOG) {
    const visible = def.visibleWhen(paymentMode);
    let source: FinanceSheetRow['source'] = 'hidden';
    if (visible) {
      const lockedAuto =
        def.key === 'sales_commission' || def.key === 'delivery_total' || def.key === 'car_price';
      if (isEdited(editedKeys, def.key) && !lockedAuto) source = 'edit';
      else source = def.defaultSource;
      // auto keys that we compute (locked autos never 'edit'):
      if (
        source !== 'edit' &&
        (def.key === 'car_price' ||
          def.key === 'total_amount' ||
          def.key === 'delivery_total' ||
          def.key === 'finance_amount' ||
          def.key === 'monthly_installment' ||
          def.key === 'finance_commission' ||
          def.key === 'sales_commission')
      ) {
        source = 'auto';
      }
    }

    const raw = resolved[def.key];
    rows.push({
      key: def.key,
      label: def.label,
      group: def.group,
      amount: typeof raw === 'number' ? raw : 0,
      textValue: def.isText ? String(raw ?? '') : undefined,
      source,
      saleField: def.saleField,
      roleGated: def.roleGated,
    });
  }

  customLines.forEach((line, i) => {
    const key = (line.key ?? `custom:${line.id ?? i}`) as FinanceSheetRow['key'];
    rows.push({
      key,
      label: line.label,
      group:
        line.group === 'CUSTOMER_CHARGE'
          ? 'CUSTOMER_CHARGE'
          : line.group === 'DEALER'
            ? 'DEALER'
            : 'INFO',
      amount: n(line.amount),
      source: 'manual',
      isCustom: true,
    });
  });

  const salePatch: FinanceEngineResult['salePatch'] = {
    totalAmount: total_amount,
    depositAmount: deposit,
    carDiscount: car_discount,
    downPaymentDiscount: down_payment_discount,
    insuranceFee: insurance_fee,
    compulsoryInsuranceFee: compulsory_insurance_fee,
    registrationFee: registration_fee,
    downPayment: financed ? down_payment : n(values.down_payment) || null,
    financeAmount: financed ? finance_amount : n(values.finance_amount) || null,
    financeProvider: financed
      ? String(values.finance_provider ?? '') || null
      : String(values.finance_provider ?? '') || null,
    interestRate: financed ? interest_rate || null : n(values.interest_rate) || null,
    numberOfTerms: financed ? number_of_terms || null : n(values.number_of_terms) || null,
    monthlyInstallment: financed
      ? monthly_installment || null
      : n(values.monthly_installment) || null,
    salesCommission: sales_commission || null,
    salesExpense: n(values.sales_expense) || null,
    financeCommission: financed ? finance_commission || null : n(values.finance_commission) || null,
  };

  return {
    rows,
    totals: {
      totalAmount: total_amount,
      buyerFees,
      customCustomerCharges,
    },
    salePatch,
  };
}

/**
 * Apply a user edit: update `values`.
 * Only auto-computed keys (total_amount, finance_amount, monthly_installment,
 * finance_commission, car_price) are added to `editedKeys` so overrides stick.
 * Pure manual keys (deposit, fees, discounts, etc.) update values only.
 */
export function withEditedValue(
  input: FinanceEngineInput,
  key: SystemFinanceKey,
  value: number | string
): FinanceEngineInput {
  const shouldTrackEdit = AUTO_EDITABLE_KEYS.has(key);
  const editedKeys =
    shouldTrackEdit && !input.editedKeys.includes(key)
      ? [...input.editedKeys, key]
      : input.editedKeys;
  return {
    ...input,
    values: { ...input.values, [key]: value },
    editedKeys,
  };
}

export function withResetKey(input: FinanceEngineInput, key: string): FinanceEngineInput {
  return {
    ...input,
    editedKeys: input.editedKeys.filter((k) => k !== key),
  };
}
