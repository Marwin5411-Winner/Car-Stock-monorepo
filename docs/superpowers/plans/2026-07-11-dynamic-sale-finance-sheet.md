# Dynamic Sale Finance Sheet Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the static sales money form/detail blocks with one spreadsheet-style `FinanceSheet` that calculates defaults, supports per-field overrides and custom lines, and shows which documents each field feeds.

**Architecture:** Hybrid C — pure finance engine + catalog + document registry in `@car-stock/shared`; Sale columns remain canonical for system amounts; new `SaleFinanceLine` stores custom rows; `financeEditedKeys` on Sale tracks overrides; web Form/Detail share one component.

**Tech Stack:** Bun, ElysiaJS, Prisma/PostgreSQL, React 19, Zod, `@car-stock/shared`, Biome

**Spec:** `docs/superpowers/specs/2026-07-11-dynamic-sale-finance-sheet-design.md`

---

## File map

| Path | Responsibility |
|------|----------------|
| `packages/shared/src/finance/types.ts` | Shared finance types (keys, groups, src, engine I/O) |
| `packages/shared/src/finance/catalog.ts` | System row catalog (labels, groups, visibility, sale field map) |
| `packages/shared/src/finance/engine.ts` | Pure calc engine (cash/finance, overrides, custom charges) |
| `packages/shared/src/finance/document-registry.ts` | fieldKey → document field mappings |
| `packages/shared/src/finance/index.ts` | Public exports |
| `packages/shared/src/finance/engine.test.ts` | Engine unit tests |
| `packages/shared/src/finance/document-registry.test.ts` | Registry completeness tests |
| `packages/shared/package.json` | Add `./finance` export |
| `packages/shared/src/schemas/index.ts` | `editedKeys`, `customLines` on Create/Update sale schemas |
| `apps/api/prisma/schema.prisma` | `Sale.financeEditedKeys`, `SaleFinanceLine` model |
| `apps/api/prisma/migrations/…` | Migration |
| `apps/api/src/modules/sales/sales.service.ts` | Persist/load lines + editedKeys; keep remaining invariant |
| `apps/api/src/modules/sales/sales.controller.ts` | Accept new body fields (via schema) |
| `apps/api/src/__tests__/sale-finance-lines.test.ts` | API-level persistence tests (or extend `sales.test.ts`) |
| `apps/web/src/components/finance/FinanceSheet.tsx` | Spreadsheet UI + chip + side panel |
| `apps/web/src/components/finance/financeSheetHelpers.ts` | Map sale ↔ sheet state, permission helpers |
| `apps/web/src/components/finance/FinanceSheet.test.ts` | Helper/unit tests if pure logic extracted |
| `apps/web/src/pages/sales/SalesFormPage.tsx` | Replace money section with FinanceSheet |
| `apps/web/src/pages/sales/SalesDetailPage.tsx` | Replace financial card with FinanceSheet (view + edit) |
| `apps/web/src/services/sales.service.ts` | Types for `customLines` / `financeEditedKeys` |

---

### Task 1: Shared finance types + catalog

**Files:**
- Create: `packages/shared/src/finance/types.ts`
- Create: `packages/shared/src/finance/catalog.ts`
- Create: `packages/shared/src/finance/index.ts`
- Modify: `packages/shared/package.json`

- [ ] **Step 1: Add types**

```ts
// packages/shared/src/finance/types.ts
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
```

- [ ] **Step 2: Add catalog**

