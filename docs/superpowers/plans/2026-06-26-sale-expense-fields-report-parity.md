# Sale Expense Fields → Report Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the sale expense/commission/insurance fields reach the Excel export of the sales-summary report, at full column parity with the existing PDF, driven by one canonical column definition.

**Architecture:** The backend already returns a rich per-sale object and the PDF already renders every field; only the shared TypeScript type and the web Excel mapping lag behind. We (1) type the financial fields the API already sends, (2) define one canonical per-sale column descriptor in the web app, and (3) make the Excel export build its rows from that descriptor. The PDF (`sales-summary-report.hbs`) is the reference and is not changed.

**Tech Stack:** TypeScript, React 19 (Vite), `@car-stock/shared` workspace package, `xlsx` (SheetJS) via `exportMultiSheet`, Bun test runner, Biome formatting.

**Spec:** `docs/superpowers/specs/2026-06-26-sale-expense-fields-report-parity-design.md`

## Global Constraints

- **Biome formatting:** single quotes, semicolons, 2-space indent, 100-char width.
- **Thai labels are exact** — copy header strings verbatim from the descriptor; they double as Excel column headers and must match the PDF's intent.
- **Money cells stay numeric** in Excel rows (raw `number`, not pre-formatted strings) so the customer can sum them; only `วันที่ขาย` is a formatted string.
- **Import `formatDate` from the leaf** `../../components/reports/reportUtils`, never the `../../components/reports` barrel (the barrel re-exports recharts-backed components).
- **No backend or PDF change** — `getSalesSummaryReport` and `sales-summary-report.hbs` already emit/render everything.
- **New type fields are additive and optional** (`?`); accessors default with `?? 0`.

---

### Task 1: Type the financial fields the API already returns

**Files:**
- Modify: `packages/shared/src/types/reports.ts` (the `SalesSummaryItem` interface, currently ending at the line after `priceGross?: number;`)

**Interfaces:**
- Consumes: nothing.
- Produces: `SalesSummaryItem` now exposes `discountAmount?`, `campaignSubsidy?`, `netCarDiscount?`, `downPayment?`, `downPaymentDiscount?`, `financeAmount?`, `financeReturn?`, `interestCost?`, `transportFee?`, `totalCost?`, `campaignName?`, `salesCommission?`, `salesExpense?`, `insurancePremium?`, `netProfit?` — all `number` except `campaignName: string`. These names are consumed by Task 2.

- [ ] **Step 1: Add the fields to the interface**

In `packages/shared/src/types/reports.ts`, inside `export interface SalesSummaryItem { ... }`, immediately after the existing `priceGross?: number;` line, add:

```ts
  // Money breakdown — always returned by getSalesSummaryReport (reports.service.ts),
  // previously untyped on the web. Mirrors the server PDF columns (sales-summary-report.hbs).
  discountAmount?: number; // ส่วนลดตัวรถ
  campaignSubsidy?: number; // เงินสนับสนุน (brand rebate)
  netCarDiscount?: number; // ส่วนลดตัวรถ สุทธิ (discount − subsidy)
  downPayment?: number; // เงินดาวน์
  downPaymentDiscount?: number; // ส่วนลดดาวน์
  financeAmount?: number; // ยอดจัด
  financeReturn?: number; // ค่าคอมไฟแนนซ์ (= sale.financeCommission)
  interestCost?: number; // ดอกเบี้ย
  transportFee?: number; // ทะเบียน/พรบ/ขนส่ง (registrationFee + compulsoryInsuranceFee)
  totalCost?: number; // ต้นทุน
  campaignName?: string; // แคมเปญขาย
  salesCommission?: number; // คอมฯ พนักงานขาย
  salesExpense?: number; // ค่าใช้จ่ายในการขาย
  insurancePremium?: number; // ค่าเบี้ยประกัน (= sale.insuranceFee)
  netProfit?: number; // กำไรสุทธิ
```

- [ ] **Step 2: Typecheck the web app (which consumes the shared type)**

Run: `cd /Users/marwinropmuang/Documents/NexmindIT/Car-Stock-monorepo/apps/web && bunx tsc -b`
Expected: PASS (exit 0, no errors). The change is additive and optional, so nothing breaks.

- [ ] **Step 3: Commit**

```bash
cd /Users/marwinropmuang/Documents/NexmindIT/Car-Stock-monorepo
git add packages/shared/src/types/reports.ts
git commit -m "feat(shared): type the financial fields SalesSummaryItem already carries"
```

