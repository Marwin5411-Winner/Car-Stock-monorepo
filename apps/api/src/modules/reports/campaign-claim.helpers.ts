import type { FormulaOperator, FormulaPriceTarget } from '@prisma/client';
import { campaignFormulasService } from '../campaigns/campaign-formulas.service';

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

/** Brand-standard rates from the customer's template (เป้าขาย defaults to the 1% tier). */
export const DEFAULT_SUBSIDY_RATES: SubsidyRates = {
  stockLevel: 0.005,
  afterSalesNoComplaint: 0.0025,
  afterSalesQr: 0.0025,
  marketing: 0.01,
  retailTargetTier: 0.01,
};

/**
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
  promotionDiscount: number;
  baseCommission: number;
  claimTotal: number;
  /** Per-bucket brand reimbursement amounts (STOCK LEVEL / After Sales×2 / MARKETING / เป้าขาย). */
  subsidies: SubsidyAmounts;
  /** One slot per modelColumns entry; claimTotal in the car's column, null elsewhere. */
  modelAmounts: Array<number | null>;
}

const modelLabel = (vm: ClaimVehicleModel): string =>
  vm.variant ? `${vm.model} ${vm.variant}` : vm.model;

const resolveModel = (sale: ClaimSaleInput): ClaimVehicleModel | null =>
  sale.stock?.vehicleModel ?? sale.vehicleModel;

export function buildCampaignClaimReport(
  sales: ClaimSaleInput[],
  options: { retailTargetTier?: number } = {}
) {
  const rates: SubsidyRates =
    options.retailTargetTier != null
      ? { ...DEFAULT_SUBSIDY_RATES, retailTargetTier: options.retailTargetTier }
      : DEFAULT_SUBSIDY_RATES;
  // Distinct model columns from sales actually present, sorted by label.
  const columnMap = new Map<string, { vehicleModelId: string; label: string }>();
  for (const sale of sales) {
    const vm = resolveModel(sale);
    if (vm && !columnMap.has(vm.id)) {
      columnMap.set(vm.id, { vehicleModelId: vm.id, label: modelLabel(vm) });
    }
  }
  const modelColumns = [...columnMap.values()].sort((a, b) => a.label.localeCompare(b.label, 'th'));
  const columnIndex = new Map(modelColumns.map((c, i) => [c.vehicleModelId, i]));

  const sorted = [...sales].sort((a, b) => {
    const da = a.stock?.soldDate ?? a.completedDate;
    const db = b.stock?.soldDate ?? b.completedDate;
    return (da?.getTime() ?? 0) - (db?.getTime() ?? 0);
  });

  const rows: ClaimRow[] = sorted.map((sale, idx) => {
    const vm = resolveModel(sale);

    // Zero is a real value — only null/undefined falls back to the campaign snapshot.
    const promotionDiscount =
      sale.carDiscount != null
        ? round2(toNum(sale.carDiscount))
        : round2(toNum(sale.discountSnapshot));

    // Commission = supplier rebate from the shared formula engine.
    let baseCommission = 0;
    const vmId = vm?.id ?? null;
    const cvm = vmId
      ? sale.campaign?.vehicleModels.find((m) => m.vehicleModelId === vmId)
      : undefined;
    if (cvm && cvm.formulas.length > 0 && vm) {
      const costPrice = sale.stock ? toNum(sale.stock.baseCost) : 0;
      const sellingPrice = toNum(vm.price);
      const applied = campaignFormulasService.applyLoadedFormulas(
        cvm.formulas,
        costPrice,
        sellingPrice
      );
      // Without a stock there is no real cost base, so a cost-side rebate is meaningless.
      baseCommission = sale.stock
        ? round2(-(applied.costPriceDiff + applied.sellingPriceDiff))
        : round2(-applied.sellingPriceDiff);
    }

    const claimTotal = round2(promotionDiscount + baseCommission);
    const subsidies = computeCampaignSubsidies(
      vm ? toNum(vm.price) : 0,
      sale.stock ? toNum(sale.stock.baseCost) : 0,
      rates
    );
    const modelAmounts: Array<number | null> = modelColumns.map(() => null);
    const colIdx = vmId != null ? columnIndex.get(vmId) : undefined;
    if (colIdx !== undefined) modelAmounts[colIdx] = claimTotal;

    return {
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
      promotionDiscount,
      baseCommission,
      claimTotal,
      subsidies,
      modelAmounts,
    };
  });

  const modelTotals = modelColumns.map((_, i) =>
    round2(rows.reduce((sum, r) => sum + (r.modelAmounts[i] ?? 0), 0))
  );
  const grandTotal = round2(rows.reduce((sum, r) => sum + r.claimTotal, 0));

  const sumBucket = (pick: (s: SubsidyAmounts) => number) =>
    round2(rows.reduce((sum, r) => sum + pick(r.subsidies), 0));
  const subsidyTotals: SubsidyAmounts = {
    stockLevel: sumBucket((s) => s.stockLevel),
    afterSalesNoComplaint: sumBucket((s) => s.afterSalesNoComplaint),
    afterSalesQr: sumBucket((s) => s.afterSalesQr),
    marketing: sumBucket((s) => s.marketing),
    retailTarget: sumBucket((s) => s.retailTarget),
    total: sumBucket((s) => s.total),
  };

  return {
    modelColumns,
    rows,
    summary: { totalCars: rows.length, modelTotals, grandTotal, subsidyTotals },
  };
}