```ts
// packages/shared/src/finance/catalog.ts
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
  { key: 'car_price', label: 'ราคารถ', group: 'CUSTOMER', saleField: 'carPrice', visibleWhen: always, defaultSource: 'auto' },
  { key: 'car_discount', label: 'ส่วนลดตัวรถ', group: 'DISCOUNT', saleField: 'carDiscount', visibleWhen: always, defaultSource: 'manual', roleGated: true },
  { key: 'down_payment_discount', label: 'ส่วนลดเงินดาวน์', group: 'DISCOUNT', saleField: 'downPaymentDiscount', visibleWhen: always, defaultSource: 'manual', roleGated: true },
  { key: 'insurance_fee', label: 'ค่าประกันชั้น 1', group: 'FEE', saleField: 'insuranceFee', visibleWhen: always, defaultSource: 'manual' },
  { key: 'compulsory_insurance_fee', label: 'ค่าพรบ.', group: 'FEE', saleField: 'compulsoryInsuranceFee', visibleWhen: always, defaultSource: 'manual' },
  { key: 'registration_fee', label: 'ค่าจดทะเบียน', group: 'FEE', saleField: 'registrationFee', visibleWhen: always, defaultSource: 'manual' },
  { key: 'deposit', label: 'เงินมัดจำ', group: 'PAYMENT', saleField: 'depositAmount', visibleWhen: always, defaultSource: 'manual' },
  { key: 'total_amount', label: 'ยอดรวม', group: 'SUMMARY', saleField: 'totalAmount', visibleWhen: always, defaultSource: 'auto' },
  { key: 'down_payment', label: 'เงินดาวน์', group: 'FINANCE', saleField: 'downPayment', visibleWhen: financeOnly, defaultSource: 'manual' },
  { key: 'finance_amount', label: 'ยอดจัดไฟแนนซ์', group: 'FINANCE', saleField: 'financeAmount', visibleWhen: financeOnly, defaultSource: 'auto' },
  { key: 'finance_provider', label: 'บริษัทไฟแนนซ์', group: 'FINANCE', saleField: 'financeProvider', visibleWhen: financeOnly, defaultSource: 'manual', isText: true },
  { key: 'interest_rate', label: 'อัตราดอกเบี้ย (% ต่อปี)', group: 'FINANCE', saleField: 'interestRate', visibleWhen: financeOnly, defaultSource: 'manual' },
  { key: 'number_of_terms', label: 'จำนวนงวด (เดือน)', group: 'FINANCE', saleField: 'numberOfTerms', visibleWhen: financeOnly, defaultSource: 'manual' },
  { key: 'monthly_installment', label: 'ค่างวด/เดือน', group: 'FINANCE', saleField: 'monthlyInstallment', visibleWhen: financeOnly, defaultSource: 'auto' },
  { key: 'sales_commission', label: 'คอมฯ พนักงานขาย', group: 'DEALER', saleField: 'salesCommission', visibleWhen: always, defaultSource: 'manual', roleGated: true },
  { key: 'sales_expense', label: 'ค่าใช้จ่ายในการขาย', group: 'DEALER', saleField: 'salesExpense', visibleWhen: always, defaultSource: 'manual', roleGated: true },
  { key: 'finance_commission', label: 'ค่าตอบไฟแนนซ์', group: 'DEALER', saleField: 'financeCommission', visibleWhen: financeOnly, defaultSource: 'auto', roleGated: true },
];

export function getCatalogRow(key: SystemFinanceKey): SystemRowDef {
  const row = SYSTEM_ROW_CATALOG.find((r) => r.key === key);
  if (!row) throw new Error(`Unknown system finance key: ${key}`);
  return row;
}
```

- [ ] **Step 3: Export barrel + package export**

```ts
// packages/shared/src/finance/index.ts
export * from './types';
export * from './catalog';
```

In `packages/shared/package.json` under `exports`, add:

```json
"./finance": "./src/finance/index.ts"
```

- [ ] **Step 4: Commit**

```bash
git add packages/shared/src/finance packages/shared/package.json
git commit -m "feat(shared): add finance types and system row catalog"
```

---

### Task 2: Finance calc engine (TDD)

**Files:**
- Create: `packages/shared/src/finance/engine.ts`
- Create: `packages/shared/src/finance/engine.test.ts`
- Modify: `packages/shared/src/finance/index.ts`

- [ ] **Step 1: Write failing tests**

