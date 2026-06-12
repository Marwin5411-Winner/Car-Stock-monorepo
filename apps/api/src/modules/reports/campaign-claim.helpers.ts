import type { FormulaOperator, FormulaPriceTarget } from '@prisma/client';
import { campaignFormulasService } from '../campaigns/campaign-formulas.service';

const round2 = (n: number) => Math.round(n * 100) / 100;
const toNum = (v: { toString(): string } | number | null | undefined): number =>
  v == null ? 0 : Number(v);

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
  promotionDiscount: number;
  baseCommission: number;
  claimTotal: number;
  /** One slot per modelColumns entry; claimTotal in the car's column, null elsewhere. */
  modelAmounts: Array<number | null>;
}

const modelLabel = (vm: ClaimVehicleModel): string =>
  vm.variant ? `${vm.model} ${vm.variant}` : vm.model;

const resolveModel = (sale: ClaimSaleInput): ClaimVehicleModel | null =>
  sale.stock?.vehicleModel ?? sale.vehicleModel;

export function buildCampaignClaimReport(sales: ClaimSaleInput[]) {
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
      promotionDiscount,
      baseCommission,
      claimTotal,
      modelAmounts,
    };
  });

  const modelTotals = modelColumns.map((_, i) =>
    round2(rows.reduce((sum, r) => sum + (r.modelAmounts[i] ?? 0), 0))
  );
  const grandTotal = round2(rows.reduce((sum, r) => sum + r.claimTotal, 0));

  return {
    modelColumns,
    rows,
    summary: { totalCars: rows.length, modelTotals, grandTotal },
  };
}
