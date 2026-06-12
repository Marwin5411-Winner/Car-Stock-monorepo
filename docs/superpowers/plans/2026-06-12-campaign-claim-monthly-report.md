# Monthly Campaign Claim Report Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a monthly, brand-filterable campaign claim report (รายงานเบิกแคมเปญเงินส่งเสริมการขายประจำเดือน) matching the brand's submission form, exported as PDF (2-row form layout) and Excel (flat rows).

**Architecture:** New pure builder helper in the reports module (unit-testable without DB) + thin Prisma query in `reports.service.ts`. JSON route in `reports.controller.ts`, PDF route in `pdf.controller.ts` (mirrors monthly-purchases pattern). New Handlebars template. New web page reusing `exportUtils.ts` for Excel. Existing per-campaign report untouched.

**Tech Stack:** ElysiaJS + Prisma + Handlebars (API), React 19 + TanStack Query + xlsx (web), Bun test runner.

**Spec:** `docs/superpowers/specs/2026-06-12-campaign-claim-monthly-report-design.md`

**Conventions to follow:**
- Biome: single quotes, semicolons, 2-space indent, 100 char width. Run `bun run lint` before each commit.
- Money: round to 2 decimals (`Math.round(n * 100) / 100`).
- Zero-discount rule (commit `a09c6cb`): a `carDiscount` of `0` must NOT fall back to `discountSnapshot` — only `null`/`undefined` falls back.
- Commission = campaign formula rebate: `-(costPriceDiff + sellingPriceDiff)` from `campaignFormulasService.applyLoadedFormulas` (same convention as `campaigns.service.ts:~775`).

---

### Task 1: Pure report builder (`buildCampaignClaimReport`) — TDD

**Files:**
- Create: `apps/api/src/modules/reports/campaign-claim.helpers.ts`
- Test: `apps/api/src/__tests__/campaign-claim-report.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// apps/api/src/__tests__/campaign-claim-report.test.ts
import { describe, expect, test } from 'bun:test';
import {
  buildCampaignClaimReport,
  type ClaimSaleInput,
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/api && bun test campaign-claim-report`
Expected: FAIL — cannot resolve `../modules/reports/campaign-claim.helpers`

- [ ] **Step 3: Implement the builder**

```typescript
// apps/api/src/modules/reports/campaign-claim.helpers.ts
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
  operator: 'ADD' | 'SUBTRACT' | 'MULTIPLY' | 'PERCENT';
  value: { toString(): string } | number;
  priceTarget: 'COST_PRICE' | 'SELLING_PRICE';
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
  const modelColumns = [...columnMap.values()].sort((a, b) =>
    a.label.localeCompare(b.label, 'th')
  );
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
      sale.carDiscount != null ? round2(toNum(sale.carDiscount)) : round2(toNum(sale.discountSnapshot));

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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/api && bun test campaign-claim-report`
Expected: PASS (6 tests)

- [ ] **Step 5: Lint and commit**

```bash
bun run lint && git add apps/api/src/modules/reports/campaign-claim.helpers.ts apps/api/src/__tests__/campaign-claim-report.test.ts
git commit -m "feat(api): campaign claim report builder with model columns and totals"
```

---

### Task 2: Service method `getCampaignClaimReport`

**Files:**
- Modify: `apps/api/src/modules/reports/reports.service.ts` (add function before the final `reportsService` export object, then register it in that object)

- [ ] **Step 1: Add the service function**

Add near the other report functions (after `getMonthlyPurchasesReport`). Note `db` and helpers are already imported at the top of this file:

```typescript
export async function getCampaignClaimReport(params: {
  year: number;
  month: number;
  brand: string;
}) {
  const { year, month, brand } = params;
  // Half-open interval: [startDate, endDate) — same convention as monthly purchases.
  const startDate = new Date(year, month - 1, 1, 0, 0, 0, 0);
  const endDate = new Date(year, month, 1, 0, 0, 0, 0);

  const vehicleModelSelect = {
    select: { id: true, brand: true, model: true, variant: true, price: true },
  } as const;

  const sales = await db.sale.findMany({
    where: {
      campaignId: { not: null },
      status: { notIn: ['CANCELLED'] },
      OR: [
        { stock: { is: { soldDate: { gte: startDate, lt: endDate } } } },
        { stock: null, completedDate: { gte: startDate, lt: endDate } },
      ],
    },
    include: {
      customer: { select: { name: true } },
      vehicleModel: vehicleModelSelect,
      stock: {
        select: {
          vin: true,
          engineNumber: true,
          soldDate: true,
          baseCost: true,
          vehicleModelId: true,
          vehicleModel: vehicleModelSelect,
        },
      },
      campaign: {
        select: {
          id: true,
          name: true,
          vehicleModels: {
            select: {
              vehicleModelId: true,
              formulas: { orderBy: { sortOrder: 'asc' } },
            },
          },
        },
      },
    },
    orderBy: { createdAt: 'asc' },
  });

  // Brand lives on the resolved model (stock's model wins) — filter in JS to
  // keep the OR query simple; monthly volumes are small.
  const brandSales = sales.filter(
    (s) => (s.stock?.vehicleModel?.brand ?? s.vehicleModel?.brand) === brand
  );

  const report = buildCampaignClaimReport(brandSales as never);

  return {
    period: {
      year,
      month,
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
    },
    brand,
    ...report,
  };
}
```