```ts
// packages/shared/src/finance/engine.test.ts
import { describe, expect, test } from 'bun:test';
import { computeFinanceSheet } from './engine';

describe('computeFinanceSheet', () => {
  test('CASH: auto total = carPrice - car_discount (fees stay separate)', () => {
    const result = computeFinanceSheet({
      paymentMode: 'CASH',
      carPrice: 1_200_000,
      values: { car_discount: 50_000, insurance_fee: 25_000 },
      editedKeys: [],
      customLines: [],
    });
    expect(result.salePatch.totalAmount).toBe(1_150_000);
    expect(result.totals.buyerFees).toBe(25_000);
    const financeRow = result.rows.find((r) => r.key === 'finance_amount');
    expect(financeRow?.source).toBe('hidden');
  });

  test('custom CUSTOMER_CHARGE increases auto totalAmount', () => {
    const result = computeFinanceSheet({
      paymentMode: 'CASH',
      carPrice: 1_000_000,
      values: {},
      editedKeys: [],
      customLines: [{ label: 'ค่าขนส่ง', group: 'CUSTOMER_CHARGE', amount: 5_000 }],
    });
    expect(result.salePatch.totalAmount).toBe(1_005_000);
    expect(result.totals.customCustomerCharges).toBe(5_000);
  });

  test('edited total_amount is not overwritten', () => {
    const result = computeFinanceSheet({
      paymentMode: 'CASH',
      carPrice: 1_000_000,
      values: { total_amount: 999_000 },
      editedKeys: ['total_amount'],
      customLines: [],
    });
    expect(result.salePatch.totalAmount).toBe(999_000);
    const totalRow = result.rows.find((r) => r.key === 'total_amount');
    expect(totalRow?.source).toBe('edit');
  });

  test('FINANCE: auto installment matches flat-rate formula', () => {
    // finance 1_000_000, 2.49%/yr, 48 months
    const finance = 1_000_000;
    const rate = 2.49;
    const terms = 48;
    const years = terms / 12;
    const expected = Math.round((finance + finance * (rate / 100) * years) / terms);

    const result = computeFinanceSheet({
      paymentMode: 'FINANCE',
      carPrice: 1_200_000,
      values: {
        car_discount: 0,
        down_payment: 200_000,
        finance_amount: finance,
        interest_rate: rate,
        number_of_terms: terms,
      },
      editedKeys: [],
      customLines: [],
    });
    expect(result.salePatch.monthlyInstallment).toBe(expected);
  });

  test('FINANCE: auto finance_amount from price after discount - down_payment when not edited', () => {
    const result = computeFinanceSheet({
      paymentMode: 'FINANCE',
      carPrice: 1_200_000,
      values: { car_discount: 50_000, down_payment: 150_000 },
      editedKeys: [],
      customLines: [],
    });
    // price after discount 1_150_000 - down 150_000 = 1_000_000
    expect(result.salePatch.financeAmount).toBe(1_000_000);
  });

  test('reset path: key not in editedKeys recomputes', () => {
    const result = computeFinanceSheet({
      paymentMode: 'CASH',
      carPrice: 500_000,
      values: { total_amount: 1 }, // stale
      editedKeys: [],
      customLines: [],
    });
    expect(result.salePatch.totalAmount).toBe(500_000);
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
cd packages/shared && bun test src/finance/engine.test.ts
```

Expected: fail (module/function missing)

- [ ] **Step 3: Implement engine**

