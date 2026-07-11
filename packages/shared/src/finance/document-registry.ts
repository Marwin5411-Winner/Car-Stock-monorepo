import type { SystemFinanceKey } from './types';

export type FinanceDocId =
  | 'thank-you-letter'
  | 'sales-confirmation'
  | 'sales-confirmation-form'
  | 'contract'
  | 'deposit-receipt'
  | 'payment-receipt'
  | 'sales-record';

export interface FinanceDocMapEntry {
  doc: FinanceDocId;
  /** Thai label staff see on the printed form */
  fieldLabel: string;
  /** Optional path into PDF data objects */
  path?: string;
  note?: string;
}

export const FINANCE_DOCUMENT_REGISTRY: Record<SystemFinanceKey, FinanceDocMapEntry[]> = {
  car_price: [
    { doc: 'thank-you-letter', fieldLabel: 'ราคาขาย', path: 'detailsTable.sellingPrice' },
    { doc: 'sales-confirmation', fieldLabel: 'ราคารถ' },
    { doc: 'contract', fieldLabel: 'ราคารถยนต์' },
  ],
  car_discount: [
    { doc: 'thank-you-letter', fieldLabel: 'ส่วนลด', path: 'detailsTable.discount' },
    { doc: 'sales-confirmation', fieldLabel: 'ส่วนลดรถยนต์' },
    { doc: 'contract', fieldLabel: 'ส่วนลด' },
  ],
  down_payment_discount: [
    {
      doc: 'thank-you-letter',
      fieldLabel: 'ส่วนลดเงินดาวน์',
      path: 'detailsTable.downPaymentDiscount',
    },
  ],
  insurance_fee: [
    { doc: 'thank-you-letter', fieldLabel: 'ค่าประกันภัยชั้น 1', path: 'detailsTable.insurance' },
  ],
  compulsory_insurance_fee: [
    { doc: 'thank-you-letter', fieldLabel: 'ค่าพรบ.', path: 'detailsTable.actInsurance' },
  ],
  registration_fee: [
    { doc: 'thank-you-letter', fieldLabel: 'ค่าจดทะเบียน', path: 'detailsTable.registrationFee' },
  ],
  deposit: [
    { doc: 'thank-you-letter', fieldLabel: 'เงินจอง', path: 'detailsTable.bookingDeposit' },
    { doc: 'deposit-receipt', fieldLabel: 'จำนวนเงินมัดจำ' },
    { doc: 'contract', fieldLabel: 'เงินมัดจำ' },
  ],
  total_amount: [
    { doc: 'thank-you-letter', fieldLabel: 'ราคาขาย', path: 'detailsTable.sellingPrice' },
    { doc: 'sales-record', fieldLabel: 'ยอดขาย' },
  ],
  down_payment: [
    { doc: 'thank-you-letter', fieldLabel: 'เงินดาวน์', path: 'detailsTable.downPayment' },
    { doc: 'sales-confirmation', fieldLabel: 'ดาวน์' },
    { doc: 'contract', fieldLabel: 'จำนวนเงินดาวน์' },
  ],
  finance_amount: [
    { doc: 'thank-you-letter', fieldLabel: 'ยอดจัดไฟแนนซ์', path: 'detailsTable.financeAmount' },
    { doc: 'sales-confirmation', fieldLabel: 'ยอดจัด' },
  ],
  finance_provider: [{ doc: 'sales-confirmation', fieldLabel: 'บริษัทไฟแนนซ์' }],
  interest_rate: [{ doc: 'sales-confirmation', fieldLabel: 'อัตราดอกเบี้ย' }],
  number_of_terms: [{ doc: 'sales-confirmation', fieldLabel: 'จำนวนงวด' }],
  monthly_installment: [
    { doc: 'thank-you-letter', fieldLabel: 'ค่างวด', path: 'detailsTable.monthlyPayment' },
  ],
  sales_commission: [],
  sales_expense: [],
  finance_commission: [],
};

export const FINANCE_DOC_LABELS: Record<FinanceDocId, string> = {
  'thank-you-letter': 'หนังสือขอบคุณ',
  'sales-confirmation': 'ใบยืนยันรายละเอียดการขาย',
  'sales-confirmation-form': 'แบบฟอร์มยืนยันการขาย',
  contract: 'สัญญาจองรถยนต์',
  'deposit-receipt': 'ใบรับเงินมัดจำ',
  'payment-receipt': 'ใบเสร็จรับเงิน',
  'sales-record': 'ใบบันทึกการขาย',
};

export function getDocumentMapsForKey(key: string): FinanceDocMapEntry[] {
  if (key.startsWith('custom:')) return [];
  return FINANCE_DOCUMENT_REGISTRY[key as SystemFinanceKey] ?? [];
}
