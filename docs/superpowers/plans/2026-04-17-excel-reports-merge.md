# Excel Reports Merge — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reproduce the customer's daily and monthly Excel reports inside the Car-Stock system with matching multi-sheet Excel export (A4 landscape), consolidating their 12 monthly sheets into 4 app reports via a `vehicleType` filter.

**Architecture:** Additive — 1 nullable schema field (`Stock.receivedFrom`), 2 new indexes, 2 new report pages, 2 extended existing pages, and a global landscape page-setup change in `exportMultiSheet`. VAT net/VAT/gross is derived from `baseCost` at read time (never stored). Production schema syncs via the existing `apps/updater` `prisma db push` pipeline — no migration files to commit.

**Tech Stack:** Bun, ElysiaJS, Prisma, PostgreSQL, React 19 + Vite, Tailwind CSS v4, Radix UI, TanStack Query, `xlsx` + `file-saver` for Excel, Puppeteer + Handlebars for PDF, Biome for lint/format, `bun:test` for tests.

**Reference spec:** `docs/superpowers/specs/2026-04-17-excel-reports-merge-design.md`

---

## File inventory

**New files**
- `apps/web/src/pages/reports/DailyStockSnapshotPage.tsx`
- `apps/web/src/pages/reports/MonthlyPurchasesReportPage.tsx`
- `apps/api/src/modules/pdf/templates/daily-stock-snapshot.hbs`
- `apps/api/src/modules/pdf/templates/monthly-purchases-report.hbs`
- `apps/api/src/__tests__/reports-helpers.test.ts`
- `apps/api/src/__tests__/daily-snapshot.test.ts`

**Modified files**
- `apps/api/prisma/schema.prisma`
- `apps/api/src/modules/reports/reports.service.ts`
- `apps/api/src/modules/reports/reports.controller.ts`
- `apps/api/src/modules/pdf/pdf.service.ts`
- `apps/api/src/modules/pdf/pdf.controller.ts`
- `apps/api/src/modules/pdf/types.ts`
- `packages/shared/src/types/index.ts`
- `packages/shared/src/schemas/index.ts`
- `apps/web/src/services/report.service.ts`
- `apps/web/src/pages/reports/StockReportPage.tsx`
- `apps/web/src/pages/reports/SalesSummaryReportPage.tsx`
- `apps/web/src/pages/reports/ReportsPage.tsx`
- `apps/web/src/App.tsx`
- `apps/web/src/components/reports/exportUtils.ts`
- `apps/web/src/index.css`

---

## Task 1 — Schema: add `receivedFrom` + two indexes

**Files:**
- Modify: `apps/api/prisma/schema.prisma` (Stock model block, lines ~94-144)

- [ ] **Step 1: Add the field and two indexes**

Open `apps/api/prisma/schema.prisma`, find the `Stock` model, insert `receivedFrom` after `parkingSlot` and add the two index lines before `@@map("stocks")`:

```prisma
model Stock {
  // ... existing fields above ...
  parkingSlot           String?            @map("parking_slot")
  receivedFrom          String?            @map("received_from")  // ผู้จำหน่าย/ซัพพลายเออร์
  // ... rest of existing fields unchanged ...

  @@index([status])
  @@index([vehicleModelId])
  @@index([deletedAt])
  @@index([createdAt])
  @@index([arrivalDate])
  @@index([soldDate])
  @@map("stocks")
}
```

- [ ] **Step 2: Generate Prisma client and push schema**

Run from repo root:

```bash
bun run db:generate && bun run db:push
```

Expected: "Your database is now in sync with your Prisma schema" and no `accept-data-loss` prompt (all additive).

- [ ] **Step 3: Commit**

```bash
git add apps/api/prisma/schema.prisma
git commit -m "feat(stock): add receivedFrom field and range-query indexes"
```

---

## Task 2 — `splitVat` helper + unit tests

**Files:**
- Modify: `apps/api/src/modules/reports/reports.service.ts` (add helper near existing helpers at line 12-36)
- Create: `apps/api/src/__tests__/reports-helpers.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/__tests__/reports-helpers.test.ts`:

```ts
import { describe, it, expect } from 'bun:test';
import { splitVat } from '../modules/reports/reports.service';

describe('splitVat', () => {
  it('returns zeros for gross = 0', () => {
    expect(splitVat(0)).toEqual({ net: 0, vat: 0, gross: 0 });
  });

  it('clamps negative gross to zero', () => {
    expect(splitVat(-100)).toEqual({ net: 0, vat: 0, gross: 0 });
  });

  it('matches Excel row 3 (baseCost=466650)', () => {
    const result = splitVat(466650);
    expect(result.net).toBe(436121.50);
    expect(result.vat).toBe(30528.50);
    expect(result.gross).toBe(466650);
  });

  it('matches Excel row 4 (baseCost=521000)', () => {
    const result = splitVat(521000);
    expect(result.net).toBe(486915.89);
    expect(result.vat).toBe(34084.11);
    expect(result.gross).toBe(521000);
  });

  it('net + vat === gross invariant holds for many values', () => {
    for (const gross of [100, 999.99, 12345.67, 1_000_000, 7]) {
      const { net, vat } = splitVat(gross);
      expect(Math.round((net + vat) * 100) / 100).toBe(gross);
    }
  });
});
```

- [ ] **Step 2: Run test — expect failure**

```bash
cd apps/api && bun test src/__tests__/reports-helpers.test.ts
```

Expected: FAIL with `SyntaxError` or `splitVat is not exported`.

- [ ] **Step 3: Implement and export the helper**

In `apps/api/src/modules/reports/reports.service.ts`, after line 36 (right after `calculateInterest`), add:

```ts
/**
 * Thai VAT-inclusive extraction: given a gross price (baseCost),
 * return { net, vat, gross } with 2-decimal rounding.
 *
 * Invariant: net + vat === gross at 2dp. Derived from net (rounded),
 * then vat = gross − net — NOT from independent rounding of each.
 */
export const splitVat = (gross: number): { net: number; vat: number; gross: number } => {
  if (gross <= 0) return { net: 0, vat: 0, gross: 0 };
  const net = Math.round((gross / 1.07) * 100) / 100;
  const vat = Math.round((gross - net) * 100) / 100;
  return { net, vat, gross };
};
```

- [ ] **Step 4: Run test — expect pass**

```bash
cd apps/api && bun test src/__tests__/reports-helpers.test.ts
```

Expected: `5 pass, 0 fail`.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/reports/reports.service.ts apps/api/src/__tests__/reports-helpers.test.ts
git commit -m "feat(reports): add splitVat helper with unit tests"
```

---

## Task 3 — Shared types + Zod schemas for new endpoints

**Files:**
- Modify: `packages/shared/src/schemas/index.ts` (end of file)
- Modify: `packages/shared/src/types/index.ts` (end of file)

- [ ] **Step 1: Add Zod schemas**

Append to `packages/shared/src/schemas/index.ts`:

```ts
// ============================================================================
// Daily Stock Snapshot Report (new)
// ============================================================================

export const DailyStockSnapshotQuerySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD'),
});

export const DailyStockSnapshotModelSchema = z.object({
  vehicleModelId: z.string(),
  modelName: z.string(),
  reservationsByColor: z.record(z.string(), z.number()),
  reservationsTotal: z.number(),
  availableByColor: z.record(z.string(), z.number()),
  availableTotal: z.number(),
  demoByColor: z.record(z.string(), z.number()),
  demoTotal: z.number(),
  requiredByColor: z.record(z.string(), z.number()),
  requiredTotal: z.number(),
});

export const DailyStockSnapshotResponseSchema = z.object({
  date: z.string(),
  colors: z.array(z.string()),
  models: z.array(DailyStockSnapshotModelSchema),
  grand: z.object({
    reservations: z.number(),
    available: z.number(),
    demo: z.number(),
    required: z.number(),
  }),
  unassignedReservations: z.number(),
});

// ============================================================================
// Monthly Purchases Report (new)
// ============================================================================

export const MonthlyPurchasesQuerySchema = z.object({
  year: z.coerce.number().int().min(2000).max(3000),
  month: z.coerce.number().int().min(1).max(12),
  vehicleType: VehicleTypeSchema.optional(),
});

