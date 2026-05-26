/**
 * E2E Business Scenario Test
 *
 * Tests a complete real-world dealership workflow:
 *   1.  Auth              – login with admin credentials
 *   2.  Vehicles          – pick an existing model
 *   3.  Stock             – add a new vehicle to stock
 *   4.  Interest          – init period, verify accumulation, update rate, stop
 *   5.  Debt              – init debt, record partial payment, verify balance
 *   6.  Campaign          – create → add model → add formula → activate
 *   7.  Customer          – create a new buyer
 *   8.  Sale              – DIRECT_SALE linked to the new stock + campaign
 *   9.  Status flow       – RESERVED → PREPARING → DELIVERED → COMPLETED
 *  10.  Payments          – DEPOSIT then full payment
 *  11.  Reports           – daily-payments, daily-stock-snapshot, monthly-purchases
 *  12.  Campaign report   – verify sold stock appears in report
 *  13.  Analytics         – dashboard sanity check
 *
 * NOTE: Runs against the LOCAL DEV server (port 3099, `bun run dev` in apps/api).
 *       The Docker container (port 3040) has a known stale build issue for
 *       /reports/daily-stock-snapshot and /reports/monthly-purchases.
 *       Rebuild the Docker image with `make up-build` to resolve.
 *
 * Run: bun test src/__tests__/e2e-business-scenario.test.ts
 */

import { describe, it, expect } from 'bun:test';

// ─────────────────────────────────────────────────────────────────────────────
// Config
// ─────────────────────────────────────────────────────────────────────────────

// Local dev server must be running: PORT=3099 bun run dev
const BASE = 'http://localhost:3099/api';

const ADMIN_CREDS = { username: 'admin', password: 'admin123' };

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

