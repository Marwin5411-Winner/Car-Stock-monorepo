import type { FormulaOperator, FormulaPriceTarget } from '@prisma/client';
import { formulaSubsidyAmount } from '@car-stock/shared/formulas';

const round2 = (n: number) => Math.round(n * 100) / 100;
const toNum = (v: { toString(): string } | number | null | undefined): number =>
  v == null ? 0 : Number(v);

/** Thai VAT divisor — sale prices include 7% VAT; subsidy MSRP base is ex-VAT. */
const VAT_DIVISOR = 1.07;

export interface SubsidyRates {
  /** STOCK LEVEL — fraction of ex-VAT MSRP (e.g. 0.005 = 0.5%). */
  stockLevel: number;
  /** After Sales — ไม่ร้องเรียน, fraction of ex-VAT MSRP (e.g. 0.0025). */
  afterSalesNoComplaint: number;
  /** After Sales — ทำ Google QR Code, fraction of ex-VAT MSRP (e.g. 0.0025). */
  afterSalesQr: number;
  /** MARKETING — fraction of DNP/cost (e.g. 0.01 = 1%). */
  marketing: number;
  /** เป้าขาย (Retail Sales) — chosen tier fraction of DNP (0.005 / 0.01 / 0.015). */
  retailTargetTier: number;
}

export interface SubsidyAmounts {
  stockLevel: number;
  afterSalesNoComplaint: number;
  afterSalesQr: number;
  marketing: number;
  retailTarget: number;
  /** Sum of all buckets (รวมรับเงิน) — summed at full precision, then rounded. */
  total: number;
}

/** @deprecated Brand-bucket rates — no longer used by the claim report (now editor-driven). */
export const DEFAULT_SUBSIDY_RATES: SubsidyRates = {
  stockLevel: 0.005,
  afterSalesNoComplaint: 0.0025,
  afterSalesQr: 0.0025,
  marketing: 0.01,
  retailTargetTier: 0.01,
};

/**
 * @deprecated Brand-bucket rates — no longer used by the claim report (now editor-driven).
 *
 * Brand campaign reimbursement buckets, mirroring the customer's xls:
 *   STOCK LEVEL / After Sales = (ราคาขาย ÷ 1.07) × rate   (MSRP, ex-VAT)
 *   MARKETING / เป้าขาย       = ต้นทุน × rate              (DNP, as-is)
 * Each bucket rounded to 2dp for display; the total sums full-precision values
 * first (so it matches the spreadsheet's =SUM(...) of unrounded cells).
 */
export function computeCampaignSubsidies(
  sellingPriceInclVat: number,
  cost: number,
  rates: SubsidyRates
): SubsidyAmounts {
  const msrpExVat = sellingPriceInclVat / VAT_DIVISOR;
  const stockLevelRaw = msrpExVat * rates.stockLevel;
  const afterSalesNoComplaintRaw = msrpExVat * rates.afterSalesNoComplaint;
  const afterSalesQrRaw = msrpExVat * rates.afterSalesQr;
  const marketingRaw = cost * rates.marketing;
  const retailTargetRaw = cost * rates.retailTargetTier;
  return {
    stockLevel: round2(stockLevelRaw),
    afterSalesNoComplaint: round2(afterSalesNoComplaintRaw),
    afterSalesQr: round2(afterSalesQrRaw),
    marketing: round2(marketingRaw),
    retailTarget: round2(retailTargetRaw),
    total: round2(
      stockLevelRaw + afterSalesNoComplaintRaw + afterSalesQrRaw + marketingRaw + retailTargetRaw
    ),
  };
}

interface ClaimVehicleModel {
  id: string;
  brand: string;
  model: string;
  variant: string | null;
  price: { toString(): string } | number;
}

interface ClaimFormula {
  id: string;
  name: string;
  operator: FormulaOperator;
  value: { toString(): string } | number;
  priceTarget: FormulaPriceTarget;
  sortOrder: number;
}