Add the import at the top of `reports.service.ts`:

```typescript
import { buildCampaignClaimReport } from './campaign-claim.helpers';
```

Register in the export object at the bottom:

```typescript
export const reportsService = {
  getDailyPaymentReport,
  getStockReport,
  getProfitLossReport,
  getSalesSummaryReport,
  getStockInterestReport,
  getPurchaseRequirementReport,
  getDailyStockSnapshot,
  getMonthlyPurchasesReport,
  getCampaignClaimReport,
};
```

- [ ] **Step 2: Typecheck**

Run: `bun run typecheck`
Expected: PASS. If the `as never` cast on `buildCampaignClaimReport(brandSales as never)` is needed because Prisma's Decimal doesn't structurally match, prefer fixing by keeping the helper input types as `{ toString(): string } | number` (already done in Task 1) and remove the cast — `buildCampaignClaimReport(brandSales)` should typecheck directly. Only keep a cast if Prisma's generated types genuinely refuse; then narrow it to `as unknown as ClaimSaleInput[]` with the import added.

- [ ] **Step 3: Run full API tests**

Run: `cd apps/api && bun test`
Expected: PASS (no regressions)

- [ ] **Step 4: Commit**

```bash
bun run lint && git add apps/api/src/modules/reports/reports.service.ts
git commit -m "feat(api): monthly campaign claim report service with brand filter"
```

---

### Task 3: PDF template + pdf.service method

**Files:**
- Modify: `apps/api/src/modules/pdf/types.ts` (enum + data interface)
- Create: `apps/api/src/modules/pdf/templates/campaign-claim-monthly.hbs`
- Modify: `apps/api/src/modules/pdf/pdf.service.ts` (generator method)

- [ ] **Step 1: Add enum value and data interface in `types.ts`**

In `PdfTemplateType` (line ~358, after `CAMPAIGN_REPORT`):

```typescript
  CAMPAIGN_CLAIM_MONTHLY = 'campaign-claim-monthly',
```

After the other report data interfaces (e.g., below `PurchaseRequirementReportData`):

```typescript
export interface CampaignClaimReportData {
  header: {
    logoBase64: string;
    companyName: string;
    address1: string;
    address2: string;
    phone: string;
  };
  monthLabel: string; // e.g. 'พฤษภาคม 2569'
  brand: string;
  modelColumns: Array<{ label: string }>;
  rows: Array<{
    no: number;
    customerName: string;
    modelName: string;
    engineNumber: string;
    vin: string;
    financeProvider: string;
    saleDate: string | null; // ISO string, formatted in template
    notifyDate: string | null;
    campaignName: string;
    promotionDiscount: number;
    baseCommission: number;
    claimTotal: number;
    modelAmounts: Array<number | null>;
  }>;
  summary: { totalCars: number; modelTotals: number[]; grandTotal: number };
  printedAt: string;
}
```

- [ ] **Step 2: Create the Handlebars template**

The brand form layout: two header rows, two `<tr>` per sale. Column order:
ลำดับ | ชื่อ-สกุล/แบบรถ | เลขเครื่อง/เลขตัวรถ | ไฟแนนท์/วันที่ขาย | ส่วนลดโปรโมชั่น/วันที่รับเงิน | คอมมิชชั่นพื้นฐาน/วันที่รับเงิน | STANDARD model columns | เป้าขาย model columns (blank) | รวมรับเงิน/วันที่แจ้งขาย | ค่าใช้จ่ายซื้อ/แลกรถ (blank).

`formatThaiDate` and `formatCurrency` helpers are already registered (used by `campaign-report.hbs`).