async function api(
  path: string,
  options: { method?: string; body?: unknown; token?: string } = {}
) {
  const res = await fetch(`${BASE}${path}`, {
    method: options.method ?? 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  let json: any;
  try {
    json = await res.json();
  } catch {
    json = { success: res.ok, _parseError: true, _rawStatus: res.status };
  }
  return { status: res.status, body: json };
}

/** Returns YYYY-MM-DD string relative to today */
function isoDate(daysFromNow = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  return d.toISOString().split('T')[0];
}

// Unique suffix so re-runs don't collide with seed data
const SUFFIX = Date.now().toString().slice(-6);

// ─────────────────────────────────────────────────────────────────────────────
// Shared state – populated as tests run
// ─────────────────────────────────────────────────────────────────────────────

const ctx: {
  token: string;
  vehicleModelId: string;
  stockId: string;
  stockVin: string;
  campaignId: string;
  formulaId: string;
  customerId: string;
  saleId: string;
  depositPaymentId: string;
  fullPaymentId: string;
} = {} as any;

// ─────────────────────────────────────────────────────────────────────────────
// 1. Auth
// ─────────────────────────────────────────────────────────────────────────────

describe('1. Auth – Admin login', () => {
  it('should log in and receive a JWT token', async () => {
    const { status, body } = await api('/auth/login', {
      method: 'POST',
      body: ADMIN_CREDS,
    });

    expect(status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data?.token).toBeTypeOf('string');

    ctx.token = body.data.token;
    console.log('  ✓ Logged in as admin');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Vehicles – pick an existing model
// ─────────────────────────────────────────────────────────────────────────────

describe('2. Vehicles – pick existing model', () => {
  it('should list vehicle models and select the first one', async () => {
    const { status, body } = await api('/vehicles?limit=1', { token: ctx.token });

    expect(status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data?.length).toBeGreaterThan(0);

    ctx.vehicleModelId = body.data[0].id;
    const modelName = [body.data[0].brand, body.data[0].model, body.data[0].variant]
      .filter(Boolean)
      .join(' ');
    console.log(`  ✓ Using vehicle model: ${modelName} (${ctx.vehicleModelId})`);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Stock – add a new vehicle
// ─────────────────────────────────────────────────────────────────────────────

describe('3. Stock – add new vehicle to inventory', () => {
  it('should create a new stock entry', async () => {
    ctx.stockVin = `E2ETEST${SUFFIX}`;

    const { status, body } = await api('/stock', {
      method: 'POST',
      token: ctx.token,
      body: {
        vin: ctx.stockVin,
        vehicleModelId: ctx.vehicleModelId,
        exteriorColor: 'ขาวมุก',
        interiorColor: 'ดำ',
        baseCost: 800000,
        transportCost: 20000,
        accessoryCost: 15000,
        otherCosts: 5000,
        interestRate: 0,
        interestPrincipalBase: 'TOTAL_COST',
        arrivalDate: isoDate(-5),
        financeProvider: 'ธนาคารกรุงไทย',
        notes: `E2E test stock – suffix ${SUFFIX}`,
      },
    });

    expect(status).toBe(201);
    expect(body.success).toBe(true);
    expect(body.data?.id).toBeTypeOf('string');

    ctx.stockId = body.data.id;
    console.log(`  ✓ Stock created: ${ctx.stockId} (VIN: ${ctx.stockVin})`);
  });

  it('should appear in the stock list', async () => {
    const { status, body } = await api(`/stock?search=${ctx.stockVin}`, { token: ctx.token });

    expect(status).toBe(200);
    expect(body.data?.length).toBeGreaterThan(0);
    expect(body.data[0].id).toBe(ctx.stockId);
    console.log('  ✓ Stock visible in list');
  });

  it('should return stock stats with at least 1 available item', async () => {
    const { status, body } = await api('/stock/stats', { token: ctx.token });

    expect(status).toBe(200);
    // Actual field is `totalStock`, not `total`
    expect(body.data?.totalStock).toBeGreaterThanOrEqual(1);
    console.log(
      `  ✓ Stock stats – total: ${body.data.totalStock}, available: ${body.data.availableStock}`
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. Interest – full lifecycle
// ─────────────────────────────────────────────────────────────────────────────

describe('4. Interest – full lifecycle', () => {
  it('should initialize interest period at 7.5% annual on TOTAL_COST', async () => {
    const { status, body } = await api(`/interest/${ctx.stockId}/initialize`, {
      method: 'POST',
      token: ctx.token,
      body: {
        annualRate: 7.5,
        principalBase: 'TOTAL_COST',
        startDate: isoDate(-30),
        notes: `E2E init – ${SUFFIX}`,
      },
    });

    expect(status).toBe(201);
    expect(body.success).toBe(true);
    console.log('  ✓ Interest initialized at 7.5% / year (TOTAL_COST basis)');
  });

  it('should return interest detail with positive accumulated interest', async () => {
    const { status, body } = await api(`/interest/${ctx.stockId}`, { token: ctx.token });

    expect(status).toBe(200);
    expect(body.success).toBe(true);

    // Response shape: { stock, summary: { totalAccumulatedInterest, ... }, periods }
    const accInterest = Number(body.data?.summary?.totalAccumulatedInterest ?? 0);
    // 840,000 × 7.5% / 365 × 30 days ≈ 5,178 – verify it's positive
    expect(accInterest).toBeGreaterThan(0);
    console.log(`  ✓ Accumulated interest after 30 days: ฿${accInterest.toLocaleString('th-TH')}`);
  });

  it('should update interest rate to 8% (creates new period)', async () => {
    const { status, body } = await api(`/interest/${ctx.stockId}`, {
      method: 'PUT',
      token: ctx.token,
      body: {
        annualRate: 8.0,
        principalBase: 'TOTAL_COST',
        notes: 'Rate increase E2E test',
      },
    });

    expect(status).toBe(200);
    expect(body.success).toBe(true);
    console.log('  ✓ Interest rate updated to 8% (new period created)');
  });

  it('should return interest stats with at least one tracked stock', async () => {
    const { status, body } = await api('/interest/stats', { token: ctx.token });

    expect(status).toBe(200);
    // Actual field is `totalStocksWithInterest`, not `totalStocks`
    expect(body.data?.totalStocksWithInterest).toBeGreaterThan(0);
    console.log(
      `  ✓ Interest stats – tracking ${body.data.totalStocksWithInterest} stock(s), ` +
        `active: ${body.data.activeCalculations}`
    );
  });

  it('should stop interest calculation', async () => {
    const { status, body } = await api(`/interest/${ctx.stockId}/stop`, {
      method: 'POST',
      token: ctx.token,
      body: { notes: 'Stopped for E2E test – will be sold' },
    });

    expect(status).toBe(200);
    expect(body.success).toBe(true);
    console.log('  ✓ Interest calculation stopped');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. Debt – init → partial payment → verify remaining balance
// ─────────────────────────────────────────────────────────────────────────────

describe('5. Debt – lifecycle (init → pay → verify)', () => {
  it('should initialize debt of ฿800,000 for the stock', async () => {
    const { status, body } = await api(`/interest/${ctx.stockId}/debt/initialize`, {
      method: 'POST',
      token: ctx.token,
      body: { debtAmount: 800000 },
    });

    expect(status).toBe(201);
    expect(body.success).toBe(true);
    console.log('  ✓ Debt initialized: ฿800,000');
  });

  it('should record a partial debt payment of ฿200,000 (AUTO allocation)', async () => {
    const { status, body } = await api(`/interest/${ctx.stockId}/debt/payment`, {
      method: 'POST',
      token: ctx.token,
      body: {
        amount: 200000,
        paymentMethod: 'BANK_TRANSFER',
        paymentType: 'AUTO',
        paymentDate: isoDate(),
        referenceNumber: `E2E-DEBT-${SUFFIX}`,
        notes: 'Partial debt payment E2E test',
      },
    });

    expect(status).toBe(201);
    expect(body.success).toBe(true);
    // Only 200k of 800k paid → debt not yet fully paid off
    expect(body.data?.debtPaidOff).toBe(false);
    console.log('  ✓ Partial payment recorded – debt NOT yet paid off');
  });

  it('should return updated debt summary with reduced remaining balance', async () => {
    const { status, body } = await api(`/interest/${ctx.stockId}/debt/summary`, {
      token: ctx.token,
    });

    expect(status).toBe(200);
    const remaining = Number(body.data?.remainingDebt ?? body.data?.remaining ?? 800000);
    expect(remaining).toBeLessThan(800000);
    console.log(`  ✓ Remaining debt: ฿${remaining.toLocaleString('th-TH')}`);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. Campaign – create, configure, activate
// ─────────────────────────────────────────────────────────────────────────────

describe('6. Campaign – create with formula', () => {
  it('should create a new campaign with our vehicle model', async () => {
    const { status, body } = await api('/campaigns', {
      method: 'POST',
      token: ctx.token,
      body: {
        name: `โปรโมชัน E2E Test ${SUFFIX}`,
        description: 'Campaign สำหรับทดสอบ E2E',
        startDate: isoDate(-7),
        endDate: isoDate(30),
        notes: `E2E campaign – ${SUFFIX}`,
        vehicleModelIds: [ctx.vehicleModelId],
      },
    });

    expect(status).toBe(201);
    expect(body.success).toBe(true);
    ctx.campaignId = body.data.id;
    console.log(`  ✓ Campaign created: ${body.data.name} (${ctx.campaignId})`);
  });

  it('should activate the campaign', async () => {
    const { status, body } = await api(`/campaigns/${ctx.campaignId}`, {
      method: 'PUT',
      token: ctx.token,
      body: { status: 'ACTIVE' },
    });

    expect(status).toBe(200);
    expect(body.data?.status).toBe('ACTIVE');
    console.log('  ✓ Campaign status → ACTIVE');
  });

  it('should add a PERCENT formula (ลดราคา 5% จาก SELLING_PRICE)', async () => {
    const { status, body } = await api(
      `/campaigns/${ctx.campaignId}/vehicle-models/${ctx.vehicleModelId}/formulas`,
      {
        method: 'POST',
        token: ctx.token,
        body: {
          name: 'ส่วนลดพิเศษ 5%',
          operator: 'PERCENT',
          value: 5,
          priceTarget: 'SELLING_PRICE',
          sortOrder: 1,
        },
      }
    );

    expect(status).toBe(201);
    expect(body.success).toBe(true);
    ctx.formulaId = body.data.id;
    console.log(`  ✓ Formula created: ${body.data.name} (${ctx.formulaId})`);
  });

  it('should retrieve formulas for the vehicle model in campaign', async () => {
    const { status, body } = await api(
      `/campaigns/${ctx.campaignId}/vehicle-models/${ctx.vehicleModelId}/formulas`,
      { token: ctx.token }
    );

    expect(status).toBe(200);
    expect(body.data?.length).toBeGreaterThanOrEqual(1);
    expect(body.data[0].operator).toBe('PERCENT');
    console.log(`  ✓ ${body.data.length} formula(s) confirmed`);
  });

  it('should appear in the active campaigns list', async () => {
    const { status, body } = await api('/campaigns/active', { token: ctx.token });

    expect(status).toBe(200);
    const found = body.data?.some((c: any) => c.id === ctx.campaignId);
    expect(found).toBe(true);
    console.log('  ✓ Campaign appears in active list');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 7. Customer – create buyer
// ─────────────────────────────────────────────────────────────────────────────

describe('7. Customer – create buyer', () => {
  it('should create an individual customer with Thai address structure', async () => {
    const { status, body } = await api('/customers', {
      method: 'POST',
      token: ctx.token,
      body: {
        type: 'INDIVIDUAL',
        salesType: 'NORMAL_SALES',
        name: `สมชาย ทดสอบ${SUFFIX}`,
        houseNumber: '123',
        street: 'ถนนทดสอบ',
        subdistrict: 'ในเมือง',
        district: 'เมือง',
        province: 'กรุงเทพมหานคร',
        postalCode: '10200',
        phone: `08${SUFFIX}`,
      },
    });

    expect(status).toBe(201);
    expect(body.success).toBe(true);
    ctx.customerId = body.data.id;
    console.log(`  ✓ Customer created: ${body.data.name} (${ctx.customerId})`);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 8. Sale – DIRECT_SALE linked to stock + campaign
// ─────────────────────────────────────────────────────────────────────────────

describe('8. Sale – direct sale creation', () => {
  it('should create a DIRECT_SALE with campaign discount', async () => {
    const { status, body } = await api('/sales', {
      method: 'POST',
      token: ctx.token,
      body: {
        type: 'DIRECT_SALE',
        customerId: ctx.customerId,
        stockId: ctx.stockId,
        totalAmount: 950000,
        depositAmount: 50000,
        paymentMode: 'CASH',
        campaignId: ctx.campaignId,
        discountSnapshot: 47500,
        notes: `E2E direct sale – ${SUFFIX}`,
      },
    });

    expect(status).toBe(201);
    expect(body.success).toBe(true);
    ctx.saleId = body.data.id;
    console.log(`  ✓ Sale created: ${body.data.saleNumber} (${ctx.saleId})`);
  });

  it('should fetch the sale and confirm campaignId and stockId are linked', async () => {
    const { status, body } = await api(`/sales/${ctx.saleId}`, { token: ctx.token });

    expect(status).toBe(200);
    expect(body.data?.campaignId).toBe(ctx.campaignId);
    expect(body.data?.stockId).toBe(ctx.stockId);
    console.log('  ✓ Sale correctly linked to campaign and stock');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 9. Sale status flow: RESERVED → PREPARING → DELIVERED → COMPLETED
// ─────────────────────────────────────────────────────────────────────────────

describe('9. Sale status flow (RESERVED → PREPARING → DELIVERED)', () => {
  it('stock should be RESERVED immediately after sale creation', async () => {
    const { status, body } = await api(`/stock/${ctx.stockId}`, { token: ctx.token });

    expect(status).toBe(200);
    expect(body.data?.status).toBe('RESERVED');
    console.log('  ✓ Stock status: RESERVED');
  });

  it('should transition sale to PREPARING', async () => {
    const { status, body } = await api(`/sales/${ctx.saleId}/status`, {
      method: 'PATCH',
      token: ctx.token,
      body: { status: 'PREPARING', notes: 'เตรียมรถสำหรับส่งมอบ' },
    });

    expect(status).toBe(200);
    expect(body.data?.status).toBe('PREPARING');
    console.log('  ✓ Sale → PREPARING');
  });

  it('should transition sale to DELIVERED', async () => {
    const { status, body } = await api(`/sales/${ctx.saleId}/status`, {
      method: 'PATCH',
      token: ctx.token,
      body: { status: 'DELIVERED', notes: 'ส่งมอบรถแล้ว' },
    });

    expect(status).toBe(200);
    expect(body.data?.status).toBe('DELIVERED');
    console.log('  ✓ Sale → DELIVERED');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 10. Payments – deposit + full payment
// ─────────────────────────────────────────────────────────────────────────────

describe('10. Payments – deposit & full payment', () => {
  it('should record a DEPOSIT of ฿50,000', async () => {
    const { status, body } = await api('/payments', {
      method: 'POST',
      token: ctx.token,
      body: {
        saleId: ctx.saleId,
        customerId: ctx.customerId,
        paymentType: 'DEPOSIT',
        amount: 50000,
        paymentMethod: 'CASH',
        description: 'มัดจำ E2E',
        notes: `E2E deposit – ${SUFFIX}`,
      },
    });

    expect(status).toBe(201);
    expect(body.success).toBe(true);
    ctx.depositPaymentId = body.data.id;
    console.log(`  ✓ Deposit recorded: ฿50,000 (${ctx.depositPaymentId})`);
  });

  it('should record full payment of ฿900,000 via bank transfer', async () => {
    const { status, body } = await api('/payments', {
      method: 'POST',
      token: ctx.token,
      body: {
        saleId: ctx.saleId,
        customerId: ctx.customerId,
        paymentType: 'DOWN_PAYMENT',
        amount: 900000,
        paymentMethod: 'BANK_TRANSFER',
        referenceNumber: `TRF-E2E-${SUFFIX}`,
        description: 'ชำระเต็มจำนวน E2E',
      },
    });

    expect(status).toBe(201);
    expect(body.success).toBe(true);
    ctx.fullPaymentId = body.data.id;
    console.log(`  ✓ Full payment recorded: ฿900,000 (${ctx.fullPaymentId})`);
  });

  it('should list payments for this sale and find both records', async () => {
    const { status, body } = await api(`/payments?saleId=${ctx.saleId}`, { token: ctx.token });

    expect(status).toBe(200);
    expect(body.data?.length).toBeGreaterThanOrEqual(2);
    console.log(`  ✓ ${body.data.length} payment(s) linked to sale`);
  });

  it('payment stats should include our transactions', async () => {
    const { status, body } = await api('/payments/stats', { token: ctx.token });

    expect(status).toBe(200);
    // Actual field is `totalPayments`, not `total`
    expect(body.data?.totalPayments).toBeGreaterThan(0);
    console.log(`  ✓ Payment stats – total: ${body.data.totalPayments} transactions`);
  });

  // Full payment recorded → remainingAmount should now be 0 → COMPLETED is allowed
  it('should transition sale to COMPLETED after full payment', async () => {
    const { status, body } = await api(`/sales/${ctx.saleId}/status`, {
      method: 'PATCH',
      token: ctx.token,
      body: { status: 'COMPLETED', notes: 'ปิดการขายแล้ว' },
    });

    expect(status).toBe(200);
    expect(body.data?.status).toBe('COMPLETED');
    console.log('  ✓ Sale → COMPLETED');
  });

  it('stock should now be SOLD', async () => {
    const { status, body } = await api(`/stock/${ctx.stockId}`, { token: ctx.token });

    expect(status).toBe(200);
    expect(body.data?.status).toBe('SOLD');
    console.log('  ✓ Stock status: SOLD ✓');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 11. Reports – daily-payments, daily-stock-snapshot, monthly-purchases
// ─────────────────────────────────────────────────────────────────────────────

describe('11. Reports – daily payments, snapshot, monthly purchases', () => {
  const today = isoDate();

  it('should return daily payment report for today', async () => {
    const { status, body } = await api(
      `/reports/daily-payments?startDate=${today}&endDate=${today}`,
      { token: ctx.token }
    );

    expect(status).toBe(200);
    expect(body.success).toBe(true);
    // Should have at least our two payments
    const hasActivity =
      (body.data?.payments?.length ?? 0) > 0 || body.data?.summary != null;
    expect(hasActivity).toBe(true);
    console.log('  ✓ Daily payment report returned with data');
  });

  it('should return daily stock snapshot for today', async () => {
    const { status, body } = await api(`/reports/daily-stock-snapshot?date=${today}`, {
      token: ctx.token,
    });

    expect(status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data?.date).toBe(today);
    expect(Array.isArray(body.data?.models)).toBe(true);
    console.log(
      `  ✓ Daily stock snapshot: ${body.data.models.length} model(s), ` +
        `${body.data.grand.available} available`
    );
  });

  it('should return monthly purchases report for current month', async () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;

    const { status, body } = await api(
      `/reports/monthly-purchases?year=${year}&month=${month}`,
      { token: ctx.token }
    );

    expect(status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data?.period?.year).toBe(year);
    expect(body.data?.period?.month).toBe(month);
    expect(Array.isArray(body.data?.items)).toBe(true);
    console.log(
      `  ✓ Monthly purchases (${month}/${year}): ${body.data.summary.totalVehicles} vehicle(s)`
    );
  });

  it('should return sales summary report for current month', async () => {
    const now = new Date();
    const startDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;

    const { status, body } = await api(
      `/reports/sales-summary?startDate=${startDate}&endDate=${today}`,
      { token: ctx.token }
    );

    expect(status).toBe(200);
    expect(body.success).toBe(true);
    console.log('  ✓ Sales summary report returned');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 12. Campaign report – verify report returns and includes our vehicle model
// ─────────────────────────────────────────────────────────────────────────────

describe('12. Campaign report – formula calculations', () => {
  it('should return campaign report for our campaign', async () => {
    const { status, body } = await api(`/campaigns/${ctx.campaignId}/report`, {
      token: ctx.token,
    });

    expect(status).toBe(200);
    expect(body.success).toBe(true);

    const data = body.data;
    console.log(`  ✓ Campaign: ${data?.campaign?.name ?? ctx.campaignId}`);
    // Actual field: data.summary.totalSales (not totalSoldCount/totalSold)
    const totalSales = data?.summary?.totalSales ?? 0;
    expect(totalSales).toBeGreaterThanOrEqual(1);
    console.log(`  ✓ Sales in campaign: ${totalSales} (amount: ฿${(data?.summary?.totalAmount ?? 0).toLocaleString('th-TH')})`);
  });

  it('should return campaign analytics', async () => {
    const { status, body } = await api(
      `/campaigns/${ctx.campaignId}/analytics?startDate=${isoDate(-30)}&endDate=${isoDate()}`,
      { token: ctx.token }
    );

    expect(status).toBe(200);
    expect(body.success).toBe(true);
    console.log('  ✓ Campaign analytics returned');
  });

  it('should confirm vehicle model is associated with campaign', async () => {
    const { status, body } = await api(
      `/campaigns/${ctx.campaignId}/vehicle-models`,
      { token: ctx.token }
    );

    expect(status).toBe(200);
    const found = body.data?.some(
      (m: any) => m.vehicleModelId === ctx.vehicleModelId || m.id === ctx.vehicleModelId
    );
    expect(found).toBe(true);
    console.log(`  ✓ Vehicle model ${ctx.vehicleModelId} confirmed in campaign`);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 13. Analytics – dashboard sanity check
// ─────────────────────────────────────────────────────────────────────────────

describe('13. Analytics – dashboard sanity check', () => {
  it('should return analytics dashboard stats', async () => {
    const { status, body } = await api('/analytics/dashboard', { token: ctx.token });

    expect(status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toBeDefined();
    console.log('  ✓ Analytics dashboard returned');
  });
});