```ts
// packages/shared/src/finance/engine.ts
import { SYSTEM_ROW_CATALOG } from './catalog';
import type {
  FinanceCustomLineInput,
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
  if (finance <= 0 || terms <= 0 || ratePercent < 0) return 0;
  const years = terms / 12;
  const totalInterest = finance * (ratePercent / 100) * years;
  return Math.round((finance + totalInterest) / terms);
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

  const resolved: Record<SystemFinanceKey, number | string> = {
    car_price: n(carPrice),
    car_discount,
    down_payment_discount: n(values.down_payment_discount),
    insurance_fee,
    compulsory_insurance_fee,
    registration_fee,
    deposit: n(values.deposit),
    total_amount,
    down_payment,
    finance_amount,
    finance_provider: String(values.finance_provider ?? ''),
    interest_rate,
    number_of_terms,
    monthly_installment,
    sales_commission: n(values.sales_commission),
    sales_expense: n(values.sales_expense),
    finance_commission,
  };

  const rows: FinanceSheetRow[] = [];

  for (const def of SYSTEM_ROW_CATALOG) {
    const visible = def.visibleWhen(paymentMode);
    let source: FinanceSheetRow['source'] = 'hidden';
    if (visible) {
      if (isEdited(editedKeys, def.key)) source = 'edit';
      else source = def.defaultSource;
      // auto keys that we compute:
      if (
        source !== 'edit' &&
        (def.key === 'car_price' ||
          def.key === 'total_amount' ||
          def.key === 'finance_amount' ||
          def.key === 'monthly_installment' ||
          def.key === 'finance_commission')
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
      group: line.group === 'CUSTOMER_CHARGE' ? 'CUSTOMER_CHARGE' : line.group === 'DEALER' ? 'DEALER' : 'INFO',
      amount: n(line.amount),
      source: 'manual',
      isCustom: true,
    });
  });

  const salePatch: FinanceEngineResult['salePatch'] = {
    totalAmount: total_amount,
    depositAmount: n(values.deposit),
    carDiscount: car_discount,
    downPaymentDiscount: n(values.down_payment_discount),
    insuranceFee: insurance_fee,
    compulsoryInsuranceFee: compulsory_insurance_fee,
    registrationFee: registration_fee,
    downPayment: financed ? down_payment : n(values.down_payment) || null,
    financeAmount: financed ? finance_amount : n(values.finance_amount) || null,
    financeProvider: financed ? String(values.finance_provider ?? '') || null : String(values.finance_provider ?? '') || null,
    interestRate: financed ? interest_rate || null : n(values.interest_rate) || null,
    numberOfTerms: financed ? number_of_terms || null : n(values.number_of_terms) || null,
    monthlyInstallment: financed ? monthly_installment || null : n(values.monthly_installment) || null,
    salesCommission: n(values.sales_commission) || null,
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

/** Apply a user edit: set value + mark edited (except pure manual keys that stay manual). */
export function withEditedValue(
  input: FinanceEngineInput,
  key: SystemFinanceKey,
  value: number | string
): FinanceEngineInput {
  const editedKeys = input.editedKeys.includes(key) ? input.editedKeys : [...input.editedKeys, key];
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
```

Export from `index.ts`:

```ts
export * from './engine';
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
cd packages/shared && bun test src/finance/engine.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/finance
git commit -m "feat(shared): finance sheet calc engine with override rules"
```

---

### Task 3: Document registry (TDD)

**Files:**
- Create: `packages/shared/src/finance/document-registry.ts`
- Create: `packages/shared/src/finance/document-registry.test.ts`
- Modify: `packages/shared/src/finance/index.ts`

- [ ] **Step 1: Write failing test**

```ts
// packages/shared/src/finance/document-registry.test.ts
import { describe, expect, test } from 'bun:test';
import { SYSTEM_ROW_CATALOG } from './catalog';
import { FINANCE_DOCUMENT_REGISTRY, getDocumentMapsForKey } from './document-registry';

describe('FINANCE_DOCUMENT_REGISTRY', () => {
  test('every system catalog key has an explicit registry entry (array may be empty)', () => {
    for (const row of SYSTEM_ROW_CATALOG) {
      expect(FINANCE_DOCUMENT_REGISTRY).toHaveProperty(row.key);
      expect(Array.isArray(FINANCE_DOCUMENT_REGISTRY[row.key])).toBe(true);
    }
  });

  test('down_payment maps to thank-you letter field เงินดาวน์', () => {
    const maps = getDocumentMapsForKey('down_payment');
    expect(maps.some((m) => m.doc === 'thank-you-letter' && m.fieldLabel === 'เงินดาวน์')).toBe(true);
  });

  test('custom keys return empty maps', () => {
    expect(getDocumentMapsForKey('custom:abc')).toEqual([]);
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

```bash
cd packages/shared && bun test src/finance/document-registry.test.ts
```

- [ ] **Step 3: Implement registry**

```ts
// packages/shared/src/finance/document-registry.ts
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
    { doc: 'thank-you-letter', fieldLabel: 'ส่วนลดเงินดาวน์', path: 'detailsTable.downPaymentDiscount' },
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
```

Export from index.

- [ ] **Step 4: Run — expect PASS**

```bash
cd packages/shared && bun test src/finance/
```

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/finance
git commit -m "feat(shared): finance document field registry"
```