export const MonthlyPurchasesItemSchema = z.object({
  no: z.number(),
  vehicleModelName: z.string(),
  exteriorColor: z.string(),
  vin: z.string(),
  engineNumber: z.string(),
  orderDate: z.string().nullable(),
  arrivalDate: z.string(),
  receivedFrom: z.string(),
  priceNet: z.number(),
  priceVat: z.number(),
  priceGross: z.number(),
  parkingSlot: z.string(),
  customerName: z.string().nullable(),
  soldDate: z.string().nullable(),
  salesperson: z.string().nullable(),
  notes: z.string().nullable(),
});

export const MonthlyPurchasesResponseSchema = z.object({
  period: z.object({
    year: z.number(),
    month: z.number(),
    startDate: z.string(),
    endDate: z.string(),
  }),
  vehicleType: VehicleTypeSchema.optional(),
  items: z.array(MonthlyPurchasesItemSchema),
  summary: z.object({
    totalVehicles: z.number(),
    totalPriceNet: z.number(),
    totalPriceVat: z.number(),
    totalPriceGross: z.number(),
    byType: z.array(z.object({
      type: VehicleTypeSchema,
      count: z.number(),
      totalGross: z.number(),
    })),
  }),
});

// ============================================================================
// vehicleType filter extension for Stock & Sales reports
// ============================================================================

export const VehicleTypeFilterSchema = z.object({
  vehicleType: VehicleTypeSchema.optional(),
});
```

- [ ] **Step 2: Export inferred types**

Append to `packages/shared/src/types/index.ts`:

```ts
import type {
  DailyStockSnapshotResponseSchema,
  DailyStockSnapshotModelSchema,
  MonthlyPurchasesResponseSchema,
  MonthlyPurchasesItemSchema,
} from '../schemas';

export type DailyStockSnapshotModel = z.infer<typeof DailyStockSnapshotModelSchema>;
export type DailyStockSnapshotResponse = z.infer<typeof DailyStockSnapshotResponseSchema>;
export type MonthlyPurchasesItem = z.infer<typeof MonthlyPurchasesItemSchema>;
export type MonthlyPurchasesResponse = z.infer<typeof MonthlyPurchasesResponseSchema>;
```

- [ ] **Step 3: Type-check**

```bash
bun run typecheck
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add packages/shared/src/schemas/index.ts packages/shared/src/types/index.ts
git commit -m "feat(shared): add schemas and types for daily snapshot and monthly purchases"
```

---

## Task 4 — `getDailyStockSnapshot` service + unit test for pivot builder

**Files:**
- Modify: `apps/api/src/modules/reports/reports.service.ts`
- Create: `apps/api/src/__tests__/daily-snapshot.test.ts`

- [ ] **Step 1: Write the failing pivot test**

Create `apps/api/src/__tests__/daily-snapshot.test.ts`:

```ts
import { describe, it, expect } from 'bun:test';
import { buildDailySnapshot } from '../modules/reports/reports.service';

type ReservationFixture = { vehicleModelId: string | null; modelName: string; color: string };
type StockFixture = { vehicleModelId: string; modelName: string; color: string; status: 'AVAILABLE' | 'DEMO' };

describe('buildDailySnapshot pivot', () => {
  it('groups reservations and stock by model × color and computes required = max(0, res - avail)', () => {
    const reservations: ReservationFixture[] = [
      { vehicleModelId: 'm1', modelName: 'NETA V', color: 'WHITE' },
      { vehicleModelId: 'm1', modelName: 'NETA V', color: 'WHITE' },
      { vehicleModelId: 'm1', modelName: 'NETA V', color: 'GRAY' },
      { vehicleModelId: 'm2', modelName: 'NETA U', color: 'WHITE' },
    ];
    const stocks: StockFixture[] = [
      { vehicleModelId: 'm1', modelName: 'NETA V', color: 'WHITE', status: 'AVAILABLE' },
      { vehicleModelId: 'm1', modelName: 'NETA V', color: 'WHITE', status: 'DEMO' },
      { vehicleModelId: 'm2', modelName: 'NETA U', color: 'WHITE', status: 'AVAILABLE' },
      { vehicleModelId: 'm2', modelName: 'NETA U', color: 'WHITE', status: 'AVAILABLE' },
    ];

    const result = buildDailySnapshot({ reservations, stocks, date: '2026-04-17' });

    expect(result.colors).toEqual(['GRAY', 'WHITE']);
    const m1 = result.models.find((m) => m.vehicleModelId === 'm1')!;
    expect(m1.reservationsByColor).toEqual({ WHITE: 2, GRAY: 1 });
    expect(m1.reservationsTotal).toBe(3);
    expect(m1.availableByColor).toEqual({ WHITE: 1 });
    expect(m1.availableTotal).toBe(1);
    expect(m1.demoByColor).toEqual({ WHITE: 1 });
    expect(m1.demoTotal).toBe(1);
    expect(m1.requiredByColor).toEqual({ WHITE: 1, GRAY: 1 });
    expect(m1.requiredTotal).toBe(2);

    const m2 = result.models.find((m) => m.vehicleModelId === 'm2')!;
    expect(m2.requiredByColor).toEqual({ WHITE: 0 }); // 1 res, 2 avail → 0 needed
    expect(m2.requiredTotal).toBe(0);

    expect(result.grand).toEqual({ reservations: 4, available: 3, demo: 1, required: 2 });
    expect(result.unassignedReservations).toBe(0);
  });

  it('skips reservations with null vehicleModelId and counts them', () => {
    const reservations: ReservationFixture[] = [
      { vehicleModelId: null, modelName: '', color: 'BLACK' },
      { vehicleModelId: 'm1', modelName: 'NETA V', color: 'WHITE' },
    ];
    const stocks: StockFixture[] = [];
    const result = buildDailySnapshot({ reservations, stocks, date: '2026-04-17' });
    expect(result.models.length).toBe(1);
    expect(result.unassignedReservations).toBe(1);
  });

  it('handles empty inputs', () => {
    const result = buildDailySnapshot({ reservations: [], stocks: [], date: '2026-04-17' });
    expect(result.colors).toEqual([]);
    expect(result.models).toEqual([]);
    expect(result.grand).toEqual({ reservations: 0, available: 0, demo: 0, required: 0 });
  });
});
```

- [ ] **Step 2: Run test — expect failure**

```bash
cd apps/api && bun test src/__tests__/daily-snapshot.test.ts
```

Expected: FAIL with `buildDailySnapshot is not exported`.

- [ ] **Step 3: Implement `buildDailySnapshot` and `getDailyStockSnapshot`**

In `apps/api/src/modules/reports/reports.service.ts`, append at end (after `getPurchaseRequirementReport`):

```ts
// ============================================
// Daily Stock Snapshot
// ============================================

export interface DailySnapshotInputReservation {
  vehicleModelId: string | null;
  modelName: string;
  color: string;
}

export interface DailySnapshotInputStock {
  vehicleModelId: string;
  modelName: string;
  color: string;
  status: 'AVAILABLE' | 'DEMO';
}