export interface ClaimSaleInput {
  id: string;
  saleNumber: string;
  customer: { name: string } | null;
  financeProvider: string | null;
  carDiscount: { toString(): string } | number | null;
  discountSnapshot: { toString(): string } | number | null;
  completedDate: Date | null;
  vehicleModelId: string | null;
  vehicleModel: ClaimVehicleModel | null;
  stock: {
    vin: string | null;
    engineNumber: string | null;
    soldDate: Date | null;
    baseCost: { toString(): string } | number;
    vehicleModelId: string | null;
    vehicleModel: ClaimVehicleModel | null;
  } | null;
  campaign: {
    id: string;
    name: string;
    vehicleModels: Array<{ vehicleModelId: string; formulas: ClaimFormula[] }>;
  } | null;
}

export interface ClaimRow {
  no: number;
  saleId: string;
  saleNumber: string;
  customerName: string;
  modelName: string;
  engineNumber: string;
  vin: string;
  financeProvider: string;
  saleDate: Date | null;
  notifyDate: Date | null;
  campaignName: string;
  /** ราคาขาย (MSRP incl VAT) from the vehicle model. */
  salePrice: number;
  /** Per-car expense amounts aligned 1:1 to expenseColumns; null = model lacks that line. */
  cells: Array<number | null>;
  /** Sum of this car's expense lines (ยอดเบิกต่อคัน). */
  total: number;
}

const modelLabel = (vm: ClaimVehicleModel): string =>
  vm.variant ? `${vm.model} ${vm.variant}` : vm.model;

const resolveModel = (sale: ClaimSaleInput): ClaimVehicleModel | null =>
  sale.stock?.vehicleModel ?? sale.vehicleModel;

export function buildCampaignClaimReport(sales: ClaimSaleInput[]) {
  const sorted = [...sales].sort((a, b) => {
    const da = a.stock?.soldDate ?? a.completedDate;
    const db = b.stock?.soldDate ?? b.completedDate;
    return (da?.getTime() ?? 0) - (db?.getTime() ?? 0);
  });

  // Pass 1: per-sale amount map (name → baht) + the union of column names in
  // first-appearance order.
  const expenseColumns: string[] = [];
  const seen = new Set<string>();
  const perSale = sorted.map((sale) => {
    const vm = resolveModel(sale);
    const vmId = vm?.id ?? null;
    const cvm = vmId
      ? sale.campaign?.vehicleModels.find((m) => m.vehicleModelId === vmId)
      : undefined;
    const amounts = new Map<string, number>();
    if (cvm && vm) {
      const bases = {
        cost: sale.stock ? toNum(sale.stock.baseCost) : 0,
        selling: toNum(vm.price),
      };
      for (const f of cvm.formulas) {
        const amt = formulaSubsidyAmount(f.operator, toNum(f.value), f.priceTarget, bases);
        amounts.set(f.name, round2((amounts.get(f.name) ?? 0) + amt));
        if (!seen.has(f.name)) {
          seen.add(f.name);
          expenseColumns.push(f.name);
        }
      }
    }
    const total = round2([...amounts.values()].reduce((s, a) => s + a, 0));
    return { sale, vm, amounts, total };
  });

  // Pass 2: align each row's cells to the now-complete column list.
  const rows: ClaimRow[] = perSale.map(({ sale, vm, amounts, total }, idx) => ({
    no: idx + 1,
    saleId: sale.id,
    saleNumber: sale.saleNumber,
    customerName: sale.customer?.name ?? '',
    modelName: vm ? modelLabel(vm) : '',
    engineNumber: sale.stock?.engineNumber ?? '',
    vin: sale.stock?.vin ?? '',
    financeProvider: sale.financeProvider ?? '',
    saleDate: sale.stock?.soldDate ?? sale.completedDate,
    notifyDate: sale.completedDate ?? sale.stock?.soldDate ?? null,
    campaignName: sale.campaign?.name ?? '',
    salePrice: vm ? toNum(vm.price) : 0,
    cells: expenseColumns.map((name) => (amounts.has(name) ? (amounts.get(name) as number) : null)),
    total,
  }));

  const columnTotals = expenseColumns.map((_, j) =>
    round2(rows.reduce((s, r) => s + (r.cells[j] ?? 0), 0))
  );
  const grandTotal = round2(rows.reduce((s, r) => s + r.total, 0));

  return {
    expenseColumns,
    rows,
    summary: { totalCars: rows.length, columnTotals, grandTotal },
  };
}