---

### Task 4: Zod schema extensions

**Files:**
- Modify: `packages/shared/src/schemas/index.ts` (CreateSaleSchema / related)
- Modify: `packages/shared/src/types/index.ts` if types need re-export (auto via z.infer)

- [ ] **Step 1: Add custom line + editedKeys schemas next to sale schemas**

```ts
export const FinanceCustomLineSchema = z.object({
  id: z.string().optional(),
  label: z.string().min(1),
  group: z.enum(['CUSTOMER_CHARGE', 'DEALER', 'INFO']),
  amount: z.number(),
  notes: z.string().optional(),
  sortOrder: z.number().int().optional(),
});

// Inside CreateSaleSchema, add:
  financeEditedKeys: z.array(z.string()).optional().default([]),
  customLines: z.array(FinanceCustomLineSchema).optional().default([]),
```

`UpdateSaleSchema` remains `CreateSaleSchema.partial()` so fields stay optional on update.

- [ ] **Step 2: Typecheck shared**

```bash
cd packages/shared && bun run typecheck
```

Expected: clean

- [ ] **Step 3: Commit**

```bash
git add packages/shared/src/schemas/index.ts
git commit -m "feat(shared): sale schema financeEditedKeys and customLines"
```

---

### Task 5: Prisma model + migration

**Files:**
- Modify: `apps/api/prisma/schema.prisma`

- [ ] **Step 1: Add model and Sale fields**

On `Sale` model, after `monthlyInstallment` (or near finance fields):

```prisma
  financeEditedKeys      String[]          @default([]) @map("finance_edited_keys")
  financeLines           SaleFinanceLine[]
```

New model:

```prisma
model SaleFinanceLine {
  id        String   @id @default(cuid())
  saleId    String   @map("sale_id")
  key       String   // custom:<cuid>
  label     String
  group     String   // CUSTOMER_CHARGE | DEALER | INFO
  amount    Decimal  @db.Decimal(15, 2)
  source    String   @default("CUSTOM") // MANUAL | CUSTOM
  sortOrder Int      @default(0) @map("sort_order")
  notes     String?
  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")
  sale      Sale     @relation(fields: [saleId], references: [id], onDelete: Cascade)

  @@index([saleId])
  @@map("sale_finance_lines")
}
```

- [ ] **Step 2: Create migration**

```bash
cd apps/api && bunx prisma migrate dev --name sale_finance_lines
```

Expected: migration applied, client generated

- [ ] **Step 3: Commit**

```bash
git add apps/api/prisma
git commit -m "feat(db): sale finance lines and edited keys"
```

---

### Task 6: API persist/load custom lines

**Files:**
- Modify: `apps/api/src/modules/sales/sales.service.ts`
- Modify: `apps/api/src/modules/sales/sales.controller.ts` (only if body typing strips unknown — prefer schema)
- Create: `apps/api/src/__tests__/sale-finance-lines.test.ts`

- [ ] **Step 1: Write failing integration-style test** (follow patterns in `sales.test.ts` — use existing DB test helpers if present; if tests mock prisma, unit-test a pure helper instead)

If full HTTP tests are heavy, add a focused unit test file that tests a new helper:

```ts
// apps/api/src/modules/sales/sale-finance-lines.helpers.ts
export function normalizeCustomLines(
  lines: Array<{ id?: string; label: string; group: string; amount: number; notes?: string; sortOrder?: number }>
) {
  return lines.map((l, i) => ({
    key: l.id ? `custom:${l.id}` : `custom:new-${i}`,
    label: l.label,
    group: l.group,
    amount: l.amount,
    source: 'CUSTOM' as const,
    sortOrder: l.sortOrder ?? i,
    notes: l.notes ?? null,
  }));
}
```

