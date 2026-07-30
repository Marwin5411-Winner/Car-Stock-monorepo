import { describe, expect, test } from 'bun:test';
import { computeFinanceSheet, withEditedValue } from './engine';
import type { FinanceEngineInput } from './types';

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

  test('FINANCE: interest_rate 0 yields monthlyInstallment 0', () => {
    const result = computeFinanceSheet({
      paymentMode: 'FINANCE',
      carPrice: 1_200_000,
      values: {
        down_payment: 200_000,
        interest_rate: 0,
        number_of_terms: 48,
      },
      editedKeys: [],
      customLines: [],
    });
    expect(result.salePatch.monthlyInstallment).toBeNull();
    const installmentRow = result.rows.find((r) => r.key === 'monthly_installment');
    expect(installmentRow?.amount).toBe(0);
  });

  test('sales_commission is locked at 9% of car price', () => {
    const result = computeFinanceSheet({
      paymentMode: 'CASH',
      carPrice: 1_200_000,
      values: { sales_commission: 1 }, // stale / user attempt — ignored
      editedKeys: ['sales_commission'],
      customLines: [],
    });
    expect(result.salePatch.salesCommission).toBe(108_000);
    const row = result.rows.find((r) => r.key === 'sales_commission');
    expect(row?.amount).toBe(108_000);
    expect(row?.source).toBe('auto');
  });

  test('CASH delivery_total = totalAmount - deposit (ราคาขายหักส่วนลด หักจอง)', () => {
    const result = computeFinanceSheet({
      paymentMode: 'CASH',
      carPrice: 1_000_000,
      values: { car_discount: 50_000, deposit: 20_000 },
      editedKeys: [],
      customLines: [],
    });
    // total 950_000 − deposit 20_000
    const row = result.rows.find((r) => r.key === 'delivery_total');
    expect(row?.amount).toBe(930_000);
    expect(row?.source).toBe('auto');
  });

  test('FINANCE delivery_total = down - downDisc + fees', () => {
    const result = computeFinanceSheet({
      paymentMode: 'FINANCE',
      carPrice: 1_200_000,
      values: {
        down_payment: 200_000,
        down_payment_discount: 0,
        insurance_fee: 20_000,
        compulsory_insurance_fee: 3_000,
        registration_fee: 2_000,
      },
      editedKeys: [],
      customLines: [],
    });
    const row = result.rows.find((r) => r.key === 'delivery_total');
    expect(row?.amount).toBe(225_000);
    expect(row?.source).toBe('auto');
  });
});

describe('withEditedValue', () => {
  const base: FinanceEngineInput = {
    paymentMode: 'CASH',
    carPrice: 1_000_000,
    values: {},
    editedKeys: [],
    customLines: [],
  };

  test('manual key deposit does not enter editedKeys; row source stays manual', () => {
    const next = withEditedValue(base, 'deposit', 50_000);
    expect(next.editedKeys).not.toContain('deposit');
    expect(next.values.deposit).toBe(50_000);
    const result = computeFinanceSheet(next);
    const depositRow = result.rows.find((r) => r.key === 'deposit');
    expect(depositRow?.source).toBe('manual');
  });

  test('auto key total_amount is tracked in editedKeys', () => {
    const next = withEditedValue(base, 'total_amount', 999_000);
    expect(next.editedKeys).toContain('total_amount');
  });
});
