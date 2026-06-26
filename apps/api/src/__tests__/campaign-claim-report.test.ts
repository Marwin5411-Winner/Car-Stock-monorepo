// apps/api/src/__tests__/campaign-claim-report.test.ts
import { describe, expect, test } from 'bun:test';
import {
  type ClaimSaleInput,
  buildCampaignClaimReport,
  computeCampaignSubsidies,
} from '../modules/reports/campaign-claim.helpers';

const model = (id: string, modelName: string, variant: string | null, price: number) => ({
  id,
  brand: 'NETA',
  model: modelName,
  variant,
  price,
});

type Fm = {
  id: string;
  name: string;
  operator: 'PERCENT' | 'FIXED' | 'SUBTRACT' | 'ADD' | 'MULTIPLY' | 'PERCENT_SUBTRACT';
  value: number;
  priceTarget: 'SELLING_PRICE' | 'COST_PRICE';
  sortOrder: number;
};

const saleWith = (args: {
  id: string;
  vmId: string;
  modelName: string;
  variant: string | null;
  price: number;
  baseCost: number | null; // null → no stock
  soldDate: Date;
  formulas: Fm[];
}): ClaimSaleInput => {
  const vm = model(args.vmId, args.modelName, args.variant, args.price);
  return {
    id: args.id,
    saleNumber: args.id,
    customer: { name: `cust-${args.id}` },
    financeProvider: 'KTB',
    carDiscount: 0,
    discountSnapshot: 0,
    completedDate: args.soldDate,
    vehicleModelId: args.vmId,
    vehicleModel: vm,
    stock:
      args.baseCost == null
        ? null
        : {
            vin: `VIN-${args.id}`,
            engineNumber: `ENG-${args.id}`,
            soldDate: args.soldDate,
            baseCost: args.baseCost,
            vehicleModelId: args.vmId,
            vehicleModel: vm,
          },
    campaign: {
      id: 'camp1',
      name: 'Expense campaign',
      vehicleModels: [{ vehicleModelId: args.vmId, formulas: args.formulas }],
    },
  };
};