---

### Task 2: Canonical per-sale column descriptor (TDD)

**Files:**
- Create: `apps/web/src/pages/reports/salesSummaryColumns.ts`
- Test: `apps/web/src/pages/reports/salesSummaryColumns.test.ts`

**Interfaces:**
- Consumes: `SalesSummaryItem` from Task 1 (`@car-stock/shared/types`, type-only import); `formatDate` from `../../components/reports/reportUtils`.
- Produces:
  - `SALES_SUMMARY_COLUMNS: SalesSummaryColumn[]` where `interface SalesSummaryColumn { key: string; value: (s: SalesSummaryItem, index: number) => string | number }`.
  - `buildSalesSummaryExportRow(s: SalesSummaryItem, index: number): Record<string, string | number>` — used by Task 3.

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/pages/reports/salesSummaryColumns.test.ts`:

```ts
import { describe, expect, test } from 'bun:test';
import type { SalesSummaryItem } from '@car-stock/shared/types';
import { SALES_SUMMARY_COLUMNS, buildSalesSummaryExportRow } from './salesSummaryColumns';

// The canonical header order. Core columns mirror the PDF (sales-summary-report.hbs);
// the last three are Excel-only extras kept per the spec. Editing the descriptor
// without updating this list (or vice-versa) fails here — the PDF-drift guard.
const EXPECTED_HEADERS = [
  'ลำดับ',
  'ชื่อลูกค้า',
  'แบบรถ',
  'เลขเครื่อง',
  'เลขคัซซี',
  'ราคารถ',
  'ส่วนลดตัวรถ',
  'เงินสนับสนุน',
  'ดอกเบี้ย',
  'เงินดาวน์',
  'ส่วนลดดาวน์',
  'คงเหลือ',
  'ยอดจัด',
  'ค่าคอมไฟแนนซ์',
  'รวมรับเงิน',
  'วันที่ขาย',
  'ทะเบียน/พรบ/ขนส่ง',
  'ต้นทุน',
  'แคมเปญขาย',
  'กำไรขั้นต้น',
  'คอมฯพนักงาน',
  'ค่าใช้จ่ายขาย',
  'ค่าเบี้ยประกัน',
  'กำไรสุทธิ',
  'รับจาก',
  'สถานะ',
  'Sale',
];

const fullSale = {
  id: 's1',
  saleNumber: 'SL-2026-0001',
  saleDate: '2026-06-15T00:00:00.000Z',
  customerName: 'สมชาย ใจดี',
  customerType: 'INDIVIDUAL',
  vehicleInfo: 'Toyota Vios',
  vehicleModelName: 'Toyota Vios 1.5 G',
  vin: '',
  chassisNumber: 'CHAS-123',
  engineNumber: 'ENG-123',
  saleType: 'DIRECT',
  paymentMode: 'FINANCE',
  totalAmount: 700000,
  paidAmount: 100000,
  remainingAmount: 600000,
  status: 'COMPLETED',
  statusLabel: 'สำเร็จ',
  salesperson: 'พนักงาน เอ',
  receivedFrom: 'คลังกลาง',
  priceNet: 0,
  priceVat: 0,
  priceGross: 0,
  discountAmount: 20000,
  campaignSubsidy: 15000,
  netCarDiscount: 5000,
  downPayment: 120000,
  downPaymentDiscount: 0,
  financeAmount: 580000,
  financeReturn: 8000,
  interestCost: 12000,
  transportFee: 4500,
  totalCost: 620000,
  campaignName: 'แคมเปญ มิ.ย.',
  salesCommission: 7000,
  salesExpense: 3000,
  insurancePremium: 18000,
  netProfit: 93000,
} as SalesSummaryItem;

