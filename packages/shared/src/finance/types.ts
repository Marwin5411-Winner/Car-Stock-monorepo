export type PaymentModeFinance = 'CASH' | 'FINANCE' | 'MIXED';

export type FinanceRowGroup =
  | 'CUSTOMER'
  | 'DISCOUNT'
  | 'FEE'
  | 'PAYMENT'
  | 'FINANCE'
  | 'DEALER'
  | 'SUMMARY'
  | 'CUSTOMER_CHARGE'
  | 'INFO';

export type FinanceCellSource = 'auto' | 'edit' | 'manual' | 'hidden';

export type SystemFinanceKey =
  | 'car_price'
  | 'car_discount'
  | 'down_payment_discount'
  | 'insurance_fee'
  | 'compulsory_insurance_fee'
  | 'registration_fee'
  | 'deposit'
  | 'total_amount'
  | 'down_payment'
  | 'finance_amount'
  | 'finance_provider'
  | 'interest_rate'
  | 'number_of_terms'
  | 'monthly_installment'
  | 'sales_commission'
  | 'sales_expense'
  | 'finance_commission';

export type FinanceFieldKey = SystemFinanceKey | `custom:${string}`;

export interface FinanceCustomLineInput {
  id?: string;
  key?: string; // custom:<id> when known
  label: string;
  group: 'CUSTOMER_CHARGE' | 'DEALER' | 'INFO';
  amount: number;
  notes?: string;
  sortOrder?: number;
}

export interface FinanceEngineInput {
  paymentMode: PaymentModeFinance;
  carPrice: number;
  /** User/system values for system keys (partial). */
  values: Partial<Record<SystemFinanceKey, number | string>>;
  /** Keys user overrode — engine must not recompute these amounts. */
  editedKeys: string[];
  customLines: FinanceCustomLineInput[];
}

export interface FinanceSheetRow {
  key: FinanceFieldKey;
  label: string;
  group: FinanceRowGroup;
  /** Numeric amount; finance_provider uses 0 and puts text in textValue */
  amount: number;
  textValue?: string;
  source: FinanceCellSource;
  /** Sale column name when system-backed */
  saleField?: string;
  roleGated?: boolean;
  isCustom?: boolean;
}

export interface FinanceEngineResult {
  rows: FinanceSheetRow[];
  totals: {
    totalAmount: number;
    buyerFees: number;
    customCustomerCharges: number;
    /** Preview only — server remains source of truth with paidAmount */
    remainingPreview?: number;
  };
  /** Values to write onto Sale columns */
  salePatch: Partial<Record<string, number | string | null>>;
}