```handlebars
{{! apps/api/src/modules/pdf/templates/campaign-claim-monthly.hbs }}
<div class="header">
  <div class="header-logo">
    <img src="{{header.logoBase64}}" alt="Logo">
  </div>
  <div class="header-info">
    <div class="company-name-wrapper">
      <div class="company-name">{{header.companyName}}</div>
      <div class="header-line"></div>
      <div class="header-address">
        {{header.address1}}<br>
        {{header.address2}}<br>
        {{header.phone}}
      </div>
    </div>
  </div>
</div>

<div class="document-title" style="font-size: 14px; margin: 10px 0 2px;">
  รายงานเบิกแคมเปญเงินส่งเสริมการขายประจำเดือน {{monthLabel}}
</div>
<div class="text-center" style="font-size: 11px; margin-bottom: 10px;">
  ยี่ห้อ: <strong>{{brand}}</strong>
</div>

<table class="claim-table">
  <thead>
    <tr>
      <th rowspan="2">ลำดับ</th>
      <th>ชื่อ - สกุล</th>
      <th>เลขเครื่อง</th>
      <th>ไฟแนนท์</th>
      <th>ส่วนลดโปรโมชั่น</th>
      <th>คอมมิชชั่นพื้นฐาน</th>
      {{#if modelColumns.length}}
      <th colspan="{{modelColumns.length}}">STANDARD</th>
      <th colspan="{{modelColumns.length}}">เป้าขาย</th>
      {{/if}}
      <th>รวมรับเงิน</th>
      <th rowspan="2" class="w-expense">ค่าใช้จ่ายในการซื้อ/แลกรถ<br><span class="sub">ในการแลก/ซื้อรถกับดีเลอร์</span></th>
    </tr>
    <tr>
      <th class="sub-h">แบบรถ</th>
      <th class="sub-h">เลขตัวรถ</th>
      <th class="sub-h">วันที่ขาย</th>
      <th class="sub-h">วันที่รับเงิน</th>
      <th class="sub-h">วันที่รับเงิน</th>
      {{#each modelColumns}}
      <th class="sub-h model-col">{{label}}</th>
      {{/each}}
      {{#each modelColumns}}
      <th class="sub-h model-col target-col">{{label}}</th>
      {{/each}}
      <th class="sub-h">วันที่แจ้งขาย</th>
    </tr>
  </thead>
  <tbody>
    {{#each rows}}
    <tr class="row-top">
      <td rowspan="2" class="tc">{{no}}</td>
      <td>{{customerName}}</td>
      <td class="tc mono">{{engineNumber}}</td>
      <td class="tc">{{financeProvider}}</td>
      <td class="tr">{{#if promotionDiscount}}{{formatCurrency promotionDiscount false}}{{/if}}</td>
      <td class="tr">{{#if baseCommission}}{{formatCurrency baseCommission false}}{{/if}}</td>
      {{#each modelAmounts}}
      <td class="tr model-col">{{#if this}}{{formatCurrency this false}}{{/if}}</td>
      {{/each}}
      {{#each ../modelColumns}}
      <td class="target-col"></td>
      {{/each}}
      <td class="tr strong">{{formatCurrency claimTotal false}}</td>
      <td rowspan="2" class="fill-cell"></td>
    </tr>
    <tr class="row-bottom">
      <td>{{modelName}}</td>
      <td class="tc mono">{{vin}}</td>
      <td class="tc">{{#if saleDate}}{{formatThaiDate saleDate 'short'}}{{/if}}</td>
      <td class="fill-cell"></td>
      <td class="fill-cell"></td>
      {{#each modelAmounts}}
      <td class="model-col"></td>
      {{/each}}
      {{#each ../modelColumns}}
      <td class="target-col"></td>
      {{/each}}
      <td class="tc">{{#if notifyDate}}{{formatThaiDate notifyDate 'short'}}{{/if}}</td>
    </tr>
    {{else}}
    <tr>
      <td colspan="100" class="tc muted">ไม่มีรายการเบิกแคมเปญในเดือนนี้</td>
    </tr>
    {{/each}}
    {{#if rows.length}}
    <tr class="row-total">
      <td colspan="4" class="tr strong">รวมทั้งสิ้น ({{summary.totalCars}} คัน)</td>
      <td></td>
      <td></td>
      {{#each summary.modelTotals}}
      <td class="tr strong model-col">{{#if this}}{{formatCurrency this false}}{{/if}}</td>
      {{/each}}
      {{#each modelColumns}}
      <td class="target-col"></td>
      {{/each}}
      <td class="tr strong">{{formatCurrency summary.grandTotal false}}</td>
      <td></td>
    </tr>
    {{/if}}
  </tbody>
</table>

<div class="claim-footer">
  <div class="sign-block">
    <div>ลงชื่อ .................................................. ผู้จัดทำ</div>
    <div class="sign-date">วันที่ ........../........../..........</div>
  </div>
  <div class="sign-block">
    <div>ลงชื่อ .................................................. ผู้อนุมัติ</div>
    <div class="sign-date">วันที่ ........../........../..........</div>
  </div>
</div>
<div class="printed-at">พิมพ์เมื่อ: {{printedAt}}</div>

<style>
  .claim-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 9px;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .claim-table th, .claim-table td {
    border: 1px solid #374151;
    padding: 2px 4px;
    vertical-align: middle;
  }
  .claim-table th {
    background: #f3f4f6 !important;
    font-weight: bold;
    text-align: center;
    font-size: 9px;
  }
  .claim-table th.sub-h { font-weight: normal; font-size: 8px; }
  .claim-table th .sub { font-size: 7px; font-weight: normal; color: #4b5563; }
  .claim-table .tc { text-align: center; }
  .claim-table .tr { text-align: right; }
  .claim-table .mono { font-family: monospace; font-size: 8px; }
  .claim-table .strong { font-weight: bold; }
  .claim-table .muted { color: #6b7280; padding: 10px; }
  .claim-table .model-col { min-width: 44px; }
  .claim-table .w-expense { max-width: 70px; }
  .claim-table .row-top td { border-bottom-style: dotted; }
  .claim-table .row-bottom td { border-top-style: dotted; font-size: 8px; color: #1f2937; }
  .claim-table .row-total td { background: #f3f4f6 !important; }
  .claim-footer {
    display: flex;
    justify-content: space-around;
    margin-top: 28px;
    font-size: 10px;
    page-break-inside: avoid;
  }
  .sign-block { text-align: center; }
  .sign-date { margin-top: 6px; }
  .printed-at { margin-top: 14px; font-size: 8px; color: #6b7280; text-align: right; }
</style>
```

