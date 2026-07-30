import type { FinanceRowGroup, PaymentModeFinance, SystemFinanceKey } from './types';

export interface SystemRowDef {
  key: SystemFinanceKey;
  label: string;
  group: FinanceRowGroup;
  saleField: string;
  /** When false, row is hidden for that mode */
  visibleWhen: (mode: PaymentModeFinance) => boolean;
  /** Default source if not edited */
  defaultSource: 'auto' | 'manual';
  roleGated?: boolean;
  /** Text field (not amount) */
  isText?: boolean;
}

const always = () => true;
const financeOnly = (m: PaymentModeFinance) => m === 'FINANCE' || m === 'MIXED';

export const SYSTEM_ROW_CATALOG: SystemRowDef[] = [
  {
    key: 'car_price',
    label: 'ราคารถ',
    group: 'CUSTOMER',
    saleField: 'carPrice',
    visibleWhen: always,
    defaultSource: 'auto',
  },
  {
    key: 'car_discount',
    label: 'ส่วนลดตัวรถ',
    group: 'DISCOUNT',
    saleField: 'carDiscount',
    visibleWhen: always,
    defaultSource: 'manual',
    roleGated: true,
  },
  {
    key: 'down_payment_discount',
    label: 'ส่วนลดเงินดาวน์',
    group: 'DISCOUNT',
    saleField: 'downPaymentDiscount',
    visibleWhen: always,
    defaultSource: 'manual',
    roleGated: true,
  },
  {
    key: 'insurance_fee',
    label: 'ค่าประกันชั้น 1',
    group: 'FEE',
    saleField: 'insuranceFee',
    visibleWhen: always,
    defaultSource: 'manual',
  },
  {
    key: 'compulsory_insurance_fee',
    label: 'ค่าพรบ.',
    group: 'FEE',
    saleField: 'compulsoryInsuranceFee',
    visibleWhen: always,
    defaultSource: 'manual',
  },
  {
    key: 'registration_fee',
    label: 'ค่าจดทะเบียน',
    group: 'FEE',
    saleField: 'registrationFee',
    visibleWhen: always,
    defaultSource: 'manual',
  },
  {
    key: 'deposit',
    label: 'เงินมัดจำ',
    group: 'PAYMENT',
    saleField: 'depositAmount',
    visibleWhen: always,
    defaultSource: 'manual',
  },
  {
    key: 'total_amount',
    label: 'ยอดรวม',
    group: 'SUMMARY',
    saleField: 'totalAmount',
    visibleWhen: always,
    defaultSource: 'auto',
  },
  {
    key: 'delivery_total',
    label: 'รวมเงินออกรถ',
    group: 'SUMMARY',
    /** Preview-only — not a Sale column; computed by engine */
    saleField: 'deliveryTotal',
    visibleWhen: always,
    defaultSource: 'auto',
  },
  {
    key: 'down_payment',
    label: 'เงินดาวน์',
    group: 'FINANCE',
    saleField: 'downPayment',
    visibleWhen: financeOnly,
    defaultSource: 'manual',
  },
  {
    key: 'finance_amount',
    label: 'ยอดจัดไฟแนนซ์',
    group: 'FINANCE',
    saleField: 'financeAmount',
    visibleWhen: financeOnly,
    defaultSource: 'auto',
  },
  {
    key: 'finance_provider',
    label: 'บริษัทไฟแนนซ์',
    group: 'FINANCE',
    saleField: 'financeProvider',
    visibleWhen: financeOnly,
    defaultSource: 'manual',
    isText: true,
  },
  {
    key: 'interest_rate',
    label: 'อัตราดอกเบี้ย (% ต่อปี)',
    group: 'FINANCE',
    saleField: 'interestRate',
    visibleWhen: financeOnly,
    defaultSource: 'manual',
  },
  {
    key: 'number_of_terms',
    label: 'จำนวนงวด (เดือน)',
    group: 'FINANCE',
    saleField: 'numberOfTerms',
    visibleWhen: financeOnly,
    defaultSource: 'manual',
  },
  {
    key: 'monthly_installment',
    label: 'ค่างวด/เดือน',
    group: 'FINANCE',
    saleField: 'monthlyInstallment',
    visibleWhen: financeOnly,
    defaultSource: 'auto',
  },
  {
    key: 'sales_commission',
    label: 'คอมฯ พนักงานขาย (9%)',
    group: 'DEALER',
    saleField: 'salesCommission',
    visibleWhen: always,
    defaultSource: 'auto',
    roleGated: true,
  },
  {
    key: 'sales_expense',
    label: 'ค่าใช้จ่ายในการขาย',
    group: 'DEALER',
    saleField: 'salesExpense',
    visibleWhen: always,
    defaultSource: 'manual',
    roleGated: true,
  },
  {
    key: 'finance_commission',
    label: 'ค่าตอบไฟแนนซ์',
    group: 'DEALER',
    saleField: 'financeCommission',
    visibleWhen: financeOnly,
    defaultSource: 'auto',
    roleGated: true,
  },
];

export function getCatalogRow(key: SystemFinanceKey): SystemRowDef {
  const row = SYSTEM_ROW_CATALOG.find((r) => r.key === key);
  if (!row) throw new Error(`Unknown system finance key: ${key}`);
  return row;
}
