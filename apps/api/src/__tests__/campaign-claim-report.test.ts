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
    expect(row.salePrice).toBe(500000); // from vehicle model price (MSRP incl VAT)
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

  test('baseCommission sums expense lines: % of selling + fixed baht', () => {
    const report = buildCampaignClaimReport([
      baseSale({
        carDiscount: 0,
        campaign: {
          id: 'camp1',
          name: 'Expense campaign',
          vehicleModels: [
            {
              vehicleModelId: 'vm1',
              formulas: [
                { id: 'p', name: 'Marketing', operator: 'PERCENT' as const, value: 1, priceTarget: 'SELLING_PRICE' as const, sortOrder: 1 },
                { id: 'f', name: 'ค่าขนส่ง', operator: 'FIXED' as const, value: 3000, priceTarget: 'SELLING_PRICE' as const, sortOrder: 2 },
              ],
            },
          ],
        },
      }),
    ]);
    // 1% of 500,000 = 5,000 + fixed 3,000 = 8,000
    expect(report.rows[0].baseCommission).toBe(8000);
    expect(report.rows[0].claimTotal).toBe(8000); // carDiscount 0
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

  test('no stock: cost-based % yields 0 (no cost base), selling-based % still counts', () => {
    const report = buildCampaignClaimReport([
      baseSale({
        carDiscount: 0,
        stock: null,
        campaign: {
          id: 'camp1',
          name: 'NETA Q2 Push',
          vehicleModels: [
            {
              vehicleModelId: 'vm1',
              formulas: [
                { id: 'c', name: 'Marketing', operator: 'PERCENT' as const, value: 1, priceTarget: 'COST_PRICE' as const, sortOrder: 1 },
                { id: 's', name: 'เปิดบูธ', operator: 'PERCENT' as const, value: 1, priceTarget: 'SELLING_PRICE' as const, sortOrder: 2 },
              ],
            },
          ],
        },
      }),
    ]);
    // no stock → cost base 0 → cost-based % = 0 ; selling 1% of 500,000 = 5,000
    expect(report.rows[0].baseCommission).toBe(5000);
    expect(report.rows[0].claimTotal).toBe(5000);
  });

  test('empty input produces empty rows and zero totals', () => {
    const report = buildCampaignClaimReport([]);
    expect(report.rows).toEqual([]);
    expect(report.modelColumns).toEqual([]);
    expect(report.summary).toEqual({
      totalCars: 0,
      modelTotals: [],
      grandTotal: 0,
      subsidyTotals: {
        stockLevel: 0,
        afterSalesNoComplaint: 0,
        afterSalesQr: 0,
        marketing: 0,
        retailTarget: 0,
        total: 0,
      },
    });
  });

  test('summary.subsidyTotals sums each bucket across rows', () => {
    const mk = (id: string) =>
      baseSale({
        id,
        saleNumber: id,
        vehicleModel: model('vm1', 'V', 'LITE', 535000),
        stock: {
          vin: `V${id}`,
          engineNumber: `E${id}`,
          soldDate: new Date('2026-05-15T07:00:00Z'),
          baseCost: 450000,
          vehicleModelId: 'vm1',
          vehicleModel: model('vm1', 'V', 'LITE', 535000),
        },
      });
    const report = buildCampaignClaimReport([mk('a'), mk('b')]);
    expect(report.summary.subsidyTotals).toEqual({
      stockLevel: 5000,
      afterSalesNoComplaint: 2500,
      afterSalesQr: 2500,
      marketing: 9000,
      retailTarget: 9000,
      total: 28000,
    });
  });

  test('retailTargetTier option overrides the default เป้าขาย tier', () => {
    const sale = baseSale({
      vehicleModel: model('vm1', 'V', 'LITE', 535000),
      stock: {
        vin: 'VIN001',
        engineNumber: 'ENG001',
        soldDate: new Date('2026-05-15T07:00:00Z'),
        baseCost: 450000,
        vehicleModelId: 'vm1',
        vehicleModel: model('vm1', 'V', 'LITE', 535000),
      },
    });
    const s = buildCampaignClaimReport([sale], { retailTargetTier: 0.015 }).rows[0].subsidies;
    expect(s.retailTarget).toBe(6750); // 450000 × 1.5%
    expect(s.total).toBe(16250); // 2500 + 1250 + 1250 + 4500 + 6750
  });

  test('each row carries computed subsidy buckets (MSRP from incl-VAT price, DNP from cost)', () => {
    // price 535,000 incl VAT → MSRP 500,000; cost (DNP) 450,000; default tier 1%.
    const sale = baseSale({
      vehicleModel: model('vm1', 'V', 'LITE', 535000),
      stock: {
        vin: 'VIN001',
        engineNumber: 'ENG001',
        soldDate: new Date('2026-05-15T07:00:00Z'),
        baseCost: 450000,
        vehicleModelId: 'vm1',
        vehicleModel: model('vm1', 'V', 'LITE', 535000),
      },
    });
    const s = buildCampaignClaimReport([sale]).rows[0].subsidies;
    expect(s.stockLevel).toBe(2500); // 500000 × 0.5%
    expect(s.afterSalesNoComplaint).toBe(1250); // 500000 × 0.25%
    expect(s.afterSalesQr).toBe(1250);
    expect(s.marketing).toBe(4500); // 450000 × 1%
    expect(s.retailTarget).toBe(4500); // 450000 × 1% (default tier)
    expect(s.total).toBe(14000);
  });

  test('subsidy DNP buckets are zero without stock (no cost base), MSRP buckets still apply', () => {
    const s = buildCampaignClaimReport([
      baseSale({ stock: null, vehicleModel: model('vm1', 'V', 'LITE', 535000) }),
    ]).rows[0].subsidies;
    expect(s.stockLevel).toBe(2500); // MSRP from price still works
    expect(s.marketing).toBe(0); // no cost → no DNP buckets
    expect(s.retailTarget).toBe(0);
    expect(s.total).toBe(5000); // 2500 + 1250 + 1250
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