- [ ] **Step 3: Add generator method to `pdf.service.ts`**

Next to `generateMonthlyPurchasesReportPdf` (search for it; add after). Also add `CampaignClaimReportData` to the existing type import from `./types`:

```typescript
  /**
   * Generate Monthly Campaign Claim Report PDF (brand submission form)
   */
  public async generateCampaignClaimReportPdf(data: CampaignClaimReportData): Promise<Buffer> {
    return this.generatePdf(PdfTemplateType.CAMPAIGN_CLAIM_MONTHLY, data, { landscape: true });
  }
```

- [ ] **Step 4: Typecheck**

Run: `bun run typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
bun run lint && git add apps/api/src/modules/pdf/types.ts apps/api/src/modules/pdf/templates/campaign-claim-monthly.hbs apps/api/src/modules/pdf/pdf.service.ts
git commit -m "feat(api): campaign claim monthly PDF template in brand submission format"
```

---

### Task 4: API routes (JSON + PDF)

**Files:**
- Modify: `apps/api/src/modules/reports/reports.controller.ts` (JSON route, append after `/monthly-purchases`)
- Modify: `apps/api/src/modules/pdf/pdf.controller.ts` (PDF route, append after `/monthly-purchases`)

- [ ] **Step 1: Add JSON route to `reports.controller.ts`**

Append to the `reportRoutes` chain (after the `/monthly-purchases` route). `authService`, `authMiddleware`, `t` are already imported:

```typescript
  // ============================================
  // Monthly Campaign Claim Report (brand submission)
  // ============================================
  .get(
    '/campaign-claims',
    async ({ query, set, requester }) => {
      if (!authService.hasPermission(requester!.role, 'CAMPAIGN_VIEW')) {
        set.status = 403;
        return {
          success: false,
          error: 'Forbidden',
          message: 'คุณไม่มีสิทธิ์ดูรายงานนี้',
        };
      }

      const year = Number(query.year);
      const month = Number(query.month);
      if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
        set.status = 400;
        return { success: false, error: 'BadRequest', message: 'year/month invalid' };
      }
      if (!query.brand) {
        set.status = 400;
        return { success: false, error: 'BadRequest', message: 'brand is required' };
      }

      const result = await reportsService.getCampaignClaimReport({
        year,
        month,
        brand: query.brand,
      });

      set.status = 200;
      return { success: true, data: result };
    },
    {
      beforeHandle: authMiddleware,
      query: t.Object({
        year: t.String(),
        month: t.String(),
        brand: t.String(),
      }),
      detail: {
        tags: ['Reports'],
        summary: 'Monthly campaign claim report',
        description:
          'Campaign claim rows for a month, filtered by vehicle brand, in brand submission format',
      },
    }
  );
```

- [ ] **Step 2: Add PDF route to `pdf.controller.ts`**

Append after the `/monthly-purchases` route. Check the top of the file: `reportsService`, `getCompanyHeader`, `pdfService`, `authMiddleware`, `requirePermission`, `t` are already in scope (same ones the monthly-purchases route uses). Thai month label uses Buddhist-era year:

```typescript
  // Monthly Campaign Claim Report PDF (brand submission form)
  .get(
    '/campaign-claims',
    async ({ query, set }) => {
      const year = Number(query.year);
      const month = Number(query.month);
      if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
        set.status = 400;
        return 'Invalid year/month';
      }
      if (!query.brand) {
        set.status = 400;
        return 'brand is required';
      }

      const report = await reportsService.getCampaignClaimReport({
        year,
        month,
        brand: query.brand,
      });
      const header = await getCompanyHeader();
      if (!header.logoBase64) header.logoBase64 = pdfService.getLogoBase64();

      const THAI_MONTHS = [
        'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
        'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม',
      ];
      const monthLabel = `${THAI_MONTHS[month - 1]} ${year + 543}`;

      const rows = report.rows.map((r) => ({
        ...r,
        saleDate: r.saleDate ? r.saleDate.toISOString() : null,
        notifyDate: r.notifyDate ? r.notifyDate.toISOString() : null,
      }));

      const pdfBuffer = await pdfService.generateCampaignClaimReportPdf({
        header,
        monthLabel,
        brand: report.brand,
        modelColumns: report.modelColumns,
        rows,
        summary: report.summary,
        printedAt: new Date().toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' }),
      });
      set.headers['Content-Type'] = 'application/pdf';
      set.headers['Content-Disposition'] =
        `attachment; filename="campaign-claims-${query.brand}-${year}-${String(month).padStart(2, '0')}.pdf"`;
      return pdfBuffer;
    },
    {
      beforeHandle: [authMiddleware, requirePermission('CAMPAIGN_VIEW')],
      query: t.Object({
        year: t.String(),
        month: t.String(),
        brand: t.String(),
      }),
      detail: {
        tags: ['Documents'],
        summary: 'Generate Monthly Campaign Claim Report PDF',
      },
    }
  );
```

- [ ] **Step 3: Verify routes respond**

Run (from repo root, with dev DB up): `cd apps/api && bun run dev` in background, then:

```bash
TOKEN=$(curl -s -X POST http://localhost:3001/api/auth/login -H 'Content-Type: application/json' -d '{"username":"admin","password":"admin123"}' | python3 -c 'import sys,json; print(json.load(sys.stdin)["data"]["token"])')
curl -s "http://localhost:3001/api/reports/campaign-claims?year=2026&month=5&brand=NETA" -H "Authorization: Bearer $TOKEN" | head -c 400
curl -s -o /tmp/claim.pdf -w "%{http_code}" "http://localhost:3001/api/pdf/campaign-claims?year=2026&month=5&brand=NETA" -H "Authorization: Bearer $TOKEN"
```

Expected: JSON `{"success":true,"data":{"period":...}}` and PDF route returns `200` with `/tmp/claim.pdf` a valid PDF (`file /tmp/claim.pdf` → "PDF document"). Brand value: use a brand that exists in seed data — check with `curl ... /api/vehicles?limit=1`. If seed has no campaign sales the report is empty but both routes must still return 200.

- [ ] **Step 4: Run API tests + typecheck, commit**

```bash
cd apps/api && bun test && cd ../.. && bun run typecheck && bun run lint
git add apps/api/src/modules/reports/reports.controller.ts apps/api/src/modules/pdf/pdf.controller.ts
git commit -m "feat(api): campaign claim report JSON and PDF endpoints"
```

---

### Task 5: Web service methods

**Files:**
- Modify: `apps/web/src/services/report.service.ts` (add two methods inside `ReportService` class, before the closing brace)

- [ ] **Step 1: Add methods**

```typescript
  async getCampaignClaimReport(params: {
    year: number;
    month: number;
    brand: string;
  }): Promise<CampaignClaimReportResponse> {
    const qs = new URLSearchParams({
      year: String(params.year),
      month: String(params.month),
      brand: params.brand,
    });
    const url = `/api/reports/campaign-claims?${qs.toString()}`;
    const response = await api.get<CampaignClaimReportResponse>(url);
    if (!response.success || !response.data) {
      throw new Error(response.message || 'Failed to fetch campaign claim report');
    }
    return response.data;
  }

  async getCampaignClaimReportPdf(params: {
    year: number;
    month: number;
    brand: string;
  }): Promise<Blob> {
    const qs = new URLSearchParams({
      year: String(params.year),
      month: String(params.month),
      brand: params.brand,
    });
    const url = `/api/pdf/campaign-claims?${qs.toString()}`;
    return api.getBlob(url);
  }
```

Note: match the file's existing response-unwrapping idiom — open the file and copy exactly how `getMonthlyPurchasesReport` unwraps (`api.get` generic + error throw). If the file defines response types locally or imports from `@car-stock/shared/types`, define this above the class in the same file (keep it local; shared package not needed for one consumer):

```typescript
export interface CampaignClaimRow {
  no: number;
  saleId: string;
  saleNumber: string;
  customerName: string;
  modelName: string;
  engineNumber: string;
  vin: string;
  financeProvider: string;
  saleDate: string | null;
  notifyDate: string | null;
  campaignName: string;
  promotionDiscount: number;
  baseCommission: number;
  claimTotal: number;
  modelAmounts: Array<number | null>;
}

export interface CampaignClaimReportResponse {
  period: { year: number; month: number; startDate: string; endDate: string };
  brand: string;
  modelColumns: Array<{ vehicleModelId: string; label: string }>;
  rows: CampaignClaimRow[];
  summary: { totalCars: number; modelTotals: number[]; grandTotal: number };
}
```