export function buildDailySnapshot(args: {
  reservations: DailySnapshotInputReservation[];
  stocks: DailySnapshotInputStock[];
  date: string;
}) {
  const { reservations, stocks, date } = args;

  const colorSet = new Set<string>();
  reservations.forEach((r) => r.vehicleModelId && colorSet.add(r.color));
  stocks.forEach((s) => colorSet.add(s.color));
  const colors = Array.from(colorSet).sort();

  // Group by model id
  const modelMap = new Map<string, {
    vehicleModelId: string;
    modelName: string;
    reservationsByColor: Record<string, number>;
    availableByColor: Record<string, number>;
    demoByColor: Record<string, number>;
  }>();

  const ensureModel = (id: string, name: string) => {
    if (!modelMap.has(id)) {
      modelMap.set(id, {
        vehicleModelId: id,
        modelName: name,
        reservationsByColor: {},
        availableByColor: {},
        demoByColor: {},
      });
    }
    return modelMap.get(id)!;
  };

  let unassignedReservations = 0;
  reservations.forEach((r) => {
    if (!r.vehicleModelId) { unassignedReservations += 1; return; }
    const m = ensureModel(r.vehicleModelId, r.modelName);
    m.reservationsByColor[r.color] = (m.reservationsByColor[r.color] || 0) + 1;
  });

  stocks.forEach((s) => {
    const m = ensureModel(s.vehicleModelId, s.modelName);
    if (s.status === 'AVAILABLE') {
      m.availableByColor[s.color] = (m.availableByColor[s.color] || 0) + 1;
    } else {
      m.demoByColor[s.color] = (m.demoByColor[s.color] || 0) + 1;
    }
  });

  const models = Array.from(modelMap.values()).map((m) => {
    const reservationsTotal = Object.values(m.reservationsByColor).reduce((a, b) => a + b, 0);
    const availableTotal = Object.values(m.availableByColor).reduce((a, b) => a + b, 0);
    const demoTotal = Object.values(m.demoByColor).reduce((a, b) => a + b, 0);

    const requiredByColor: Record<string, number> = {};
    const allColors = new Set([
      ...Object.keys(m.reservationsByColor),
      ...Object.keys(m.availableByColor),
    ]);
    let requiredTotal = 0;
    allColors.forEach((c) => {
      const req = Math.max(0, (m.reservationsByColor[c] || 0) - (m.availableByColor[c] || 0));
      requiredByColor[c] = req;
      requiredTotal += req;
    });

    return { ...m, reservationsTotal, availableTotal, demoTotal, requiredByColor, requiredTotal };
  });

  const grand = {
    reservations: models.reduce((a, m) => a + m.reservationsTotal, 0),
    available: models.reduce((a, m) => a + m.availableTotal, 0),
    demo: models.reduce((a, m) => a + m.demoTotal, 0),
    required: models.reduce((a, m) => a + m.requiredTotal, 0),
  };

  return { date, colors, models, grand, unassignedReservations };
}

export async function getDailyStockSnapshot(params: { date: Date }) {
  const snapshotDate = new Date(params.date);
  snapshotDate.setHours(23, 59, 59, 999); // inclusive "as of end of day"

  const [reservations, stocks] = await Promise.all([
    db.sale.findMany({
      where: {
        status: { in: ['RESERVED', 'PREPARING'] as SaleStatus[] },
        createdAt: { lte: snapshotDate },
      },
      include: { vehicleModel: { select: { id: true, brand: true, model: true, variant: true } } },
    }),
    db.stock.findMany({
      where: {
        deletedAt: null,
        arrivalDate: { lte: snapshotDate },
        status: { in: ['AVAILABLE', 'DEMO'] as StockStatus[] },
      },
      include: { vehicleModel: { select: { id: true, brand: true, model: true, variant: true } } },
    }),
  ]);

  const inputReservations: DailySnapshotInputReservation[] = reservations.map((r) => ({
    vehicleModelId: r.vehicleModel?.id ?? null,
    modelName: r.vehicleModel
      ? `${r.vehicleModel.brand} ${r.vehicleModel.model}${r.vehicleModel.variant ? ' ' + r.vehicleModel.variant : ''}`
      : '',
    color: r.preferredExtColor || 'ไม่ระบุสี',
  }));

  const inputStocks: DailySnapshotInputStock[] = stocks.map((s) => ({
    vehicleModelId: s.vehicleModel.id,
    modelName: `${s.vehicleModel.brand} ${s.vehicleModel.model}${s.vehicleModel.variant ? ' ' + s.vehicleModel.variant : ''}`,
    color: s.exteriorColor,
    status: s.status as 'AVAILABLE' | 'DEMO',
  }));

  return buildDailySnapshot({
    reservations: inputReservations,
    stocks: inputStocks,
    date: params.date.toISOString().split('T')[0],
  });
}
```

Also add `getDailyStockSnapshot` to the `reportsService` export at the bottom of the file:

```ts
export const reportsService = {
  getDailyPaymentReport,
  getStockReport,
  getProfitLossReport,
  getSalesSummaryReport,
  getStockInterestReport,
  getPurchaseRequirementReport,
  getDailyStockSnapshot, // NEW
};
```

(Task 5 will add `getMonthlyPurchasesReport` to this same export.)

- [ ] **Step 4: Run test — expect pass**

```bash
cd apps/api && bun test src/__tests__/daily-snapshot.test.ts
```

Expected: `3 pass, 0 fail`.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/reports/reports.service.ts apps/api/src/__tests__/daily-snapshot.test.ts
git commit -m "feat(reports): daily stock snapshot service with pivot builder"
```

---

## Task 5 — `getMonthlyPurchasesReport` service

**Files:**
- Modify: `apps/api/src/modules/reports/reports.service.ts`

- [ ] **Step 1: Implement the service**

Append to `apps/api/src/modules/reports/reports.service.ts`:

```ts
// ============================================
// Monthly Purchases Report
// ============================================

import type { VehicleType } from '@prisma/client';

export async function getMonthlyPurchasesReport(params: {
  year: number;
  month: number;
  vehicleType?: VehicleType;
}) {
  const { year, month, vehicleType } = params;

  // Half-open interval: [startDate, endDate)
  const startDate = new Date(year, month - 1, 1, 0, 0, 0, 0);
  const endDate = new Date(year, month, 1, 0, 0, 0, 0);

  const where: Record<string, unknown> = {
    deletedAt: null,
    arrivalDate: { gte: startDate, lt: endDate },
  };
  if (vehicleType) {
    where.vehicleModel = { type: vehicleType };
  }

  const stocks = await db.stock.findMany({
    where,
    include: {
      vehicleModel: { select: { brand: true, model: true, variant: true, type: true } },
      sale: {
        include: {
          customer: { select: { name: true } },
          createdBy: { select: { firstName: true, lastName: true } },
        },
      },
    },
    orderBy: { arrivalDate: 'asc' },
  });

  const items = stocks.map((s, idx) => {
    const gross = toNumber(s.baseCost);
    const { net, vat } = splitVat(gross);
    const variantStr = s.vehicleModel.variant ? ` ${s.vehicleModel.variant}` : '';
    return {
      no: idx + 1,
      vehicleModelName: `${s.vehicleModel.brand} ${s.vehicleModel.model}${variantStr}`,
      exteriorColor: s.exteriorColor,
      vin: s.vin,
      engineNumber: s.engineNumber || '-',
      orderDate: s.orderDate ? s.orderDate.toISOString() : null,
      arrivalDate: s.arrivalDate!.toISOString(),
      receivedFrom: s.receivedFrom || '-',
      priceNet: net,
      priceVat: vat,
      priceGross: gross,
      parkingSlot: s.parkingSlot || '-',
      customerName: s.sale?.customer?.name ?? null,
      soldDate: s.soldDate ? s.soldDate.toISOString() : null,
      salesperson: s.sale?.createdBy
        ? `${s.sale.createdBy.firstName} ${s.sale.createdBy.lastName}`
        : null,
      notes: s.notes ?? null,
    };
  });

  const totalPriceNet = items.reduce((sum, i) => sum + i.priceNet, 0);
  const totalPriceVat = items.reduce((sum, i) => sum + i.priceVat, 0);
  const totalPriceGross = items.reduce((sum, i) => sum + i.priceGross, 0);

  const byTypeMap = new Map<VehicleType, { count: number; totalGross: number }>();
  stocks.forEach((s, idx) => {
    const t = s.vehicleModel.type;
    const cur = byTypeMap.get(t) || { count: 0, totalGross: 0 };
    cur.count += 1;
    cur.totalGross += items[idx].priceGross;
    byTypeMap.set(t, cur);
  });
  const byType = Array.from(byTypeMap.entries()).map(([type, v]) => ({
    type,
    count: v.count,
    totalGross: Math.round(v.totalGross * 100) / 100,
  }));

  return {
    period: {
      year,
      month,
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
    },
    vehicleType,
    items,
    summary: {
      totalVehicles: items.length,
      totalPriceNet: Math.round(totalPriceNet * 100) / 100,
      totalPriceVat: Math.round(totalPriceVat * 100) / 100,
      totalPriceGross: Math.round(totalPriceGross * 100) / 100,
      byType,
    },
  };
}
```

Add `getMonthlyPurchasesReport` to the `reportsService` export object at the bottom of the file (alongside `getDailyStockSnapshot` added in Task 4).

- [ ] **Step 2: Run full test suite**

```bash
cd apps/api && bun test
```