Test:

```ts
import { describe, expect, test } from 'bun:test';
import { normalizeCustomLines } from '../modules/sales/sale-finance-lines.helpers';

test('assigns custom keys and sortOrder', () => {
  const out = normalizeCustomLines([{ label: 'X', group: 'INFO', amount: 1 }]);
  expect(out[0].key.startsWith('custom:')).toBe(true);
  expect(out[0].sortOrder).toBe(0);
});
```

- [ ] **Step 2: In `toNumber` sale serializer (top of sales.service), include:**

```ts
financeEditedKeys: sale.financeEditedKeys ?? [],
customLines: (sale.financeLines ?? []).map((l) => ({
  id: l.id,
  key: l.key,
  label: l.label,
  group: l.group,
  amount: toNumber(l.amount),
  notes: l.notes,
  sortOrder: l.sortOrder,
})),
```

Ensure `findUnique`/`findMany` includes `financeLines: { orderBy: { sortOrder: 'asc' } }`.

- [ ] **Step 3: On createSale — after parsing validated data, strip non-column fields**

```ts
const { customLines = [], financeEditedKeys = [], ...saleData } = validated;
// create with financeEditedKeys: financeEditedKeys
// then createMany finance lines from normalizeCustomLines(customLines) with real ids:
// prefer: for each line, create with key `custom:${createdLine.id}` in a second pass
// or generate cuid client-side before insert
```

Pattern (inside same transaction as sale create):

```ts
for (const [i, line] of (customLines as any[]).entries()) {
  const id = crypto.randomUUID(); // or cuid from @paralleldrive/cuid2 if used
  await tx.saleFinanceLine.create({
    data: {
      id,
      saleId: created.id,
      key: `custom:${id}`,
      label: line.label,
      group: line.group,
      amount: line.amount,
      source: 'CUSTOM',
      sortOrder: line.sortOrder ?? i,
      notes: line.notes ?? null,
    },
  });
}
```

- [ ] **Step 4: On updateSale — same strip; if `customLines` provided, deleteMany + recreate (or upsert by id). Always update `financeEditedKeys` when provided.**

Keep existing remainingAmount invariant untouched — custom customer charges must already be inside `totalAmount` from the client engine.

- [ ] **Step 5: ACCOUNTANT completed-sale allowlist** — add `financeEditedKeys` and `customLines` to `allowedFields` array in updateSale.

- [ ] **Step 6: Run tests**

```bash
cd apps/api && bun test src/__tests__/sales.test.ts src/__tests__/sale-finance-lines.test.ts src/__tests__/update-sale-remaining.test.ts
```

Expected: pass (remaining tests must still pass)

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/modules/sales apps/api/src/__tests__
git commit -m "feat(api): persist sale finance custom lines and edited keys"
```

---

### Task 7: Web types + FinanceSheet component

**Files:**
- Modify: `apps/web/src/services/sales.service.ts`
- Create: `apps/web/src/components/finance/financeSheetHelpers.ts`
- Create: `apps/web/src/components/finance/FinanceSheet.tsx`

- [ ] **Step 1: Extend Sale / create-update payloads**

```ts
export interface SaleFinanceCustomLine {
  id?: string;
  key?: string;
  label: string;
  group: 'CUSTOMER_CHARGE' | 'DEALER' | 'INFO';
  amount: number;
  notes?: string;
  sortOrder?: number;
}

// on Sale:
financeEditedKeys?: string[];
customLines?: SaleFinanceCustomLine[];
```

- [ ] **Step 2: Helpers — sale ↔ engine input**

```ts
// apps/web/src/components/finance/financeSheetHelpers.ts
import type { FinanceEngineInput, SystemFinanceKey } from '@car-stock/shared/finance';
import type { PaymentMode, Sale, SaleFinanceCustomLine } from '../../services/sales.service';