- [ ] **Step 2: Typecheck and commit**

```bash
bun run typecheck && bun run lint
git add apps/web/src/services/report.service.ts
git commit -m "feat(web): campaign claim report service methods"
```

---

### Task 6: Web page + route + menu link

**Files:**
- Create: `apps/web/src/pages/reports/CampaignClaimReportPage.tsx`
- Modify: `apps/web/src/pages/reports/index.ts` (export)
- Modify: `apps/web/src/App.tsx` (lazy import + route)
- Modify: `apps/web/src/pages/reports/ReportsPage.tsx` (menu card/link — open the file and follow its existing card list pattern)

- [ ] **Step 1: Create the page**

```tsx
// apps/web/src/pages/reports/CampaignClaimReportPage.tsx
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { MainLayout } from '../../components/layout';
import { exportMultiSheet } from '../../components/reports/exportUtils';
import { useToast } from '../../components/toast';
import type { CampaignClaimRow } from '../../services/report.service';
import { reportService } from '../../services/report.service';
import { vehicleService } from '../../services/vehicle.service';

const MONTH_NAMES_TH = [
  'มกราคม',
  'กุมภาพันธ์',
  'มีนาคม',
  'เมษายน',
  'พฤษภาคม',
  'มิถุนายน',
  'กรกฎาคม',
  'สิงหาคม',
  'กันยายน',
  'ตุลาคม',
  'พฤศจิกายน',
  'ธันวาคม',
];

const fmt = (n: number | null | undefined): string =>
  n == null || n === 0 ? '' : n.toLocaleString('th-TH', { minimumFractionDigits: 2 });

const fmtDate = (iso: string | null): string => (iso ? iso.split('T')[0] : '');

export function CampaignClaimReportPage(): React.ReactElement {
  const { addToast } = useToast();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [brand, setBrand] = useState('');

  // Distinct brands from vehicle models.
  const { data: vehiclePage } = useQuery({
    queryKey: ['vehicle-models-for-brands'],
    queryFn: () => vehicleService.getAll({ limit: 200 }),
  });
  const brands = useMemo(() => {
    const list = vehiclePage?.data?.map((v) => v.brand) ?? [];
    return [...new Set(list)].sort();
  }, [vehiclePage]);
  // Default to first brand once loaded.
  if (!brand && brands.length > 0) setBrand(brands[0]);

  const { data, isLoading, error } = useQuery({
    queryKey: ['campaign-claims', year, month, brand],
    queryFn: () => reportService.getCampaignClaimReport({ year, month, brand }),
    enabled: !!brand,
  });

  const handleExportExcel = () => {
    if (!data) return;
    const toRow = (r: CampaignClaimRow) => {
      const base: Record<string, unknown> = {
        ลำดับ: r.no,
        'ชื่อ - สกุล': r.customerName,
        แบบรถ: r.modelName,
        เลขเครื่อง: r.engineNumber,
        เลขตัวรถ: r.vin,
        ไฟแนนท์: r.financeProvider,
        วันที่ขาย: fmtDate(r.saleDate),
        แคมเปญ: r.campaignName,
        ส่วนลดโปรโมชั่น: r.promotionDiscount,
        'วันที่รับเงิน (ส่วนลด)': '',
        คอมมิชชั่นพื้นฐาน: r.baseCommission,
        'วันที่รับเงิน (คอมมิชชั่น)': '',
      };
      data.modelColumns.forEach((c, i) => {
        base[`STANDARD ${c.label}`] = r.modelAmounts[i] ?? '';
      });
      data.modelColumns.forEach((c) => {
        base[`เป้าขาย ${c.label}`] = '';
      });
      base['รวมรับเงิน'] = r.claimTotal;
      base['วันที่แจ้งขาย'] = fmtDate(r.notifyDate);
      base['ค่าใช้จ่ายในการซื้อ/แลกรถ'] = '';
      return base;
    };
    try {
      exportMultiSheet({
        sheets: [{ name: 'เบิกแคมเปญ', data: data.rows.map(toRow) }],
        filename: `campaign-claims_${brand}_${year}-${String(month).padStart(2, '0')}`,
      });
      addToast('ดาวน์โหลด Excel สำเร็จ', 'success');
    } catch {
      addToast('ดาวน์โหลด Excel ไม่สำเร็จ', 'error');
    }
  };

  const handleDownloadPdf = async () => {
    try {
      const blob = await reportService.getCampaignClaimReportPdf({ year, month, brand });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `campaign-claims-${brand}-${year}-${String(month).padStart(2, '0')}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      addToast('ดาวน์โหลด PDF สำเร็จ', 'success');
    } catch {
      addToast('ดาวน์โหลด PDF ไม่สำเร็จ', 'error');
    }
  };

  return (
    <MainLayout>
      <div className="p-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">
            รายงานเบิกแคมเปญเงินส่งเสริมการขายประจำเดือน
          </h1>
          <p className="text-gray-600 mt-1">รายการเบิกเงินส่งเสริมการขายสำหรับส่งบริษัทรถ (Brand)</p>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-6 print-hide">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium">ปี:</label>
              <input
                type="number"
                value={year}
                onChange={(e) => setYear(Number(e.target.value))}
                className="border border-gray-300 rounded-md px-3 py-1.5 text-sm w-24"
                min={2000}
                max={3000}
              />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium">เดือน:</label>
              <select
                value={month}
                onChange={(e) => setMonth(Number(e.target.value))}
                className="border border-gray-300 rounded-md px-3 py-1.5 text-sm"
              >
                {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                  <option key={m} value={m}>
                    {MONTH_NAMES_TH[m - 1]}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium">ยี่ห้อ:</label>
              <select
                value={brand}
                onChange={(e) => setBrand(e.target.value)}
                className="border border-gray-300 rounded-md px-3 py-1.5 text-sm"
              >
                {brands.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="button"
              onClick={handleExportExcel}
              className="bg-green-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-green-700"
            >
              ดาวน์โหลด Excel
            </button>
            <button
              type="button"
              onClick={handleDownloadPdf}
              className="bg-red-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-red-700"
            >
              ดาวน์โหลด PDF
            </button>
          </div>
        </div>

        {isLoading && <div className="p-6 animate-pulse">กำลังโหลด...</div>}
        {error != null && <div className="p-6 text-red-600">ไม่สามารถโหลดรายงานได้</div>}

        {data && (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
              <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
                <p className="text-sm text-blue-600 font-medium">จำนวนรถ</p>
                <p className="text-2xl font-bold text-blue-900">{data.summary.totalCars}</p>
              </div>
              <div className="bg-amber-50 rounded-lg p-4 border border-amber-200">
                <p className="text-sm text-amber-600 font-medium">รวมรับเงินทั้งเดือน (บาท)</p>
                <p className="text-2xl font-bold text-amber-900">
                  {data.summary.grandTotal.toLocaleString()}
                </p>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-gray-50">
                  <tr>
                    {[
                      'ลำดับ',
                      'ชื่อ-สกุล',
                      'แบบรถ',
                      'เลขเครื่อง',
                      'เลขตัวรถ',
                      'ไฟแนนท์',
                      'วันที่ขาย',
                      'แคมเปญ',
                      'ส่วนลดโปรโมชั่น',
                      'คอมมิชชั่นพื้นฐาน',
                      ...data.modelColumns.map((c) => `STANDARD ${c.label}`),
                      'รวมรับเงิน',
                      'วันที่แจ้งขาย',
                    ].map((h) => (
                      <th key={h} className="px-2 py-2 text-left font-medium whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {data.rows.map((r) => (
                    <tr key={r.saleId} className="hover:bg-gray-50">
                      <td className="px-2 py-1">{r.no}</td>
                      <td className="px-2 py-1">{r.customerName}</td>
                      <td className="px-2 py-1">{r.modelName}</td>
                      <td className="px-2 py-1 font-mono">{r.engineNumber}</td>
                      <td className="px-2 py-1 font-mono">{r.vin}</td>
                      <td className="px-2 py-1">{r.financeProvider}</td>
                      <td className="px-2 py-1">{fmtDate(r.saleDate)}</td>
                      <td className="px-2 py-1">{r.campaignName}</td>
                      <td className="px-2 py-1 text-right">{fmt(r.promotionDiscount)}</td>
                      <td className="px-2 py-1 text-right">{fmt(r.baseCommission)}</td>
                      {data.modelColumns.map((c, i) => (
                        <td key={c.vehicleModelId} className="px-2 py-1 text-right">
                          {fmt(r.modelAmounts[i])}
                        </td>
                      ))}
                      <td className="px-2 py-1 text-right font-semibold">{fmt(r.claimTotal)}</td>
                      <td className="px-2 py-1">{fmtDate(r.notifyDate)}</td>
                    </tr>
                  ))}
                  {data.rows.length === 0 && (
                    <tr>
                      <td
                        colSpan={12 + data.modelColumns.length}
                        className="px-2 py-6 text-center text-gray-500"
                      >
                        ไม่มีรายการเบิกแคมเปญในเดือนนี้
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </MainLayout>
  );
}
```

Fix before commit: the `if (!brand && brands.length > 0) setBrand(brands[0]);` line calls setState during render — replace with an effect:

```tsx
  useEffect(() => {
    if (!brand && brands.length > 0) setBrand(brands[0]);
  }, [brand, brands]);
```

(add `useEffect` to the react import). Verify `vehicleService.getAll` filter/response shape against `apps/web/src/services/vehicle.service.ts:86` — adjust `vehiclePage?.data` access to the actual `PaginatedResponse` shape used there.

- [ ] **Step 2: Export from `apps/web/src/pages/reports/index.ts`**

```typescript
export { CampaignClaimReportPage } from './CampaignClaimReportPage';
```

- [ ] **Step 3: Add route in `apps/web/src/App.tsx`**

Lazy import next to other report pages (follow the existing pattern near line 62):

```tsx
const CampaignClaimReportPage = React.lazy(() =>
  import('./pages/reports').then((m) => ({ default: m.CampaignClaimReportPage }))
);
```

Route after `/reports/monthly-purchases` (line ~524), using the same permission constant as campaign pages (`P.CAMPAIGN_VIEW`):

```tsx
                    <Route
                      path="/reports/campaign-claims"
                      element={
                        <ProtectedRoute allowedRoles={P.CAMPAIGN_VIEW}>
                          <CampaignClaimReportPage />
                        </ProtectedRoute>
                      }
                    />
```

- [ ] **Step 4: Add menu card on `ReportsPage.tsx`**

Open `apps/web/src/pages/reports/ReportsPage.tsx`, find the list/grid of report links (each report has an entry with title + path). Add an entry following the exact same shape as the others:

- title: `รายงานเบิกแคมเปญ (ส่ง Brand)`
- description: `รายงานเบิกเงินส่งเสริมการขายประจำเดือน แยกตามยี่ห้อ`
- path: `/reports/campaign-claims`

- [ ] **Step 5: Verify in browser**

Run `bun run dev`, log in as `admin/admin123`, navigate to `/reports/campaign-claims`. Pick a month/brand with seeded campaign sales. Confirm: table renders, Excel downloads and opens, PDF downloads in the 2-row brand layout.

- [ ] **Step 6: Typecheck, lint, commit**

```bash
bun run typecheck && bun run lint
git add apps/web/src/pages/reports/CampaignClaimReportPage.tsx apps/web/src/pages/reports/index.ts apps/web/src/App.tsx apps/web/src/pages/reports/ReportsPage.tsx
git commit -m "feat(web): monthly campaign claim report page with PDF and Excel export"
```

---

### Task 7: Visual PDF verification

**Files:** none (verification only)

- [ ] **Step 1: Generate a sample PDF and screenshot it**

With dev API running and seeded data:

```bash
TOKEN=$(curl -s -X POST http://localhost:3001/api/auth/login -H 'Content-Type: application/json' -d '{"username":"admin","password":"admin123"}' | python3 -c 'import sys,json; print(json.load(sys.stdin)["data"]["token"])')
curl -s -o /tmp/campaign-claim-sample.pdf "http://localhost:3001/api/pdf/campaign-claims?year=2026&month=5&brand=NETA" -H "Authorization: Bearer $TOKEN"
```

Open `/tmp/campaign-claim-sample.pdf` (Read tool reads PDFs) and verify against the reference CSV (`/Users/marwinropmuang/Downloads/ตัวอย่างหนังสือและรายงาน.xlsx - แคมเปญ.csv`):

- Title row: "รายงานเบิกแคมเปญเงินส่งเสริมการขายประจำเดือน {เดือน พ.ศ.}"
- Two physical rows per sale; lower row holds แบบรถ / เลขตัวรถ / วันที่ขาย / วันที่แจ้งขาย
- Blank fill-in cells: วันที่รับเงิน ×2, เป้าขาย columns, ค่าใช้จ่ายซื้อ/แลกรถ
- Model columns present for each model sold; totals row at bottom; landscape A4; no overflow

- [ ] **Step 2: Fix layout issues if any, re-generate, then final commit if files changed**

```bash
bun run lint && git add -A apps/api/src/modules/pdf/templates/ && git commit -m "fix(api): campaign claim PDF layout polish" # only if changes were needed
```

---

## Self-Review (done at planning time)

- **Spec coverage:** monthly+brand scope (Task 2 query + filter), blank manual columns (Task 3 template, Task 6 Excel), PDF+Excel (Tasks 3/4/6), new page leaving existing report untouched (no existing files removed), permissions CAMPAIGN_VIEW (Tasks 4/6), edge cases — empty month (template `{{else}}`, page empty row), sale without stock (Task 1 test + OR query in Task 2), many models (9px font). Sub-totals per model + grand total (Tasks 1/3).
- **Type consistency:** `ClaimRow`/`ClaimSaleInput` (Task 1) ↔ `CampaignClaimReportData.rows` (Task 3, dates as ISO strings — converted in the PDF route, Task 4) ↔ web `CampaignClaimRow` (Task 5, dates as strings from JSON). `modelColumns: {vehicleModelId, label}` everywhere; PDF data only needs `label` (extra field harmless).
- **Placeholders:** none — every step has full code or an exact command with expected output.