describe('buildCampaignClaimReport (expense columns)', () => {
  // V (price 500,000): เปิดบูธ 1% sell = 5,000 ; Marketing 5% sell = 25,000
  const saleV = saleWith({
    id: 's1',
    vmId: 'vm1',
    modelName: 'V',
    variant: 'LITE',
    price: 500_000,
    baseCost: 450_000,
    soldDate: new Date('2026-05-10T07:00:00Z'),
    formulas: [
      { id: 'a', name: 'เปิดบูธ', operator: 'PERCENT', value: 1, priceTarget: 'SELLING_PRICE', sortOrder: 1 },
      { id: 'b', name: 'Marketing', operator: 'PERCENT', value: 5, priceTarget: 'SELLING_PRICE', sortOrder: 2 },
    ],
  });
  // X (price 700,000): เปิดบูธ 0.5% sell = 3,500 ; ค่าขนส่ง FIXED 3,000
  const saleX = saleWith({
    id: 's2',
    vmId: 'vm2',
    modelName: 'X',
    variant: 'COMFORT',
    price: 700_000,
    baseCost: 650_000,
    soldDate: new Date('2026-05-15T07:00:00Z'),
    formulas: [
      { id: 'c', name: 'เปิดบูธ', operator: 'PERCENT', value: 0.5, priceTarget: 'SELLING_PRICE', sortOrder: 1 },
      { id: 'd', name: 'ค่าขนส่ง', operator: 'FIXED', value: 3000, priceTarget: 'SELLING_PRICE', sortOrder: 2 },
    ],
  });

  test('expenseColumns is the union of line names in first-appearance order', () => {
    const r = buildCampaignClaimReport([saleV, saleX]);
    expect(r.expenseColumns).toEqual(['เปิดบูธ', 'Marketing', 'ค่าขนส่ง']);
  });

  test('cells align to columns; missing line → null', () => {
    const r = buildCampaignClaimReport([saleV, saleX]);
    // rows sorted by soldDate ascending: V (05-10) then X (05-15)
    expect(r.rows[0].modelName).toBe('V LITE');
    expect(r.rows[0].cells).toEqual([5_000, 25_000, null]);
    expect(r.rows[0].total).toBe(30_000);
    expect(r.rows[1].modelName).toBe('X COMFORT');
    expect(r.rows[1].cells).toEqual([3_500, null, 3_000]);
    expect(r.rows[1].total).toBe(6_500);
  });

  test('columnTotals + grandTotal, with the Σcolumns == grandTotal invariant', () => {
    const r = buildCampaignClaimReport([saleV, saleX]);
    expect(r.summary.columnTotals).toEqual([8_500, 25_000, 3_000]);
    expect(r.summary.grandTotal).toBe(36_500);
    expect(r.summary.columnTotals.reduce((a, b) => a + b, 0)).toBe(r.summary.grandTotal);
    expect(r.summary.totalCars).toBe(2);
  });

  test('no stock: a cost-based % cell resolves to 0', () => {
    const noStock = saleWith({
      id: 's3',
      vmId: 'vm1',
      modelName: 'V',
      variant: 'LITE',
      price: 500_000,
      baseCost: null,
      soldDate: new Date('2026-05-20T07:00:00Z'),
      formulas: [
        { id: 'm', name: 'Marketing', operator: 'PERCENT', value: 1, priceTarget: 'COST_PRICE', sortOrder: 1 },
        { id: 's', name: 'เปิดบูธ', operator: 'PERCENT', value: 1, priceTarget: 'SELLING_PRICE', sortOrder: 2 },
      ],
    });
    const r = buildCampaignClaimReport([noStock]);
    expect(r.expenseColumns).toEqual(['Marketing', 'เปิดบูธ']);
    expect(r.rows[0].cells).toEqual([0, 5_000]); // cost % → 0 ; selling 1% of 500,000 = 5,000
    expect(r.rows[0].total).toBe(5_000);
  });

  test('empty input → empty columns/rows and zero totals', () => {
    const r = buildCampaignClaimReport([]);
    expect(r.expenseColumns).toEqual([]);
    expect(r.rows).toEqual([]);
    expect(r.summary).toEqual({ totalCars: 0, columnTotals: [], grandTotal: 0 });
  });
});

// Brand-standard subsidy rates (from customer's ตัวอย่างหนังสือและรายงาน.xls sheet แคมเปญ):
// STOCK LEVEL 0.5% MSRP, After Sales 0.25%×2 MSRP, MARKETING 1% DNP, เป้าขาย tier% DNP.
const STD_RATES = {
  stockLevel: 0.005,
  afterSalesNoComplaint: 0.0025,
  afterSalesQr: 0.0025,
  marketing: 0.01,
  retailTargetTier: 0.01, // chosen tier (0.005 / 0.01 / 0.015)
} as const;

describe('computeCampaignSubsidies', () => {
  // Ground truth: CHERY V23 2WD PLUS — sale price 759,900 (incl VAT), cost (DNP) 714,306.
  // MSRP = 759900 × 100/107 = 710,186.92. Values taken from the customer's own cells.
  test('computes each subsidy bucket from MSRP (ex-VAT) and DNP', () => {
    const s = computeCampaignSubsidies(759900, 714306, STD_RATES);
    expect(s.stockLevel).toBe(3550.93); // 710186.92 × 0.5%
    expect(s.afterSalesNoComplaint).toBe(1775.47); // 710186.92 × 0.25%
    expect(s.afterSalesQr).toBe(1775.47);
    expect(s.marketing).toBe(7143.06); // 714306 × 1%
    expect(s.retailTarget).toBe(7143.06); // 714306 × 1% (tier)
    expect(s.total).toBe(21387.99); // SUM, rounded — matches cell 21387.989158878507
  });
});