Expected: all existing tests still pass plus the new ones.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/modules/reports/reports.service.ts
git commit -m "feat(reports): monthly purchases report service with VAT split"
```

---

## Task 6 — Add `vehicleType` filter to existing stock & sales services

**Files:**
- Modify: `apps/api/src/modules/reports/reports.service.ts` (functions `getStockReport` and `getSalesSummaryReport`)

- [ ] **Step 1: Extend `getStockReport`**

In `reports.service.ts`, update the `StockReportParams` interface and the `where` clause:

```ts
interface StockReportParams {
  startDate?: Date;
  endDate?: Date;
  status?: StockStatus;
  vehicleType?: VehicleType; // NEW
}

export async function getStockReport(params: StockReportParams) {
  const { status, vehicleType } = params;

  const where: Record<string, unknown> = {
    deletedAt: null,
  };
  if (status) where.status = status;
  if (vehicleType) where.vehicleModel = { type: vehicleType };
  // ... rest unchanged ...
}
```

Also, inside the `stockItems.map((s) => { ... })` transformer, add `receivedFrom` and VAT split to the returned row (right after `parkingSlot`):

```ts
      parkingSlot: s.parkingSlot || '-',
      receivedFrom: s.receivedFrom || '-',        // NEW
      priceNet: splitVat(baseCost).net,           // NEW
      priceVat: splitVat(baseCost).vat,           // NEW
      priceGross: baseCost,                       // NEW (alias of baseCost for clarity in export)
```

- [ ] **Step 2: Extend `getSalesSummaryReport`**

Same pattern — update the params interface and where clause:

```ts
interface SalesSummaryParams {
  startDate?: Date;
  endDate?: Date;
  status?: SaleStatus;
  salespersonId?: string;
  vehicleType?: VehicleType; // NEW
}

export async function getSalesSummaryReport(params: SalesSummaryParams) {
  const { startDate, endDate, status, salespersonId, vehicleType } = params;
  const where: Record<string, unknown> = {};
  // ... existing filters ...
  if (vehicleType) {
    where.OR = [
      { stock: { vehicleModel: { type: vehicleType } } },
      { vehicleModel: { type: vehicleType } },
    ];
  }
  // ... rest unchanged ...
}
```

In the `saleItems.map(...)` transformer, add `receivedFrom` + VAT split from the stock:

```ts
      receivedFrom: stock?.receivedFrom || '-',      // NEW
      priceNet: splitVat(baseCost).net,              // NEW
      priceVat: splitVat(baseCost).vat,              // NEW
      priceGross: baseCost,                          // NEW
```

- [ ] **Step 3: Type-check**

```bash
bun run typecheck
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/modules/reports/reports.service.ts
git commit -m "feat(reports): add vehicleType filter and supplier/VAT columns to stock and sales reports"
```

---

## Task 7 — Wire new routes in controller + client service methods

**Files:**
- Modify: `apps/api/src/modules/reports/reports.controller.ts`
- Modify: `apps/web/src/services/report.service.ts`

- [ ] **Step 1: Add two new routes in the API controller**

Open `apps/api/src/modules/reports/reports.controller.ts`. Add these route handlers (pattern-match the existing routes in the file):

```ts
// GET /api/reports/daily-stock-snapshot?date=YYYY-MM-DD
.get('/daily-stock-snapshot', async ({ query }) => {
  const parsed = DailyStockSnapshotQuerySchema.parse(query);
  const date = new Date(parsed.date);
  const data = await reportsService.getDailyStockSnapshot({ date });
  return { success: true, data };
}, {
  beforeHandle: authMiddleware,
})

// GET /api/reports/monthly-purchases?year=2026&month=4&vehicleType=SEDAN
.get('/monthly-purchases', async ({ query }) => {
  const parsed = MonthlyPurchasesQuerySchema.parse(query);
  const data = await reportsService.getMonthlyPurchasesReport({
    year: parsed.year,
    month: parsed.month,
    vehicleType: parsed.vehicleType,
  });
  return { success: true, data };
}, {
  beforeHandle: authMiddleware,
})
```

Also update the existing `/stock` and `/sales-summary` routes to pass `vehicleType` from the query string into the service:

```ts
// inside existing /stock handler
const data = await reportsService.getStockReport({
  status: query.status as StockStatus | undefined,
  vehicleType: query.vehicleType as VehicleType | undefined, // NEW
});

// inside existing /sales-summary handler
const data = await reportsService.getSalesSummaryReport({
  startDate: query.startDate ? new Date(query.startDate) : undefined,
  endDate: query.endDate ? new Date(query.endDate) : undefined,
  status: query.status as SaleStatus | undefined,
  salespersonId: query.salespersonId,
  vehicleType: query.vehicleType as VehicleType | undefined, // NEW
});
```

Make sure to import the new schemas at the top:

```ts
import {
  DailyStockSnapshotQuerySchema,
  MonthlyPurchasesQuerySchema,
} from '@car-stock/shared/schemas';
```

- [ ] **Step 2: Add client service methods**

Open `apps/web/src/services/report.service.ts`. Add methods (pattern-match existing ones):

```ts
import type {
  DailyStockSnapshotResponse,
  MonthlyPurchasesResponse,
  VehicleType,
} from '@car-stock/shared/types';

// ... inside the reportService object/class ...

async getDailyStockSnapshot(params: { date: string }): Promise<DailyStockSnapshotResponse> {
  const res = await apiClient.get<{ success: boolean; data: DailyStockSnapshotResponse }>(
    `/reports/daily-stock-snapshot?date=${encodeURIComponent(params.date)}`
  );
  return res.data;
},

async getMonthlyPurchasesReport(params: {
  year: number;
  month: number;
  vehicleType?: VehicleType;
}): Promise<MonthlyPurchasesResponse> {
  const qs = new URLSearchParams({
    year: String(params.year),
    month: String(params.month),
  });
  if (params.vehicleType) qs.append('vehicleType', params.vehicleType);
  const res = await apiClient.get<{ success: boolean; data: MonthlyPurchasesResponse }>(
    `/reports/monthly-purchases?${qs.toString()}`
  );
  return res.data;
},
```

- [ ] **Step 3: Start API + web and hit the endpoints**

```bash
# terminal 1
bun run dev

# terminal 2
curl -s 'http://localhost:3001/api/reports/daily-stock-snapshot?date=2026-04-17' -H "Authorization: Bearer <TOKEN>" | head
curl -s 'http://localhost:3001/api/reports/monthly-purchases?year=2026&month=4' -H "Authorization: Bearer <TOKEN>" | head
```

Expected: both return `{"success":true,"data":{...}}` with shapes matching Task 3's Zod schemas.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/modules/reports/reports.controller.ts apps/web/src/services/report.service.ts
git commit -m "feat(reports): wire daily snapshot and monthly purchases routes + client methods"
```

---

## Task 8 — Global A4 landscape for Excel exports + print CSS

**Files:**
- Modify: `apps/web/src/components/reports/exportUtils.ts`
- Modify: `apps/web/src/index.css`

- [ ] **Step 1: Apply landscape pageSetup to every sheet in `exportMultiSheet`**

Open `apps/web/src/components/reports/exportUtils.ts`. Inside the `sheets.forEach(...)` body, after `ws['!cols'] = colWidths;`, add:

```ts
    // A4 landscape — applied globally to every exported sheet (per project convention).
    (ws as unknown as {
      '!pageSetup'?: { orientation?: string; paperSize?: number; fitToWidth?: number; fitToHeight?: number };
      '!margins'?: { left: number; right: number; top: number; bottom: number; header: number; footer: number };
    })['!pageSetup'] = {
      orientation: 'landscape',
      paperSize: 9,    // A4
      fitToWidth: 1,
      fitToHeight: 0,
    };
    (ws as unknown as { '!margins'?: { left: number; right: number; top: number; bottom: number; header: number; footer: number } })['!margins'] = {
      left: 0.3, right: 0.3, top: 0.5, bottom: 0.5, header: 0.3, footer: 0.3,
    };
```

- [ ] **Step 2: Add print CSS rule**

Open `apps/web/src/index.css` and add (near the top, under the existing global styles):

```css
@media print {
  @page { size: A4 landscape; margin: 10mm; }
  .print-hide { display: none !important; }
}
```

- [ ] **Step 3: Manual smoke test**

