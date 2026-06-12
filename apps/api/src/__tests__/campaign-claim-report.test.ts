// apps/api/src/__tests__/campaign-claim-report.test.ts
import { describe, expect, test } from 'bun:test';
import {
  type ClaimSaleInput,
  buildCampaignClaimReport,
} from '../modules/reports/campaign-claim.helpers';

const model = (id: string, modelName: string, variant: string | null, price: number) => ({
  id,
  brand: 'NETA',
  model: modelName,
  variant,
  price,
});

// A campaign whose model `vmId` has one SUBTRACT-10000-from-cost formula
// → rebate (commission) per car = 10,000.
const campaignWith10kRebate = (vmId: string) => ({
  id: 'camp1',
  name: 'NETA Q2 Push',
  vehicleModels: [
    {
      vehicleModelId: vmId,
      formulas: [
        {
          id: 'f1',
          name: 'คอมมิชชั่นพื้นฐาน',
          operator: 'SUBTRACT' as const,
          value: 10000,
          priceTarget: 'COST_PRICE' as const,
          sortOrder: 1,
        },
      ],
    },
  ],
});

const baseSale = (overrides: Partial<ClaimSaleInput> = {}): ClaimSaleInput => ({
  id: 's1',
  saleNumber: 'SL-2026-0001',
  customer: { name: 'สมชาย ใจดี' },
  financeProvider: 'KTB Leasing',
  carDiscount: 5000,
  discountSnapshot: 99999, // must be ignored when carDiscount is set
  completedDate: new Date('2026-05-20T07:00:00Z'),
  vehicleModelId: 'vm1',
  vehicleModel: model('vm1', 'V', 'LITE', 500000),
  stock: {
    vin: 'VIN001',
    engineNumber: 'ENG001',
    soldDate: new Date('2026-05-15T07:00:00Z'),
    baseCost: 450000,
    vehicleModelId: 'vm1',
    vehicleModel: model('vm1', 'V', 'LITE', 500000),
  },
  campaign: campaignWith10kRebate('vm1'),
  ...overrides,
});

describe('buildCampaignClaimReport', () => {
  test('maps a sale to a claim row with discount + commission and model column placement', () => {
    const report = buildCampaignClaimReport([baseSale()]);

    expect(report.modelColumns).toEqual([{ vehicleModelId: 'vm1', label: 'V LITE' }]);
    expect(report.rows).toHaveLength(1);

    const row = report.rows[0];
    expect(row.no).toBe(1);
    expect(row.customerName).toBe('สมชาย ใจดี');
    expect(row.modelName).toBe('V LITE');
    expect(row.engineNumber).toBe('ENG001');
    expect(row.vin).toBe('VIN001');
    expect(row.financeProvider).toBe('KTB Leasing');
    expect(row.promotionDiscount).toBe(5000);
    expect(row.baseCommission).toBe(10000);
    expect(row.claimTotal).toBe(15000);
    // claim amount lands in the column of the car's model
    expect(row.modelAmounts).toEqual([15000]);
    expect(row.saleDate).toEqual(new Date('2026-05-15T07:00:00Z'));
    expect(row.notifyDate).toEqual(new Date('2026-05-20T07:00:00Z'));
  });

  test('zero carDiscount does NOT fall back to discountSnapshot', () => {
    const report = buildCampaignClaimReport([baseSale({ carDiscount: 0 })]);
    expect(report.rows[0].promotionDiscount).toBe(0);
    expect(report.rows[0].claimTotal).toBe(10000); // commission only
  });

  test('null carDiscount falls back to discountSnapshot', () => {
    const report = buildCampaignClaimReport([
      baseSale({ carDiscount: null, discountSnapshot: 7000 }),
    ]);
    expect(report.rows[0].promotionDiscount).toBe(7000);
  });

  test('sale without stock uses sale.vehicleModel, blank VIN/engine, completedDate as sale date', () => {
    const report = buildCampaignClaimReport([
      baseSale({
        stock: null,
        // commission needs baseCost from stock; without stock the cost-side
        // formula has no base → commission falls back to 0
      }),
    ]);
    const row = report.rows[0];
    expect(row.vin).toBe('');
    expect(row.engineNumber).toBe('');
    expect(row.modelName).toBe('V LITE');
    expect(row.saleDate).toEqual(new Date('2026-05-20T07:00:00Z'));
    expect(row.promotionDiscount).toBe(5000);
  });

  test('builds distinct sorted model columns and per-column + grand totals', () => {
    const saleB = baseSale({
      id: 's2',
      saleNumber: 'SL-2026-0002',
      customer: { name: 'สมหญิง รักดี' },
      carDiscount: 2000,
      vehicleModelId: 'vm2',
      vehicleModel: model('vm2', 'X', 'COMFORT', 700000),
      stock: {
        vin: 'VIN002',
        engineNumber: 'ENG002',
        soldDate: new Date('2026-05-10T07:00:00Z'),
        baseCost: 650000,
        vehicleModelId: 'vm2',
        vehicleModel: model('vm2', 'X', 'COMFORT', 700000),
      },
      campaign: campaignWith10kRebate('vm2'),
    });
    const report = buildCampaignClaimReport([baseSale(), saleB]);

    // sorted by label: V LITE, X COMFORT
    expect(report.modelColumns.map((c) => c.label)).toEqual(['V LITE', 'X COMFORT']);
    // rows sorted by sale date ascending → saleB (05-10) first
    expect(report.rows[0].customerName).toBe('สมหญิง รักดี');
    expect(report.rows[0].no).toBe(1);
    expect(report.rows[0].modelAmounts).toEqual([null, 12000]);
    expect(report.rows[1].modelAmounts).toEqual([15000, null]);

    expect(report.summary.totalCars).toBe(2);
    expect(report.summary.modelTotals).toEqual([15000, 12000]);
    expect(report.summary.grandTotal).toBe(27000);
  });

  test('empty input produces empty rows and zero totals', () => {
    const report = buildCampaignClaimReport([]);
    expect(report.rows).toEqual([]);
    expect(report.modelColumns).toEqual([]);
    expect(report.summary).toEqual({ totalCars: 0, modelTotals: [], grandTotal: 0 });
  });
});
