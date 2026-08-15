/**
 * FinanceSheet carPrice (ราคารถ) is the chosen list price, not Sale.totalAmount.
 *
 * Engine: totalAmount = carPrice − carDiscount + CUSTOMER_CHARGE
 * Inverse: carPrice   = totalAmount + carDiscount − CUSTOMER_CHARGE
 *
 * Reconstruct from saved sale fields so a Stock expectedSalePrice selection
 * survives the form, detail page, and printed thank-you letter without a
 * dedicated Sale.carPrice column.
 */

export type ChargeLineLike = {
  group?: string | null;
  amount?: unknown;
};

const toNum = (v: unknown): number => {
  if (v == null || v === '') return 0;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
};

export function sumCustomCustomerCharges(lines?: ChargeLineLike[] | null): number {
  if (!lines?.length) return 0;
  let sum = 0;
  for (const line of lines) {
    if (line.group !== 'CUSTOMER_CHARGE') continue;
    sum += toNum(line.amount);
  }
  return sum;
}

export function resolveSaleCarPrice(input: {
  totalAmount?: unknown;
  carDiscount?: unknown;
  customCustomerCharges?: unknown;
  vehicleModelPrice?: unknown;
  expectedSalePrice?: unknown;
}): number {
  const reconstructed =
    toNum(input.totalAmount) + toNum(input.carDiscount) - toNum(input.customCustomerCharges);
  if (reconstructed > 0) return reconstructed;

  const model = toNum(input.vehicleModelPrice);
  if (model > 0) return model;

  const stock = toNum(input.expectedSalePrice);
  if (stock > 0) return stock;

  return 0;
}