Start the dev server (`bun run dev`), go to any existing report page (e.g. Stock Report), click Export Excel, open the `.xlsx` in Excel, confirm: File → Print preview → A4 landscape. Also trigger browser print (⌘P / Ctrl+P) and verify landscape.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/reports/exportUtils.ts apps/web/src/index.css
git commit -m "feat(reports): default all Excel exports and print to A4 landscape"
```

---

## Task 9 — `DailyStockSnapshotPage`

**Files:**
- Create: `apps/web/src/pages/reports/DailyStockSnapshotPage.tsx`

- [ ] **Step 1: Scaffold the page**

Create `apps/web/src/pages/reports/DailyStockSnapshotPage.tsx`:

```tsx
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { MainLayout } from '../../components/layout';
import { reportService } from '../../services/report.service';
import { useToast } from '../../components/toast';
import { exportMultiSheet } from '../../components/reports/exportUtils';
import type { DailyStockSnapshotResponse, DailyStockSnapshotModel } from '@car-stock/shared/types';

export function DailyStockSnapshotPage(): React.ReactElement {
  const { addToast } = useToast();
  const [snapshotDate, setSnapshotDate] = useState<string>(() => new Date().toISOString().split('T')[0]);

  const { data, isLoading, error } = useQuery<DailyStockSnapshotResponse>({
    queryKey: ['daily-stock-snapshot', snapshotDate],
    queryFn: () => reportService.getDailyStockSnapshot({ date: snapshotDate }),
  });

  const handleExport = () => {
    if (!data) return;
    const makeRows = (kind: 'reservations' | 'available' | 'required') =>
      data.models.map((m: DailyStockSnapshotModel) => {
        const row: Record<string, string | number> = { แบบรถ: m.modelName };
        data.colors.forEach((c) => {
          const v = kind === 'reservations' ? m.reservationsByColor[c]
                  : kind === 'available' ? m.availableByColor[c]
                  : m.requiredByColor[c];
          row[c] = v ?? 0;
        });
        row['Total'] = kind === 'reservations' ? m.reservationsTotal
                     : kind === 'available' ? m.availableTotal
                     : m.requiredTotal;
        return row;
      });

    exportMultiSheet({
      sheets: [
        { name: 'ยอดจองคงเหลือ', data: makeRows('reservations') },
        { name: 'สต๊อกคงเหลือ', data: makeRows('available') },
        { name: 'ยอดที่ต้องสั่งซื้อ', data: makeRows('required') },
      ],
      filename: `daily-stock-snapshot_${snapshotDate}`,
    });
    addToast('ดาวน์โหลด Excel สำเร็จ', 'success');
  };

  if (isLoading) {
    return (
      <MainLayout>
        <div className="p-6"><div className="animate-pulse h-8 bg-gray-200 rounded w-1/3 mb-6" /></div>
      </MainLayout>
    );
  }

  if (error || !data) {
    return (
      <MainLayout>
        <div className="p-6"><div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <h2 className="text-red-800 font-semibold mb-2">เกิดข้อผิดพลาด</h2>
          <p className="text-red-600">ไม่สามารถโหลดรายงานได้</p>
        </div></div>
      </MainLayout>
    );
  }

  const renderPanel = (
    title: string,
    getCell: (m: DailyStockSnapshotModel, c: string) => number,
    getTotal: (m: DailyStockSnapshotModel) => number,
    cellClass?: (n: number) => string,
  ) => (
    <div className="mb-6">
      <h2 className="text-lg font-semibold text-gray-900 mb-3">{title}</h2>
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-3 py-2 text-left font-medium">แบบรถ</th>
              {data.colors.map((c) => (
                <th key={c} className="px-3 py-2 text-center font-medium">{c}</th>
              ))}
              <th className="px-3 py-2 text-center font-medium">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {data.models.map((m) => (
              <tr key={m.vehicleModelId} className="hover:bg-gray-50">
                <td className="px-3 py-2 font-medium">{m.modelName}</td>
                {data.colors.map((c) => {
                  const n = getCell(m, c) || 0;
                  return (
                    <td key={c} className={`px-3 py-2 text-center ${cellClass ? cellClass(n) : ''}`}>
                      {n || ''}
                    </td>
                  );
                })}
                <td className="px-3 py-2 text-center font-semibold">{getTotal(m)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );

  return (
    <MainLayout>
      <div className="p-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">รายงานสต็อกประจำวัน</h1>
          <p className="text-gray-600 mt-1">แสดงยอดจอง สต็อกคงเหลือ และยอดที่ต้องสั่งซื้อ ณ วันที่เลือก</p>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-6 print-hide">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium">วันที่:</label>
              <input type="date" value={snapshotDate}
                onChange={(e) => setSnapshotDate(e.target.value)}
                className="border border-gray-300 rounded-md px-3 py-1.5 text-sm" />
            </div>
            <button onClick={handleExport}
              className="bg-green-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-green-700">
              ดาวน์โหลด Excel
            </button>
            <button onClick={() => window.print()}
              className="bg-gray-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-gray-700">
              พิมพ์
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-purple-50 rounded-lg p-4 border border-purple-200">
            <p className="text-sm text-purple-600 font-medium">ยอดจอง</p>
            <p className="text-2xl font-bold text-purple-900">{data.grand.reservations}</p>
          </div>
          <div className="bg-green-50 rounded-lg p-4 border border-green-200">
            <p className="text-sm text-green-600 font-medium">สต็อกคงเหลือ</p>
            <p className="text-2xl font-bold text-green-900">{data.grand.available}</p>
          </div>
          <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
            <p className="text-sm text-blue-600 font-medium">รถ DEMO</p>
            <p className="text-2xl font-bold text-blue-900">{data.grand.demo}</p>
          </div>
          <div className="bg-orange-50 rounded-lg p-4 border border-orange-200">
            <p className="text-sm text-orange-600 font-medium">ต้องสั่งซื้อเพิ่ม</p>
            <p className="text-2xl font-bold text-orange-900">{data.grand.required}</p>
          </div>
        </div>

        {renderPanel('ยอดจองคงเหลือ',
          (m, c) => m.reservationsByColor[c],
          (m) => m.reservationsTotal)}
        {renderPanel('สต๊อกคงเหลือ',
          (m, c) => m.availableByColor[c],
          (m) => m.availableTotal)}
        {renderPanel('ยอดที่ต้องสั่งซื้อ',
          (m, c) => m.requiredByColor[c],
          (m) => m.requiredTotal,
          (n) => n > 0 ? 'bg-orange-50 text-orange-800' : n < 0 ? 'bg-red-50 text-red-800' : '')}

        {data.unassignedReservations > 0 && (
          <div className="bg-yellow-50 border border-yellow-200 rounded p-3 text-sm text-yellow-800">
            มีการจองที่ยังไม่ได้ระบุรุ่นรถ {data.unassignedReservations} รายการ (ไม่แสดงในตาราง)
          </div>
        )}
      </div>
    </MainLayout>
  );
}
```

- [ ] **Step 2: Manual smoke test**

Add to `App.tsx` in Task 13. For now test via direct component import if needed, or defer smoke test to Task 13.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/pages/reports/DailyStockSnapshotPage.tsx
git commit -m "feat(web): daily stock snapshot page with 3-panel pivot"
```

---

## Task 10 — `MonthlyPurchasesReportPage`

**Files:**
- Create: `apps/web/src/pages/reports/MonthlyPurchasesReportPage.tsx`

- [ ] **Step 1: Scaffold the page**

Create `apps/web/src/pages/reports/MonthlyPurchasesReportPage.tsx`:

```tsx
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { MainLayout } from '../../components/layout';
import { reportService } from '../../services/report.service';
import { useToast } from '../../components/toast';
import { exportMultiSheet } from '../../components/reports/exportUtils';
import { VEHICLE_TYPE_LABELS } from '@car-stock/shared/constants';
import type { MonthlyPurchasesResponse, MonthlyPurchasesItem, VehicleType } from '@car-stock/shared/types';

const TYPE_OPTIONS: Array<VehicleType | ''> = ['', 'SEDAN', 'PICKUP', 'SUV', 'HATCHBACK', 'MPV', 'VAN', 'TRUCK', 'COUPE', 'CONVERTIBLE', 'WAGON'];

export function MonthlyPurchasesReportPage(): React.ReactElement {
  const { addToast } = useToast();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [vehicleType, setVehicleType] = useState<VehicleType | ''>('');

  const { data, isLoading, error } = useQuery<MonthlyPurchasesResponse>({
    queryKey: ['monthly-purchases', year, month, vehicleType],
    queryFn: () => reportService.getMonthlyPurchasesReport({
      year, month,
      vehicleType: vehicleType || undefined,
    }),
  });

  const handleExport = () => {
    if (!data) return;
    const toRow = (i: MonthlyPurchasesItem) => ({
      NO: i.no,
      แบบรถ: i.vehicleModelName,
      สี: i.exteriorColor,
      แชชซี่ส์: i.vin,
      เลขเครื่อง: i.engineNumber,
      วันที่สั่งซื้อ: i.orderDate ? i.orderDate.split('T')[0] : '-',
      วันที่รับเข้า: i.arrivalDate.split('T')[0],
      รับจาก: i.receivedFrom,
      'ราคาก่อน VAT': i.priceNet,
      VAT: i.priceVat,
      'ราคารวม VAT': i.priceGross,
      สถานที่จอด: i.parkingSlot,
      ชื่อลูกค้า: i.customerName ?? '-',
      วันที่ขาย: i.soldDate ? i.soldDate.split('T')[0] : '-',
      Sale: i.salesperson ?? '-',
      หมายเหตุ: i.notes ?? '-',
    });

    const all = data.items.map(toRow);
    // Resolve vehicle type per row by looking at model name is unreliable — instead we
    // hit the API twice filtered by SEDAN and PICKUP for correctness.
    Promise.all([
      reportService.getMonthlyPurchasesReport({ year, month, vehicleType: 'SEDAN' }),
      reportService.getMonthlyPurchasesReport({ year, month, vehicleType: 'PICKUP' }),
    ]).then(([sedan, pickup]) => {
      exportMultiSheet({
        sheets: [
          { name: 'รายการซื้อรถประจำเดือน', data: all },
          { name: 'รายการซื้อแยกเก๋ง', data: sedan.items.map(toRow) },
          { name: 'รายการซื้อแยกกะบะ', data: pickup.items.map(toRow) },
        ],
        filename: `monthly-purchases_${year}-${String(month).padStart(2, '0')}`,
      });
      addToast('ดาวน์โหลด Excel สำเร็จ', 'success');
    });
  };

  if (isLoading) return <MainLayout><div className="p-6 animate-pulse">กำลังโหลด...</div></MainLayout>;
  if (error || !data) return <MainLayout><div className="p-6 text-red-600">ไม่สามารถโหลดรายงานได้</div></MainLayout>;

  return (
    <MainLayout>
      <div className="p-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">รายงานรายการซื้อประจำเดือน</h1>
          <p className="text-gray-600 mt-1">รายการรถที่รับเข้าภายในเดือนที่เลือก</p>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-6 print-hide">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium">ปี:</label>
              <input type="number" value={year} onChange={(e) => setYear(Number(e.target.value))}
                className="border border-gray-300 rounded-md px-3 py-1.5 text-sm w-24" min={2000} max={3000}/>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium">เดือน:</label>
              <select value={month} onChange={(e) => setMonth(Number(e.target.value))}
                className="border border-gray-300 rounded-md px-3 py-1.5 text-sm">
                {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium">ประเภทรถ:</label>
              <select value={vehicleType} onChange={(e) => setVehicleType(e.target.value as VehicleType | '')}
                className="border border-gray-300 rounded-md px-3 py-1.5 text-sm">
                {TYPE_OPTIONS.map((t) => (
                  <option key={t || 'all'} value={t}>
                    {t ? (VEHICLE_TYPE_LABELS as Record<string, string>)[t] || t : 'ทั้งหมด'}
                  </option>
                ))}
              </select>
            </div>
            <button onClick={handleExport}
              className="bg-green-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-green-700">
              ดาวน์โหลด Excel
            </button>
            <button onClick={() => window.print()}
              className="bg-gray-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-gray-700">
              พิมพ์
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
            <p className="text-sm text-blue-600 font-medium">จำนวนรถ</p>
            <p className="text-2xl font-bold text-blue-900">{data.summary.totalVehicles}</p>
          </div>
          <div className="bg-green-50 rounded-lg p-4 border border-green-200">
            <p className="text-sm text-green-600 font-medium">ราคาก่อน VAT รวม</p>
            <p className="text-2xl font-bold text-green-900">{data.summary.totalPriceNet.toLocaleString()}</p>
          </div>
          <div className="bg-purple-50 rounded-lg p-4 border border-purple-200">
            <p className="text-sm text-purple-600 font-medium">ราคารวม VAT</p>
            <p className="text-2xl font-bold text-purple-900">{data.summary.totalPriceGross.toLocaleString()}</p>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-gray-50 sticky top-0">
              <tr>
                {['NO','แบบรถ','สี','แชชซี่ส์','เลขเครื่อง','วันสั่งซื้อ','วันรับเข้า','รับจาก','ก่อน VAT','VAT','รวม VAT','ที่จอด','ลูกค้า','วันขาย','Sale','หมายเหตุ'].map((h) => (
                  <th key={h} className="px-2 py-2 text-left font-medium whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {data.items.map((i) => (
                <tr key={i.vin} className="hover:bg-gray-50">
                  <td className="px-2 py-1">{i.no}</td>
                  <td className="px-2 py-1">{i.vehicleModelName}</td>
                  <td className="px-2 py-1">{i.exteriorColor}</td>
                  <td className="px-2 py-1 font-mono">{i.vin}</td>
                  <td className="px-2 py-1 font-mono">{i.engineNumber}</td>
                  <td className="px-2 py-1">{i.orderDate?.split('T')[0] ?? '-'}</td>
                  <td className="px-2 py-1">{i.arrivalDate.split('T')[0]}</td>
                  <td className="px-2 py-1">{i.receivedFrom}</td>
                  <td className="px-2 py-1 text-right">{i.priceNet.toLocaleString()}</td>
                  <td className="px-2 py-1 text-right">{i.priceVat.toLocaleString()}</td>
                  <td className="px-2 py-1 text-right">{i.priceGross.toLocaleString()}</td>
                  <td className="px-2 py-1">{i.parkingSlot}</td>
                  <td className="px-2 py-1">{i.customerName ?? '-'}</td>
                  <td className="px-2 py-1">{i.soldDate?.split('T')[0] ?? '-'}</td>
                  <td className="px-2 py-1">{i.salesperson ?? '-'}</td>
                  <td className="px-2 py-1">{i.notes ?? '-'}</td>
                </tr>
              ))}
              {data.items.length === 0 && (
                <tr><td colSpan={16} className="px-2 py-6 text-center text-gray-500">ไม่พบข้อมูลรายงาน</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </MainLayout>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/pages/reports/MonthlyPurchasesReportPage.tsx
git commit -m "feat(web): monthly purchases report page with month + vehicleType filter"
```

---

## Task 11 — Extend `StockReportPage`

**Files:**
- Modify: `apps/web/src/pages/reports/StockReportPage.tsx`

- [ ] **Step 1: Add vehicleType filter to state and query**

Open `StockReportPage.tsx`. Find the component's state declarations, add:

```tsx
const [vehicleType, setVehicleType] = useState<VehicleType | ''>('');
```

Update the `useQuery` call to include `vehicleType` in the `queryKey` and pass it to the service call.

- [ ] **Step 2: Add the filter dropdown to the UI**

Inside the filter bar `<div>`, add (mirroring Task 10's type dropdown):

```tsx
<div className="flex items-center gap-2">
  <label className="text-sm font-medium">ประเภทรถ:</label>
  <select value={vehicleType} onChange={(e) => setVehicleType(e.target.value as VehicleType | '')}
    className="border border-gray-300 rounded-md px-3 py-1.5 text-sm">
    <option value="">ทั้งหมด</option>
    <option value="SEDAN">เก๋ง</option>
    <option value="PICKUP">กะบะ</option>
    <option value="SUV">SUV</option>
    <option value="HATCHBACK">แฮทช์แบ็ก</option>
    <option value="MPV">MPV</option>
    <option value="VAN">ตู้</option>
  </select>
</div>
```

- [ ] **Step 3: Add `รับจาก` column to the in-app table**

In the table header row, insert a new `<th>` for `รับจาก` after `วันที่รับเข้า`. In the body, render `<td>{s.receivedFrom}</td>`.

- [ ] **Step 4: Update Excel export to 3-sheet layout**

Find the export handler. Replace the current single-sheet export with a pair of extra fetches + multi-sheet export (mirror Task 10's pattern):

```tsx
const handleExport = async () => {
  const toRow = (s: (typeof data.stocks)[number]) => ({
    NO: s.id,
    แบบรถ: s.vehicleModelName,
    สี: s.exteriorColor,
    แชชซี่ส์: s.vin,
    เลขเครื่อง: s.engineNumber,
    วันที่สั่งซื้อ: s.orderDate?.split('T')[0] ?? '-',
    วันที่รับเข้า: s.arrivalDate.split('T')[0],
    รับจาก: s.receivedFrom ?? '-',
    'ราคาก่อน VAT': s.priceNet,
    VAT: s.priceVat,
    'ราคารวม VAT': s.priceGross,
    สถานที่จอด: s.parkingSlot,
    หมายเหตุ: s.notes ?? '-',
  });
  const [sedan, pickup] = await Promise.all([
    reportService.getStockReport({ vehicleType: 'SEDAN' }),
    reportService.getStockReport({ vehicleType: 'PICKUP' }),
  ]);
  exportMultiSheet({
    sheets: [
      { name: 'สต็อกรถทั้งหมด', data: data.stocks.map(toRow) },
      { name: 'สต็อกแยกเก๋ง', data: sedan.stocks.map(toRow) },
      { name: 'สต็อกแยกกะบะ', data: pickup.stocks.map(toRow) },
    ],
    filename: `stock-report_${new Date().toISOString().split('T')[0]}`,
  });
};
```

(Exact variable names may differ in the current file — adapt to match local names.)

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/pages/reports/StockReportPage.tsx
git commit -m "feat(web): add vehicleType filter and supplier/VAT columns to stock report"
```

---

## Task 12 — Extend `SalesSummaryReportPage`

**Files:**
- Modify: `apps/web/src/pages/reports/SalesSummaryReportPage.tsx`

- [ ] **Step 1: Add vehicleType filter + update query**

Add a `vehicleType` state + dropdown in the filter bar, pattern-match Task 11.

- [ ] **Step 2: Update Excel export to 3 sheets**

Build `toRow` matching Excel "รายการตัดขาย…" columns (NO, แบบรถ, สี, แชชซี่ส์, เลขเครื่อง, วันที่สั่งซื้อ, วันที่รับเข้า, รับจาก, ราคาก่อน VAT, VAT, รวม VAT, สถานที่จอด, ชื่อลูกค้า, วันที่ขาย, Sale, หมายเหตุ). Fetch filtered-by-SEDAN and filtered-by-PICKUP variants in parallel and export 3 sheets with names `รายการตัดขายประจำเดือน`, `รายการตัดขายแยกเก๋ง`, `รายการตัดขายแยกกะบะ`.

```tsx
const [sedan, pickup] = await Promise.all([
  reportService.getSalesSummaryReport({ startDate, endDate, vehicleType: 'SEDAN' }),
  reportService.getSalesSummaryReport({ startDate, endDate, vehicleType: 'PICKUP' }),
]);
exportMultiSheet({
  sheets: [
    { name: 'รายการตัดขายประจำเดือน', data: data.sales.map(toRow) },
    { name: 'รายการตัดขายแยกเก๋ง', data: sedan.sales.map(toRow) },
    { name: 'รายการตัดขายแยกกะบะ', data: pickup.sales.map(toRow) },
  ],
  filename: `sales-summary_${new Date().toISOString().split('T')[0]}`,
});
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/pages/reports/SalesSummaryReportPage.tsx
git commit -m "feat(web): add vehicleType filter and 3-sheet export to sales summary report"
```

---

## Task 13 — Reports hub cards + routes

**Files:**
- Modify: `apps/web/src/pages/reports/ReportsPage.tsx`
- Modify: `apps/web/src/App.tsx`

- [ ] **Step 1: Add two new cards on the reports hub**

Open `ReportsPage.tsx`. In the cards grid, add:

```tsx
<Link to="/reports/daily-stock-snapshot" className="...same classes as existing cards...">
  <h3 className="text-lg font-semibold">รายงานสต็อกประจำวัน</h3>
  <p className="text-sm text-gray-600">ยอดจอง สต็อกคงเหลือ และยอดที่ต้องสั่งซื้อ แยกตามสี</p>
</Link>
<Link to="/reports/monthly-purchases" className="...same classes as existing cards...">
  <h3 className="text-lg font-semibold">รายงานรายการซื้อประจำเดือน</h3>
  <p className="text-sm text-gray-600">รายการรถที่รับเข้าในเดือนที่เลือก</p>
</Link>
```

- [ ] **Step 2: Register the two routes in `App.tsx`**

Import the new pages:

```tsx
import { DailyStockSnapshotPage } from './pages/reports/DailyStockSnapshotPage';
import { MonthlyPurchasesReportPage } from './pages/reports/MonthlyPurchasesReportPage';
```

Add two `<Route>` entries inside the `ProtectedRoute` block that guards the other `/reports/*` routes:

```tsx
<Route path="/reports/daily-stock-snapshot" element={<DailyStockSnapshotPage />} />
<Route path="/reports/monthly-purchases" element={<MonthlyPurchasesReportPage />} />
```

- [ ] **Step 3: Manual smoke test**

`bun run dev`, log in as admin, navigate to `/reports`, click both new cards, confirm each page loads without console errors, filters work, and Excel export produces a 3-sheet workbook.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/pages/reports/ReportsPage.tsx apps/web/src/App.tsx
git commit -m "feat(web): register daily snapshot and monthly purchases routes + hub cards"
```

---

## Task 14 — PDF templates + endpoints + download buttons

**Files:**
- Modify: `apps/api/src/modules/pdf/types.ts`
- Create: `apps/api/src/modules/pdf/templates/daily-stock-snapshot.hbs`
- Create: `apps/api/src/modules/pdf/templates/monthly-purchases-report.hbs`
- Modify: `apps/api/src/modules/pdf/pdf.service.ts`
- Modify: `apps/api/src/modules/pdf/pdf.controller.ts`
- Modify: `apps/web/src/services/report.service.ts`
- Modify: `apps/web/src/pages/reports/DailyStockSnapshotPage.tsx`
- Modify: `apps/web/src/pages/reports/MonthlyPurchasesReportPage.tsx`

- [ ] **Step 1: Add two new PdfTemplateType values**

In `apps/api/src/modules/pdf/types.ts`, add to the enum at line ~338:

```ts
export enum PdfTemplateType {
  // ... existing values ...
  DAILY_STOCK_SNAPSHOT = 'daily-stock-snapshot',
  MONTHLY_PURCHASES_REPORT = 'monthly-purchases-report',
}
```

- [ ] **Step 2: Create the two Handlebars templates**

Create `apps/api/src/modules/pdf/templates/daily-stock-snapshot.hbs` (pattern-match `stock-report.hbs` for structure; use `{{> company-header}}` partial if present):

```handlebars
<div class="report">
  <h1>รายงานสต็อกประจำวัน</h1>
  <div class="meta">วันที่ {{date}}</div>

  {{#each panels}}
    <h2>{{title}}</h2>
    <table>
      <thead>
        <tr>
          <th>แบบรถ</th>
          {{#each ../colors}}<th>{{this}}</th>{{/each}}
          <th>Total</th>
        </tr>
      </thead>
      <tbody>
        {{#each rows}}
          <tr>
            <td>{{modelName}}</td>
            {{#each cells}}<td>{{this}}</td>{{/each}}
            <td><b>{{total}}</b></td>
          </tr>
        {{/each}}
      </tbody>
    </table>
  {{/each}}
</div>
<style>
  .report { font-family: Sarabun, sans-serif; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 12px; }
  th, td { border: 1px solid #ccc; padding: 4px 6px; font-size: 10px; text-align: center; }
  th { background: #f5f5f5; }
  h1 { font-size: 18px; } h2 { font-size: 14px; margin-top: 16px; }
</style>
```

Create `apps/api/src/modules/pdf/templates/monthly-purchases-report.hbs`:

```handlebars
<div class="report">
  <h1>รายงานรายการซื้อประจำเดือน</h1>
  <div class="meta">ประจำเดือน {{period.month}}/{{period.year}}</div>
  <table>
    <thead>
      <tr>
        <th>NO</th><th>แบบรถ</th><th>สี</th><th>แชชซี่ส์</th><th>เลขเครื่อง</th>
        <th>วันสั่งซื้อ</th><th>วันรับเข้า</th><th>รับจาก</th>
        <th>ก่อน VAT</th><th>VAT</th><th>รวม VAT</th>
        <th>ที่จอด</th><th>หมายเหตุ</th>
      </tr>
    </thead>
    <tbody>
      {{#each items}}
        <tr>
          <td>{{no}}</td><td>{{vehicleModelName}}</td><td>{{exteriorColor}}</td>
          <td>{{vin}}</td><td>{{engineNumber}}</td>
          <td>{{orderDate}}</td><td>{{arrivalDate}}</td><td>{{receivedFrom}}</td>
          <td class="n">{{priceNet}}</td><td class="n">{{priceVat}}</td><td class="n">{{priceGross}}</td>
          <td>{{parkingSlot}}</td><td>{{notes}}</td>
        </tr>
      {{/each}}
    </tbody>
    <tfoot>
      <tr><td colspan="8">รวม {{summary.totalVehicles}} คัน</td>
          <td class="n">{{summary.totalPriceNet}}</td>
          <td class="n">{{summary.totalPriceVat}}</td>
          <td class="n">{{summary.totalPriceGross}}</td>
          <td colspan="2"></td></tr>
    </tfoot>
  </table>
</div>
<style>
  .report { font-family: Sarabun, sans-serif; }
  table { width: 100%; border-collapse: collapse; font-size: 9px; }
  th, td { border: 1px solid #ccc; padding: 3px 4px; }
  th { background: #f5f5f5; }
  .n { text-align: right; }
</style>
```

- [ ] **Step 3: Add PDF service methods**

In `apps/api/src/modules/pdf/pdf.service.ts`, after the existing report PDF methods (~line 800), add:

```ts
public async generateDailyStockSnapshotPdf(data: unknown): Promise<Buffer> {
  return this.generatePdf(PdfTemplateType.DAILY_STOCK_SNAPSHOT, data, { landscape: true });
}

public async generateMonthlyPurchasesReportPdf(data: unknown): Promise<Buffer> {
  return this.generatePdf(PdfTemplateType.MONTHLY_PURCHASES_REPORT, data, { landscape: true });
}
```

- [ ] **Step 4: Add PDF controller routes**

In `apps/api/src/modules/pdf/pdf.controller.ts`, add (pattern-match existing report PDF routes):

```ts
.get('/daily-stock-snapshot', async ({ query, set }) => {
  const parsed = DailyStockSnapshotQuerySchema.parse(query);
  const date = new Date(parsed.date);
  const reportData = await reportsService.getDailyStockSnapshot({ date });

  // Transform pivot into template-friendly shape
  const panels = [
    { title: 'ยอดจองคงเหลือ', rows: reportData.models.map((m) => ({
      modelName: m.modelName,
      cells: reportData.colors.map((c) => m.reservationsByColor[c] || 0),
      total: m.reservationsTotal,
    }))},
    { title: 'สต๊อกคงเหลือ', rows: reportData.models.map((m) => ({
      modelName: m.modelName,
      cells: reportData.colors.map((c) => m.availableByColor[c] || 0),
      total: m.availableTotal,
    }))},
    { title: 'ยอดที่ต้องสั่งซื้อ', rows: reportData.models.map((m) => ({
      modelName: m.modelName,
      cells: reportData.colors.map((c) => m.requiredByColor[c] || 0),
      total: m.requiredTotal,
    }))},
  ];

  const pdf = await pdfService.generateDailyStockSnapshotPdf({
    date: reportData.date, colors: reportData.colors, panels,
  });
  set.headers['Content-Type'] = 'application/pdf';
  set.headers['Content-Disposition'] = `attachment; filename=daily-stock-snapshot-${parsed.date}.pdf`;
  return pdf;
}, { beforeHandle: authMiddleware })

.get('/monthly-purchases', async ({ query, set }) => {
  const parsed = MonthlyPurchasesQuerySchema.parse(query);
  const reportData = await reportsService.getMonthlyPurchasesReport({
    year: parsed.year, month: parsed.month, vehicleType: parsed.vehicleType,
  });
  const pdf = await pdfService.generateMonthlyPurchasesReportPdf({
    period: reportData.period,
    items: reportData.items.map((i) => ({
      ...i,
      orderDate: i.orderDate?.split('T')[0] ?? '-',
      arrivalDate: i.arrivalDate.split('T')[0],
    })),
    summary: reportData.summary,
  });
  set.headers['Content-Type'] = 'application/pdf';
  set.headers['Content-Disposition'] = `attachment; filename=monthly-purchases-${parsed.year}-${parsed.month}.pdf`;
  return pdf;
}, { beforeHandle: authMiddleware });
```

- [ ] **Step 5: Add client service methods + wire download buttons**

In `apps/web/src/services/report.service.ts`:

```ts
async getDailyStockSnapshotPdf(params: { date: string }): Promise<Blob> {
  const res = await apiClient.getBlob(`/pdf/daily-stock-snapshot?date=${encodeURIComponent(params.date)}`);
  return res;
},
async getMonthlyPurchasesReportPdf(params: { year: number; month: number; vehicleType?: VehicleType }): Promise<Blob> {
  const qs = new URLSearchParams({ year: String(params.year), month: String(params.month) });
  if (params.vehicleType) qs.append('vehicleType', params.vehicleType);
  return apiClient.getBlob(`/pdf/monthly-purchases?${qs.toString()}`);
},
```

(If `apiClient.getBlob` doesn't exist, add it matching how other PDF downloads are fetched — see `reportService.getPurchaseRequirementReportPdf` for the exact pattern.)

In both `DailyStockSnapshotPage.tsx` and `MonthlyPurchasesReportPage.tsx`, add a PDF button next to the Excel button:

```tsx
<button
  onClick={async () => {
    const blob = await reportService.getDailyStockSnapshotPdf({ date: snapshotDate });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `daily-stock-snapshot-${snapshotDate}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
    addToast('ดาวน์โหลด PDF สำเร็จ', 'success');
  }}
  className="bg-red-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-red-700"
>
  ดาวน์โหลด PDF
</button>
```

(Analogous button for the monthly purchases page.)

- [ ] **Step 6: Manual smoke test**

- Go to Daily Stock Snapshot, click PDF → confirm landscape A4 with 3 panels.
- Go to Monthly Purchases, click PDF → confirm landscape A4 with table + totals row.
- Open each page, click Excel → open workbook → confirm 3 sheets with landscape page setup.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/modules/pdf/ apps/web/src/services/report.service.ts apps/web/src/pages/reports/DailyStockSnapshotPage.tsx apps/web/src/pages/reports/MonthlyPurchasesReportPage.tsx
git commit -m "feat(reports): PDF support for daily snapshot and monthly purchases (landscape)"
```

---

## Final verification

- [ ] **Run the full test suite and build**

```bash
bun run typecheck && bun run lint && cd apps/api && bun test && cd ../.. && bun run build
```

Expected: all green.

- [ ] **Full end-to-end smoke test**

1. Log in.
2. Reports hub shows two new cards.
3. Open Daily Stock Snapshot → change date → data updates → export Excel → open workbook → 3 sheets, Thai sheet names, landscape page setup → export PDF → landscape A4.
4. Open Monthly Purchases → change year/month/vehicleType → data updates → export Excel → 3 sheets → export PDF → landscape A4.
5. Open existing Stock Report → new vehicleType filter works → new รับจาก column visible → export Excel → 3-sheet workbook with VAT split columns.
6. Open existing Sales Summary → vehicleType filter works → 3-sheet export.
7. Browser print preview on any report → A4 landscape.

- [ ] **Final commit (if any leftover formatting)**

```bash
bun run format
git add -A && git diff --staged --quiet || git commit -m "chore: format"
```