export function saleToEngineInput(
  saleLike: {
    paymentMode: PaymentMode;
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
  },
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

export function engineResultToFormPatch(result: { salePatch: Record<string, unknown> }) {
  return result.salePatch;
}
```

- [ ] **Step 3: Build `FinanceSheet` UI** (structure)

Props:

```ts
export interface FinanceSheetProps {
  paymentMode: PaymentMode;
  carPrice: number;
  value: {
    // all money fields + financeEditedKeys + customLines
  };
  onChange: (next: FinanceSheetValue) => void;
  readOnly?: boolean;
  canEditDealerFields?: boolean; // ADMIN/ACCOUNTANT
  canEditDiscounts?: boolean;
  paidAmount?: number;
  remainingAmount?: number;
}
```

Behavior:

1. Derive `engineInput` via helper; `const result = computeFinanceSheet(engineInput)`.
2. Render toolbar: mode buttons call `onChange` with new `paymentMode` (do not wipe finance values).
3. Table: only rows where `source !== 'hidden'` (or show collapsed finance section when CASH).
4. Amount cell click/edit → `withEditedValue` then map `salePatch` + keep `editedKeys` into `onChange`.
5. ↺ on edit row → `withResetKey`.
6. Chip: `getDocumentMapsForKey(row.key).length` — click sets `selectedKey`.
7. Side panel: list maps with `FINANCE_DOC_LABELS[doc]` + fieldLabel + formatted amount.
8. Footer: ยอดรวม / ชำระแล้ว / ค้าง (from props).
9. “+ เพิ่มรายการ”: append custom line `{ label, group: 'CUSTOMER_CHARGE', amount: 0 }`.
10. Role: hide or disable dealer/discount rows when flags false.

Use existing Tailwind + `formatCurrency` from utils. Keep component under ~300–400 lines; extract subcomponents in same folder if needed (`FinanceDocPanel.tsx`).

- [ ] **Step 4: Manual typecheck web**

```bash
cd apps/web && bunx tsc --noEmit 2>&1 | head -40
```

Fix import path `@car-stock/shared/finance` (package export already added).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/finance apps/web/src/services/sales.service.ts
git commit -m "feat(web): FinanceSheet component with doc panel"
```

---

### Task 8: Integrate SalesFormPage

**Files:**
- Modify: `apps/web/src/pages/sales/SalesFormPage.tsx`

- [ ] **Step 1: Extend form state**

```ts
financeEditedKeys: [] as string[],
customLines: [] as SaleFinanceCustomLine[],
```

Load from sale on edit: `financeEditedKeys: sale.financeEditedKeys ?? []`, `customLines: sale.customLines ?? []`.

- [ ] **Step 2: Replace the entire “ข้อมูลการเงิน” card body** (payment mode, finance fields, discounts, fees, dealer block) with:

```tsx
<FinanceSheet
  paymentMode={formData.paymentMode}
  carPrice={/* from selected vehicle model price or 0 */}
  value={formData}
  canEditDiscounts={canDiscount}
  canEditDealerFields={canDiscount}
  onChange={(patch) => setFormData((prev) => ({ ...prev, ...patch }))}
/>
```

Where `onChange` merges: money fields from `salePatch` shape already used by form (`totalAmount`, `depositAmount`, …) plus `financeEditedKeys`, `customLines`, `paymentMode`.

- [ ] **Step 3: Submit payload** include `financeEditedKeys` and `customLines`.

Keep financeProvider required validation when `paymentMode !== 'CASH'`.

- [ ] **Step 4: Smoke manually** — create CASH sale with only car price; save; edit FINANCE; override installment; reset.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/pages/sales/SalesFormPage.tsx
git commit -m "feat(web): use FinanceSheet on sales form"
```

---

### Task 9: Integrate SalesDetailPage

**Files:**
- Modify: `apps/web/src/pages/sales/SalesDetailPage.tsx`

- [ ] **Step 1: Replace “ข้อมูลการเงิน” read-only `dl` block** with:

```tsx
<FinanceSheet
  readOnly={!financeEditing}
  paymentMode={sale.paymentMode}
  carPrice={Number(sale.stock?.vehicleModel?.price ?? 0)}
  value={/* map sale fields */}
  paidAmount={sale.paidAmount}
  remainingAmount={sale.remainingAmount}
  canEditDiscounts={canDiscount}
  canEditDealerFields={canDiscount}
  onChange={...} // only when financeEditing
/>
```

- [ ] **Step 2: Add “แก้ไขการเงิน” button** (permission `SALE_UPDATE`) toggling `financeEditing`. Save calls existing update sale API with sheet payload; on success refresh sale and exit edit mode. Cancel discards local state.

- [ ] **Step 3: Keep payment breakdown table below** (customer payments) — out of scope to merge into sheet.

- [ ] **Step 4: Remove obsolete hard-coded finance commission box** if sheet shows `finance_commission` row (role-gated); or keep preview via engine auto value only once.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/pages/sales/SalesDetailPage.tsx
git commit -m "feat(web): FinanceSheet on sales detail with inline edit"
```

---

### Task 10: Regression + polish

**Files:**
- Possibly: `apps/api/src/__tests__/thank-you-financials.test.ts` (must still pass — sheet must not change thank-you pure functions)
- Docs: none required beyond plan/spec

- [ ] **Step 1: Run shared + api tests**

```bash
cd packages/shared && bun test src/finance/
cd apps/api && bun test src/__tests__/thank-you-financials.test.ts src/__tests__/update-sale-remaining.test.ts src/__tests__/sales.test.ts
```

Expected: all pass

- [ ] **Step 2: Lint touched files**

```bash
bunx biome check packages/shared/src/finance apps/web/src/components/finance apps/web/src/pages/sales/SalesFormPage.tsx apps/web/src/pages/sales/SalesDetailPage.tsx apps/api/src/modules/sales
```

- [ ] **Step 3: Manual QA checklist**

1. CASH: no finance rows; save defaults → detail shows same numbers  
2. FINANCE: installment auto; edit installment → badge edit; reset → auto  
3. Custom CUSTOMER_CHARGE → total increases; reload persists  
4. Chip + panel shows thank-you / contract labels  
5. Remaining balance still correct after payment  
6. ACCOUNTANT dealer fields visible; sales staff hidden  

- [ ] **Step 4: Final commit if polish**

```bash
git add -A packages/shared/src/finance apps/web/src/components/finance apps/web/src/pages/sales apps/api/src/modules/sales
git commit -m "chore: polish finance sheet after QA"
```

---

## Spec coverage checklist

| Spec requirement | Task |
|------------------|------|
| Shared FinanceSheet Form+Detail | 7, 8, 9 |
| Spreadsheet line items | 7 |
| System + custom rows | 1, 5, 6, 7 |
| Auto first / override / reset | 2, 7 |
| Cash preset hide finance | 2, 7 |
| Chip + side panel docs | 3, 7 |
| Hybrid Sale columns + lines | 5, 6 |
| remaining invariant | 2 (total vs fees), 6 |
| Document registry phase-1 docs | 3 |
| editedKeys + customLines API | 4, 6 |
| Role gates dealer/discount | 7, 8, 9 |
| Unit tests engine/registry | 2, 3 |
| Non-goal: payments module rewrite | skipped (detail keeps payment table) |

## Self-review notes

- No TBD placeholders in steps.  
- Engine intentionally keeps **fee columns additive** and puts **custom customer charges into totalAmount** (spec).  
- `thank-you-financials` continues to recompute print values from Sale columns; overrides that staff saved to columns are what documents use — panel is guidance, not a second source of truth.  
- Type names: `FinanceEngineInput`, `computeFinanceSheet`, `FINANCE_DOCUMENT_REGISTRY`, `SaleFinanceLine`, `financeEditedKeys`, `customLines` consistent across tasks.

---

## Execution handoff

Plan complete and saved to `docs/superpowers/plans/2026-07-11-dynamic-sale-finance-sheet.md`.

**Two execution options:**

1. **Subagent-Driven (recommended)** — fresh subagent per task, review between tasks, fast iteration  
2. **Inline Execution** — execute tasks in this session with executing-plans and checkpoints  

Which approach?