describe('SALES_SUMMARY_COLUMNS', () => {
  test('column order matches the canonical header list (PDF-drift guard)', () => {
    expect(SALES_SUMMARY_COLUMNS.map((c) => c.key)).toEqual(EXPECTED_HEADERS);
  });

  test('builds a row with every expected header', () => {
    const row = buildSalesSummaryExportRow(fullSale, 0);
    expect(Object.keys(row)).toEqual(EXPECTED_HEADERS);
  });

  test('expense/profit fields land in the right columns as raw numbers', () => {
    const row = buildSalesSummaryExportRow(fullSale, 0);
    expect(row['ลำดับ']).toBe(1);
    expect(row['ค่าคอมไฟแนนซ์']).toBe(8000);
    expect(row['ทะเบียน/พรบ/ขนส่ง']).toBe(4500);
    expect(row['คอมฯพนักงาน']).toBe(7000);
    expect(row['ค่าใช้จ่ายขาย']).toBe(3000);
    expect(row['ค่าเบี้ยประกัน']).toBe(18000);
    expect(row['เงินสนับสนุน']).toBe(15000);
    expect(row['กำไรสุทธิ']).toBe(93000);
  });

  test('กำไรขั้นต้น is computed as ราคารถ − ต้นทุน', () => {
    const row = buildSalesSummaryExportRow(fullSale, 0);
    expect(row['กำไรขั้นต้น']).toBe(80000); // 700000 − 620000
  });

  test('missing financial fields default to 0 (null-safety)', () => {
    const sparse = {
      ...fullSale,
      salesCommission: undefined,
      salesExpense: undefined,
      insurancePremium: undefined,
      transportFee: undefined,
      totalCost: undefined,
      financeReturn: undefined,
      campaignSubsidy: undefined,
      netProfit: undefined,
    } as SalesSummaryItem;
    const row = buildSalesSummaryExportRow(sparse, 4);
    expect(row['ลำดับ']).toBe(5);
    expect(row['คอมฯพนักงาน']).toBe(0);
    expect(row['ค่าใช้จ่ายขาย']).toBe(0);
    expect(row['ค่าเบี้ยประกัน']).toBe(0);
    expect(row['กำไรสุทธิ']).toBe(0);
    expect(row['กำไรขั้นต้น']).toBe(700000); // totalCost undefined → 700000 − 0
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd /Users/marwinropmuang/Documents/NexmindIT/Car-Stock-monorepo && bun test apps/web/src/pages/reports/salesSummaryColumns.test.ts`
Expected: FAIL — `Cannot find module './salesSummaryColumns'` (the module does not exist yet).

- [ ] **Step 3: Implement the descriptor**

Create `apps/web/src/pages/reports/salesSummaryColumns.ts`:

```ts
import type { SalesSummaryItem } from '@car-stock/shared/types';
// Import from the leaf, NOT the `../../components/reports` barrel: the barrel
// re-exports recharts-backed React components, which would drag React/recharts
// into the pure Bun unit test for this descriptor.
import { formatDate } from '../../components/reports/reportUtils';

export interface SalesSummaryColumn {
  /** Thai header text — also used verbatim as the Excel column label. */
  key: string;
  /** Cell value. Money fields return raw numbers so Excel keeps them numeric. */
  value: (s: SalesSummaryItem, index: number) => string | number;
}

/**
 * Canonical per-sale columns for the sales-summary report.
 *
 * Order and labels mirror the server PDF (sales-summary-report.hbs). Two
 * spreadsheet adaptations: customer/model and engine/chassis become separate
 * columns (the PDF stacks them in one cell), and กำไรขั้นต้น is computed
 * (ราคารถ − ต้นทุน) to match the PDF's {{subtract totalAmount totalCost}}.
 *
 * The last three columns are Excel-only extras kept per the spec; the redundant
 * per-row cost-VAT split is intentionally omitted (it is an aggregate in the PDF footer).
 */
export const SALES_SUMMARY_COLUMNS: SalesSummaryColumn[] = [
  { key: 'ลำดับ', value: (_s, i) => i + 1 },
  { key: 'ชื่อลูกค้า', value: (s) => s.customerName },
  { key: 'แบบรถ', value: (s) => s.vehicleModelName || s.vehicleInfo },
  { key: 'เลขเครื่อง', value: (s) => s.engineNumber || '-' },
  { key: 'เลขคัซซี', value: (s) => s.chassisNumber || s.vin || '-' },
  { key: 'ราคารถ', value: (s) => s.totalAmount },
  { key: 'ส่วนลดตัวรถ', value: (s) => s.discountAmount ?? 0 },
  { key: 'เงินสนับสนุน', value: (s) => s.campaignSubsidy ?? 0 },
  { key: 'ดอกเบี้ย', value: (s) => s.interestCost ?? 0 },
  { key: 'เงินดาวน์', value: (s) => s.downPayment ?? 0 },
  { key: 'ส่วนลดดาวน์', value: (s) => s.downPaymentDiscount ?? 0 },
  { key: 'คงเหลือ', value: (s) => s.remainingAmount },
  { key: 'ยอดจัด', value: (s) => s.financeAmount ?? 0 },
  { key: 'ค่าคอมไฟแนนซ์', value: (s) => s.financeReturn ?? 0 },
  { key: 'รวมรับเงิน', value: (s) => s.paidAmount },
  { key: 'วันที่ขาย', value: (s) => (s.saleDate ? formatDate(s.saleDate) : '-') },
  { key: 'ทะเบียน/พรบ/ขนส่ง', value: (s) => s.transportFee ?? 0 },
  { key: 'ต้นทุน', value: (s) => s.totalCost ?? 0 },
  { key: 'แคมเปญขาย', value: (s) => s.campaignName || '-' },
  { key: 'กำไรขั้นต้น', value: (s) => s.totalAmount - (s.totalCost ?? 0) },
  { key: 'คอมฯพนักงาน', value: (s) => s.salesCommission ?? 0 },
  { key: 'ค่าใช้จ่ายขาย', value: (s) => s.salesExpense ?? 0 },
  { key: 'ค่าเบี้ยประกัน', value: (s) => s.insurancePremium ?? 0 },
  { key: 'กำไรสุทธิ', value: (s) => s.netProfit ?? 0 },
  // Excel-only extras (kept; not in the PDF)
  { key: 'รับจาก', value: (s) => s.receivedFrom || '-' },
  { key: 'สถานะ', value: (s) => s.statusLabel },
  { key: 'Sale', value: (s) => s.salesperson },
];

/** Build one Excel row keyed by Thai header, from the canonical descriptor. */
export function buildSalesSummaryExportRow(
  s: SalesSummaryItem,
  index: number
): Record<string, string | number> {
  return Object.fromEntries(SALES_SUMMARY_COLUMNS.map((c) => [c.key, c.value(s, index)]));
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd /Users/marwinropmuang/Documents/NexmindIT/Car-Stock-monorepo && bun test apps/web/src/pages/reports/salesSummaryColumns.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Typecheck the descriptor against the extended type**

Run: `cd /Users/marwinropmuang/Documents/NexmindIT/Car-Stock-monorepo/apps/web && bunx tsc -b`
Expected: PASS. (Confirms every `s.<field>` accessor resolves against the Task 1 type — `bun test` alone can't catch type errors because Bun strips types at runtime.)

- [ ] **Step 6: Commit**

```bash
cd /Users/marwinropmuang/Documents/NexmindIT/Car-Stock-monorepo
git add apps/web/src/pages/reports/salesSummaryColumns.ts apps/web/src/pages/reports/salesSummaryColumns.test.ts
git commit -m "feat(reports): canonical sales-summary column descriptor (Excel↔PDF parity)"
```

---

### Task 3: Wire the Excel export to the descriptor

**Files:**
- Modify: `apps/web/src/pages/reports/SalesSummaryReportPage.tsx` (the `toSaleExportRow` definition at lines 58–74, and its `import` block)

**Interfaces:**
- Consumes: `buildSalesSummaryExportRow` from Task 2.
- Produces: nothing new; the three Excel sheets now emit the canonical columns. `handleExportExcel` (lines 76–107) is unchanged — it already maps `data.sales.map(toSaleExportRow)` for all three sheets.

- [ ] **Step 1: Replace the hand-written row mapper**

In `apps/web/src/pages/reports/SalesSummaryReportPage.tsx`, delete the entire `toSaleExportRow` arrow function (lines 58–74, from `const toSaleExportRow = (s: SalesSummaryItem, idx: number) => ({` through its closing `});`) and replace it with:

```ts
  const toSaleExportRow = (s: SalesSummaryItem, idx: number) =>
    buildSalesSummaryExportRow(s, idx);
```

- [ ] **Step 2: Add the import**

In the same file, add this import next to the other local imports (e.g. directly below the `import { reportService } from '../../services/report.service';` line):

```ts
import { buildSalesSummaryExportRow } from './salesSummaryColumns';
```

Note: `formatDate` is still imported by the page for the salesperson/other UI; leave existing imports as-is. If Biome flags `SalesSummaryItem` as now only used in the `toSaleExportRow` signature, keep it — it is still referenced.

- [ ] **Step 3: Typecheck and lint**

Run: `cd /Users/marwinropmuang/Documents/NexmindIT/Car-Stock-monorepo/apps/web && bunx tsc -b`
Expected: PASS.

Run: `cd /Users/marwinropmuang/Documents/NexmindIT/Car-Stock-monorepo && bunx biome check apps/web/src/pages/reports/SalesSummaryReportPage.tsx apps/web/src/pages/reports/salesSummaryColumns.ts`
Expected: PASS (no errors). If Biome reports formatting fixes, run `bunx biome check --write <files>` and re-run.

- [ ] **Step 4: Re-run the unit test (still green)**

Run: `cd /Users/marwinropmuang/Documents/NexmindIT/Car-Stock-monorepo && bun test apps/web/src/pages/reports/salesSummaryColumns.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd /Users/marwinropmuang/Documents/NexmindIT/Car-Stock-monorepo
git add apps/web/src/pages/reports/SalesSummaryReportPage.tsx
git commit -m "feat(reports): Excel sales-summary export reaches PDF column parity"
```

---

### Task 4: Visual verification on local OrbStack DB

This task has no code; it confirms the customer-facing outcome. See memory `reference_local_db_smoke_test` for the full recipe. Fold into the prior commits' review — do not commit anything here unless a defect is found.

**Files:** none (verification only).

- [ ] **Step 1: Bring up the local DB + API + web**

```bash
orb start
# Confirm the car-stock-db container IP (commonly 192.168.107.x), db postgres/postgres/car_stock.
# Run the source API on :3001 with DATABASE_URL pointing at that IP, JWT_SECRET=smoketestsecret,
# and PDF_ASSETS_DIR set; run `bun run dev` for the web on :5173 (proxies /api → 3001).
```

- [ ] **Step 2: Ensure at least one sale in range has non-zero expense fields**

Pick (or edit in the DB) a sale within the current month that has non-zero `salesCommission`, `salesExpense`, `insuranceFee`, `compulsoryInsuranceFee`/`registrationFee`, and `financeCommission`. Note its values.

- [ ] **Step 3: Export Excel from the report page**

Navigate to รายงาน → รายงานสรุปยอดขาย, set the date range to include that sale, click **ดาวน์โหลด Excel**. Open the `.xlsx`.

Expected: the first sheet (`รายการตัดขายประจำเดือน`) shows the new columns — ส่วนลดตัวรถ, เงินสนับสนุน, ดอกเบี้ย, ยอดจัด, ค่าคอมไฟแนนซ์, ทะเบียน/พรบ/ขนส่ง, ต้นทุน, แคมเปญขาย, กำไรขั้นต้น, คอมฯพนักงาน, ค่าใช้จ่ายขาย, ค่าเบี้ยประกัน, กำไรสุทธิ — populated for that sale, plus trailing รับจาก / สถานะ / Sale. Money cells are numeric (right-aligned, summable).

- [ ] **Step 4: Reconcile against the PDF**

Click **ส่งออก PDF** for the same range. For the same sale, confirm คอมฯพนักงาน, ค่าใช้จ่ายขาย, ค่าเบี้ยประกัน, ค่าคอม(ไฟแนนซ์), ทะเบียน/พรบ/ขนส่ง, and กำไรสุทธิ match the Excel values exactly.

Expected: Excel and PDF agree per sale. If they differ, stop and investigate `getSalesSummaryReport` vs the descriptor mapping before declaring done.

---

## Self-Review

**1. Spec coverage:**
- Type the fields the API sends → Task 1. ✓
- Canonical column descriptor → Task 2. ✓
- Excel consumes the descriptor (all three sheets) → Task 3. ✓
- Kept extras (รับจาก/สถานะ/Sale), dropped cost-VAT split → encoded in Task 2 descriptor + EXPECTED_HEADERS. ✓
- PDF unchanged + drift guard → no PDF task; the `EXPECTED_HEADERS` equality test is the guard (Task 2). ✓
- Unit test (keys, numeric money, gross-profit math, null-safety) → Task 2. ✓
- Visual reconciliation vs PDF → Task 4. ✓
- Out of scope (on-screen table, permission gating, P&L, campaign report) → no tasks, correct. ✓

**2. Placeholder scan:** No TBD/TODO; every code step shows complete code; every command has expected output. ✓

**3. Type consistency:** `SalesSummaryColumn`, `SALES_SUMMARY_COLUMNS`, and `buildSalesSummaryExportRow` are named identically in Task 2's definition, Task 2's test, and Task 3's consumption. Field names in the descriptor match the Task 1 interface additions exactly (`financeReturn`, `transportFee`, `insurancePremium`, `netProfit`, etc.). ✓
