# Monthly Campaign Claim Report — Advanced Filter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the ปี/เดือน (year/month) filter on the monthly campaign claim report (`/reports/campaign-claims`) with a custom start/end date range, and add an optional campaign filter, so the report can be narrowed to a single campaign and any date span instead of only a full calendar month.

**Architecture:** The date-range and campaign filters are applied as a Prisma `where` clause in `reports.service.ts::getCampaignClaimReport`, one layer above the existing `buildCampaignClaimReport()` builder (which stays untouched — it only ever sees an already-filtered sale list). Both the JSON endpoint and the PDF endpoint call the same service function, so filtering logic exists in exactly one place. The web page swaps its year/month state for two `<input type="date">` fields and adds a campaign `<select>`.

**Tech Stack:** ElysiaJS + Prisma (API), React + TanStack Query (web), Zod (shared schema).

## Global Constraints

- Query params on both `/api/reports/campaign-claims` and `/api/pdf/campaign-claims` change from `year`/`month`/`brand` to `startDate`/`endDate`/`brand`/`campaignId?` (breaking change — both known consumers are updated in this plan, no back-compat shim per project convention).
- Parse `startDate`/`endDate` as **local midnight** (`new Date(\`${dateStr}T00:00:00\`)`), never UTC — matches the existing month-boundary convention in this service and avoids the timezone-shift bug class already known in this codebase.
- `buildCampaignClaimReport()` (`apps/api/src/modules/reports/campaign-claim.helpers.ts`) is out of scope — do not modify it or its test file.
- No new automated test for the date-range/campaignId query filter — this codebase verifies this specific service function via a live smoke test against the OrbStack DB, not unit tests (the builder itself already has full unit coverage and is untouched). Task 6 is that live verification.

---

### Task 1: Shared schema + backend query (`getCampaignClaimReport`)

**Files:**
- Modify: `packages/shared/src/schemas/index.ts:712-728` (`CampaignClaimReportResponseSchema`)
- Modify: `apps/api/src/modules/reports/reports.service.ts:1678-1754` (`getCampaignClaimReport`)

**Interfaces:**
- Produces: `getCampaignClaimReport(params: { startDate: Date; endDate: Date; brand: string; campaignId?: string })` returning `{ period: { startDate: string; endDate: string }, brand: string, expenseColumns: string[], rows: ClaimRow[], summary: {...} }` — consumed by Task 2 (JSON controller) and Task 3 (PDF controller).

- [ ] **Step 1: Update the shared schema**

In `packages/shared/src/schemas/index.ts`, find `CampaignClaimReportResponseSchema` (around line 712):

```ts
export const CampaignClaimReportResponseSchema = z.object({
  period: z.object({
    year: z.number(),
    month: z.number(),
    startDate: z.string(),
    endDate: z.string(),
  }),
  brand: z.string(),
  // Distinct expense-line names (union across the month's sales), report columns.
  expenseColumns: z.array(z.string()),
  rows: z.array(CampaignClaimRowSchema),
  summary: z.object({
    totalCars: z.number(),
    columnTotals: z.array(z.number()), // aligned 1:1 to expenseColumns
    grandTotal: z.number(),
  }),
});
```

Replace the `period` field with:

```ts
export const CampaignClaimReportResponseSchema = z.object({
  period: z.object({
    startDate: z.string(),
    endDate: z.string(),
  }),
  brand: z.string(),
  // Distinct expense-line names (union across the month's sales), report columns.
  expenseColumns: z.array(z.string()),
  rows: z.array(CampaignClaimRowSchema),
  summary: z.object({
    totalCars: z.number(),
    columnTotals: z.array(z.number()), // aligned 1:1 to expenseColumns
    grandTotal: z.number(),
  }),
});
```

- [ ] **Step 2: Replace `getCampaignClaimReport`'s signature and query**

In `apps/api/src/modules/reports/reports.service.ts`, replace the entire function (currently lines 1678-1754):

```ts
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
      // Third branch covers stocked sales whose soldDate hasn't been stamped yet
      // (builder falls back to completedDate).
      OR: [
        { stock: { is: { soldDate: { gte: startDate, lt: endDate } } } },
        { stock: { is: null }, completedDate: { gte: startDate, lt: endDate } },
        {
          stock: { is: { soldDate: null } },
          completedDate: { gte: startDate, lt: endDate },
        },
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

  const report = buildCampaignClaimReport(brandSales);

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

with:

```ts
export async function getCampaignClaimReport(params: {
  startDate: Date;
  endDate: Date;
  brand: string;
  campaignId?: string;
}) {
  const { startDate, endDate, brand, campaignId } = params;
  // endDate is the last INCLUDED day; the query needs a half-open exclusive
  // upper bound at the start of the next day — same convention as monthly purchases.
  const endDateExclusive = new Date(
    endDate.getFullYear(),
    endDate.getMonth(),
    endDate.getDate() + 1,
    0,
    0,
    0,
    0
  );

  const vehicleModelSelect = {
    select: { id: true, brand: true, model: true, variant: true, price: true },
  } as const;

  const sales = await db.sale.findMany({
    where: {
      campaignId: campaignId ? campaignId : { not: null },
      status: { notIn: ['CANCELLED'] },
      // Third branch covers stocked sales whose soldDate hasn't been stamped yet
      // (builder falls back to completedDate).
      OR: [
        { stock: { is: { soldDate: { gte: startDate, lt: endDateExclusive } } } },
        { stock: { is: null }, completedDate: { gte: startDate, lt: endDateExclusive } },
        {
          stock: { is: { soldDate: null } },
          completedDate: { gte: startDate, lt: endDateExclusive },
        },
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

  const report = buildCampaignClaimReport(brandSales);

  return {
    period: {
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
    },
    brand,
    ...report,
  };
}
```

- [ ] **Step 3: Commit**

```bash
git add packages/shared/src/schemas/index.ts apps/api/src/modules/reports/reports.service.ts
git commit -m "feat(reports): campaign claim report accepts date range + campaign filter

Replaces year/month with startDate/endDate and adds an optional
campaignId to getCampaignClaimReport, one layer above the untouched
buildCampaignClaimReport builder."
```

---

### Task 2: JSON controller (`/api/reports/campaign-claims`)

**Files:**
- Modify: `apps/api/src/modules/reports/reports.controller.ts:777-822`

**Interfaces:**
- Consumes: `reportsService.getCampaignClaimReport({ startDate: Date; endDate: Date; brand: string; campaignId?: string })` from Task 1.
- Produces: `GET /api/reports/campaign-claims?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD&brand=X&campaignId=Y` — consumed by Task 4 (web service).

- [ ] **Step 1: Replace the route**

In `apps/api/src/modules/reports/reports.controller.ts`, replace the `/campaign-claims` GET route (currently lines 777-822):

```ts
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

with:

```ts
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

      const startDate = new Date(`${query.startDate}T00:00:00`);
      const endDate = new Date(`${query.endDate}T00:00:00`);
      if (isNaN(startDate.getTime()) || isNaN(endDate.getTime()) || startDate > endDate) {
        set.status = 400;
        return { success: false, error: 'BadRequest', message: 'startDate/endDate invalid' };
      }
      if (!query.brand) {
        set.status = 400;
        return { success: false, error: 'BadRequest', message: 'brand is required' };
      }

      const result = await reportsService.getCampaignClaimReport({
        startDate,
        endDate,
        brand: query.brand,
        campaignId: query.campaignId || undefined,
      });

      set.status = 200;
      return { success: true, data: result };
    },
    {
      beforeHandle: authMiddleware,
      query: t.Object({
        startDate: t.String(),
        endDate: t.String(),
        brand: t.String(),
        campaignId: t.Optional(t.String()),
      }),
      detail: {
        tags: ['Reports'],
        summary: 'Monthly campaign claim report',
        description:
          'Campaign claim rows for a date range, filtered by vehicle brand and optionally by campaign, in brand submission format',
      },
    }
  );
```

- [ ] **Step 2: Commit**

```bash
git add apps/api/src/modules/reports/reports.controller.ts
git commit -m "feat(reports): campaign-claims JSON endpoint takes startDate/endDate/campaignId"
```

---

### Task 3: PDF controller + template + type

**Files:**
- Modify: `apps/api/src/modules/pdf/types.ts:634-666` (`CampaignClaimReportData`)
- Modify: `apps/api/src/modules/pdf/pdf.controller.ts:1740-1830` (`/campaign-claims` GET)
- Modify: `apps/api/src/modules/pdf/templates/campaign-claim-monthly.hbs:19-21`

**Interfaces:**
- Consumes: `reportsService.getCampaignClaimReport(...)` from Task 1; `formatThaiDate(date, 'full')` from `apps/api/src/modules/pdf/helpers.ts` (already imported in `pdf.controller.ts`).
- Produces: `GET /api/pdf/campaign-claims?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD&brand=X&campaignId=Y` returning a PDF buffer — consumed by Task 4 (web service).

- [ ] **Step 1: Rename `monthLabel` to `periodLabel` in the PDF type**

In `apps/api/src/modules/pdf/types.ts`, in `CampaignClaimReportData` (around line 642):

```ts
  monthLabel: string; // e.g. 'พฤษภาคม 2569'
```

replace with:

```ts
  periodLabel: string; // e.g. '1 กรกฎาคม 2569 - 31 กรกฎาคม 2569'
```

- [ ] **Step 2: Replace the PDF controller route**

In `apps/api/src/modules/pdf/pdf.controller.ts`, replace the `/campaign-claims` GET route (currently lines 1740-1830, from the `// Monthly Campaign Claim Report PDF` comment through the closing `);`):

```ts
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
      const monthLabel = `${THAI_MONTHS[month - 1]} ${year + 543}`;

      const rows = report.rows.map((r) => ({
        no: r.no,
        customerName: r.customerName,
        modelName: r.modelName,
        engineNumber: r.engineNumber,
        vin: r.vin,
        financeProvider: r.financeProvider,
        saleDate: r.saleDate ? r.saleDate.toISOString() : null,
        notifyDate: r.notifyDate ? r.notifyDate.toISOString() : null,
        salePrice: r.salePrice,
        cells: r.cells,
        total: r.total,
      }));

      const pdfBuffer = await pdfService.generateCampaignClaimReportPdf({
        header,
        monthLabel,
        brand: report.brand,
        expenseColumns: report.expenseColumns,
        rows,
        summary: {
          totalCars: report.summary.totalCars,
          columnTotals: report.summary.columnTotals,
          grandTotal: report.summary.grandTotal,
        },
        printedAt: new Date().toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' }),
      });
      const safeBrand = query.brand.replace(/[^A-Za-z0-9_-]/g, '_');
      const baseName = `campaign-claims-${safeBrand}-${year}-${String(month).padStart(2, '0')}.pdf`;
      const utf8Name = encodeURIComponent(
        `campaign-claims-${query.brand}-${year}-${String(month).padStart(2, '0')}.pdf`
      );
      set.headers['Content-Type'] = 'application/pdf';
      set.headers['Content-Disposition'] =
        `attachment; filename="${baseName}"; filename*=UTF-8''${utf8Name}`;
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

with:

```ts
  // Monthly Campaign Claim Report PDF (brand submission form)
  .get(
    '/campaign-claims',
    async ({ query, set }) => {
      const startDate = new Date(`${query.startDate}T00:00:00`);
      const endDate = new Date(`${query.endDate}T00:00:00`);
      if (isNaN(startDate.getTime()) || isNaN(endDate.getTime()) || startDate > endDate) {
        set.status = 400;
        return 'Invalid startDate/endDate';
      }
      if (!query.brand) {
        set.status = 400;
        return 'brand is required';
      }

      const report = await reportsService.getCampaignClaimReport({
        startDate,
        endDate,
        brand: query.brand,
        campaignId: query.campaignId || undefined,
      });
      const header = await getCompanyHeader();
      if (!header.logoBase64) header.logoBase64 = pdfService.getLogoBase64();

      const periodLabel = `${formatThaiDate(startDate, 'full')} - ${formatThaiDate(endDate, 'full')}`;

      const rows = report.rows.map((r) => ({
        no: r.no,
        customerName: r.customerName,
        modelName: r.modelName,
        engineNumber: r.engineNumber,
        vin: r.vin,
        financeProvider: r.financeProvider,
        saleDate: r.saleDate ? r.saleDate.toISOString() : null,
        notifyDate: r.notifyDate ? r.notifyDate.toISOString() : null,
        salePrice: r.salePrice,
        cells: r.cells,
        total: r.total,
      }));

      const pdfBuffer = await pdfService.generateCampaignClaimReportPdf({
        header,
        periodLabel,
        brand: report.brand,
        expenseColumns: report.expenseColumns,
        rows,
        summary: {
          totalCars: report.summary.totalCars,
          columnTotals: report.summary.columnTotals,
          grandTotal: report.summary.grandTotal,
        },
        printedAt: new Date().toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' }),
      });
      const safeBrand = query.brand.replace(/[^A-Za-z0-9_-]/g, '_');
      const baseName = `campaign-claims-${safeBrand}-${query.startDate}_to_${query.endDate}.pdf`;
      const utf8Name = encodeURIComponent(
        `campaign-claims-${query.brand}-${query.startDate}_to_${query.endDate}.pdf`
      );
      set.headers['Content-Type'] = 'application/pdf';
      set.headers['Content-Disposition'] =
        `attachment; filename="${baseName}"; filename*=UTF-8''${utf8Name}`;
      return pdfBuffer;
    },
    {
      beforeHandle: [authMiddleware, requirePermission('CAMPAIGN_VIEW')],
      query: t.Object({
        startDate: t.String(),
        endDate: t.String(),
        brand: t.String(),
        campaignId: t.Optional(t.String()),
      }),
      detail: {
        tags: ['Documents'],
        summary: 'Generate Monthly Campaign Claim Report PDF',
      },
    }
  );
```

- [ ] **Step 3: Update the template title line**

In `apps/api/src/modules/pdf/templates/campaign-claim-monthly.hbs`, line 20:

```html
  รายงานเบิกแคมเปญเงินส่งเสริมการขายประจำเดือน {{monthLabel}}
```

replace with:

```html
  รายงานเบิกแคมเปญเงินส่งเสริมการขายประจำงวด {{periodLabel}}
```

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/modules/pdf/types.ts apps/api/src/modules/pdf/pdf.controller.ts apps/api/src/modules/pdf/templates/campaign-claim-monthly.hbs
git commit -m "feat(pdf): campaign claim PDF takes startDate/endDate/campaignId, shows period label"
```

---

### Task 4: Web service (`report.service.ts`)

**Files:**
- Modify: `apps/web/src/services/report.service.ts:285-315` (`getCampaignClaimReport`, `getCampaignClaimReportPdf`)

**Interfaces:**
- Consumes: `GET /api/reports/campaign-claims` and `GET /api/pdf/campaign-claims` from Tasks 2/3.
- Produces: `reportService.getCampaignClaimReport({ startDate: string; endDate: string; brand: string; campaignId?: string }): Promise<CampaignClaimReportResponse>` and `reportService.getCampaignClaimReportPdf(same params): Promise<Blob>` — consumed by Task 5 (web page). `startDate`/`endDate` are `YYYY-MM-DD` strings (native `<input type="date">` value format).

- [ ] **Step 1: Replace both methods**

In `apps/web/src/services/report.service.ts`, replace:

```ts
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
    const response = await api.get<ApiResponse<CampaignClaimReportResponse>>(url);
    if (!response.success || !response.data) {
      throw new Error(response.message || 'Failed to fetch campaign claim report');
    }
    return response.data;
  },

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
  },
```

with:

```ts
  async getCampaignClaimReport(params: {
    startDate: string;
    endDate: string;
    brand: string;
    campaignId?: string;
  }): Promise<CampaignClaimReportResponse> {
    const qs = new URLSearchParams({
      startDate: params.startDate,
      endDate: params.endDate,
      brand: params.brand,
    });
    if (params.campaignId) qs.set('campaignId', params.campaignId);
    const url = `/api/reports/campaign-claims?${qs.toString()}`;
    const response = await api.get<ApiResponse<CampaignClaimReportResponse>>(url);
    if (!response.success || !response.data) {
      throw new Error(response.message || 'Failed to fetch campaign claim report');
    }
    return response.data;
  },

  async getCampaignClaimReportPdf(params: {
    startDate: string;
    endDate: string;
    brand: string;
    campaignId?: string;
  }): Promise<Blob> {
    const qs = new URLSearchParams({
      startDate: params.startDate,
      endDate: params.endDate,
      brand: params.brand,
    });
    if (params.campaignId) qs.set('campaignId', params.campaignId);
    const url = `/api/pdf/campaign-claims?${qs.toString()}`;
    return api.getBlob(url);
  },
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/services/report.service.ts
git commit -m "feat(web): report service passes date range + campaignId for claim report"
```

---

### Task 5: Web page (`CampaignClaimReportPage.tsx`)

**Files:**
- Modify: `apps/web/src/pages/reports/CampaignClaimReportPage.tsx` (full file)

**Interfaces:**
- Consumes: `reportService.getCampaignClaimReport`/`getCampaignClaimReportPdf` from Task 4; `campaignService.getAll({ limit }): Promise<PaginatedResponse<Campaign>>` (`apps/web/src/services/campaign.service.ts`, unchanged) where `Campaign.vehicleModels: VehicleModelSummary[]` and each has `.brand: string`.

- [ ] **Step 1: Replace the whole file**

Replace the full contents of `apps/web/src/pages/reports/CampaignClaimReportPage.tsx` with:

```tsx
import type { CampaignClaimRow } from '@car-stock/shared/types';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { MainLayout } from '../../components/layout';
import { exportMultiSheet } from '../../components/reports/exportUtils';
import { useToast } from '../../components/toast';
import { campaignService } from '../../services/campaign.service';
import { reportService } from '../../services/report.service';
import { vehicleService } from '../../services/vehicle.service';

const fmt = (n: number | null | undefined): string =>
  n == null || n === 0 ? '' : n.toLocaleString('th-TH', { minimumFractionDigits: 2 });

const fmtDate = (iso: string | null): string => (iso ? iso.split('T')[0] : '');

const pad2 = (n: number): string => String(n).padStart(2, '0');
const toDateInputValue = (d: Date): string => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

export function CampaignClaimReportPage(): React.ReactElement {
  const { addToast } = useToast();
  const now = new Date();
  const [startDate, setStartDate] = useState(() =>
    toDateInputValue(new Date(now.getFullYear(), now.getMonth(), 1))
  );
  const [endDate, setEndDate] = useState(() =>
    toDateInputValue(new Date(now.getFullYear(), now.getMonth() + 1, 0))
  );
  const [brand, setBrand] = useState('');
  const [campaignId, setCampaignId] = useState('');

  const { data: vehiclePage } = useQuery({
    queryKey: ['vehicle-models-for-brands'],
    queryFn: () => vehicleService.getAll({ limit: 200 }),
  });
  const brands = useMemo(() => {
    const list = vehiclePage?.data?.map((v) => v.brand) ?? [];
    return [...new Set(list)].sort();
  }, [vehiclePage]);

  useEffect(() => {
    if (!brand && brands.length > 0) setBrand(brands[0]);
  }, [brand, brands]);

  const { data: campaignsPage } = useQuery({
    queryKey: ['campaigns-for-claim-filter'],
    queryFn: () => campaignService.getAll({ limit: 200 }),
  });
  const campaignOptions = useMemo(() => {
    const list = campaignsPage?.data ?? [];
    return list.filter((c) => c.vehicleModels.some((vm) => vm.brand === brand));
  }, [campaignsPage, brand]);

  // Selecting a brand can drop the previously chosen campaign out of the
  // (brand-scoped) option list — reset back to "ทั้งหมด" rather than keep an
  // invalid, invisible selection.
  useEffect(() => {
    if (campaignId && !campaignOptions.some((c) => c.id === campaignId)) {
      setCampaignId('');
    }
  }, [campaignId, campaignOptions]);

  const validRange = startDate <= endDate;

  const { data, isLoading, error } = useQuery({
    queryKey: ['campaign-claims', startDate, endDate, brand, campaignId],
    queryFn: () =>
      reportService.getCampaignClaimReport({
        startDate,
        endDate,
        brand,
        campaignId: campaignId || undefined,
      }),
    enabled: !!brand && validRange,
  });

  const handleExportExcel = () => {
    if (!data) return;
    const toRow = (r: CampaignClaimRow) => {
      const base: Record<string, string | number> = {
        ลำดับ: r.no,
        'ชื่อ - สกุล': r.customerName,
        แบบรถ: r.modelName,
        เลขเครื่อง: r.engineNumber,
        เลขตัวรถ: r.vin,
        ไฟแนนท์: r.financeProvider,
        วันที่ขาย: fmtDate(r.saleDate),
        ราคาขาย: r.salePrice,
      };
      data.expenseColumns.forEach((name, j) => {
        base[name] = r.cells[j] ?? '';
      });
      base['รวม/คัน'] = r.total;
      base.วันที่แจ้งขาย = fmtDate(r.notifyDate);
      return base;
    };
    try {
      exportMultiSheet({
        sheets: [{ name: 'เบิกแคมเปญ', data: data.rows.map(toRow) }],
        filename: `campaign-claims_${brand}_${startDate}_to_${endDate}`,
      });
      addToast('ดาวน์โหลด Excel สำเร็จ', 'success');
    } catch {
      addToast('ดาวน์โหลด Excel ไม่สำเร็จ', 'error');
    }
  };

  const handleDownloadPdf = async () => {
    try {
      const blob = await reportService.getCampaignClaimReportPdf({
        startDate,
        endDate,
        brand,
        campaignId: campaignId || undefined,
      });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `campaign-claims-${brand}-${startDate}_to_${endDate}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      addToast('ดาวน์โหลด PDF สำเร็จ', 'success');
    } catch {
      addToast('ดาวน์โหลด PDF ไม่สำเร็จ', 'error');
    }
  };

  const expenseColumns = data?.expenseColumns ?? [];

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
              <label className="text-sm font-medium">วันที่เริ่ม:</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="border border-gray-300 rounded-md px-3 py-1.5 text-sm"
              />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium">ถึงวันที่:</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="border border-gray-300 rounded-md px-3 py-1.5 text-sm"
              />
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
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium">แคมเปญ:</label>
              <select
                value={campaignId}
                onChange={(e) => setCampaignId(e.target.value)}
                className="border border-gray-300 rounded-md px-3 py-1.5 text-sm"
              >
                <option value="">ทั้งหมด</option>
                {campaignOptions.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
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

        {!validRange && (
          <div className="p-6 text-red-600">ช่วงวันที่ไม่ถูกต้อง: วันที่เริ่มต้องไม่เกินวันที่สิ้นสุด</div>
        )}
        {validRange && isLoading && <div className="p-6 animate-pulse">กำลังโหลด...</div>}
        {validRange && error != null && <div className="p-6 text-red-600">ไม่สามารถโหลดรายงานได้</div>}

        {validRange && data && (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
              <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
                <p className="text-sm text-blue-600 font-medium">จำนวนรถ</p>
                <p className="text-2xl font-bold text-blue-900">{data.summary.totalCars}</p>
              </div>
              <div className="bg-emerald-50 rounded-lg p-4 border border-emerald-200">
                <p className="text-sm text-emerald-600 font-medium">ยอดเบิกรวมทั้งสิ้น</p>
                <p className="text-2xl font-bold text-emerald-900">
                  {data.summary.grandTotal.toLocaleString('th-TH', { minimumFractionDigits: 2 })}
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
                      'ราคาขาย',
                    ].map((h) => (
                      <th key={h} className="px-2 py-2 text-left font-medium whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                    {expenseColumns.map((h) => (
                      <th key={h} className="px-2 py-2 text-right font-medium whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                    <th className="px-2 py-2 text-right font-medium whitespace-nowrap">รวม/คัน</th>
                    <th className="px-2 py-2 text-left font-medium whitespace-nowrap">วันที่แจ้งขาย</th>
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
                      <td className="px-2 py-1 text-right">{fmt(r.salePrice)}</td>
                      {r.cells.map((c, j) => (
                        <td key={expenseColumns[j]} className="px-2 py-1 text-right">
                          {fmt(c)}
                        </td>
                      ))}
                      <td className="px-2 py-1 text-right font-semibold">{fmt(r.total)}</td>
                      <td className="px-2 py-1">{fmtDate(r.notifyDate)}</td>
                    </tr>
                  ))}
                  {data.rows.length === 0 && (
                    <tr>
                      <td
                        colSpan={10 + expenseColumns.length}
                        className="px-2 py-6 text-center text-gray-500"
                      >
                        ไม่มีรายการเบิกแคมเปญในเดือนนี้
                      </td>
                    </tr>
                  )}
                  {data.rows.length > 0 && (
                    <tr className="bg-gray-50 font-semibold">
                      <td className="px-2 py-2" colSpan={8}>
                        รวมทั้งสิ้น ({data.summary.totalCars} คัน)
                      </td>
                      {data.summary.columnTotals.map((t, j) => (
                        <td key={expenseColumns[j]} className="px-2 py-2 text-right">
                          {fmt(t)}
                        </td>
                      ))}
                      <td className="px-2 py-2 text-right">{fmt(data.summary.grandTotal)}</td>
                      <td className="px-2 py-2" />
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-gray-500 mt-2">
              หมายเหตุ: คอลัมน์ค่าใช้จ่ายมาจากรายการที่ตั้งไว้ในแต่ละรุ่นของแคมเปญ; คันที่รุ่นไม่มีรายการนั้นจะเว้นว่าง
            </p>
          </>
        )}
      </div>
    </MainLayout>
  );
}
```

Note what changed from the original: `MONTH_NAMES_TH` constant removed (no longer used), `year`/`month` state replaced by `startDate`/`endDate` string state + `toDateInputValue`/`pad2` helpers, `campaignId` state + `campaignsPage` query + `campaignOptions` filter + the campaign-reset `useEffect` added, `validRange` guard added around the data-dependent blocks, the ปี/เดือน inputs replaced with two date inputs and a แคมเปญ select, and every call into `reportService`/`exportMultiSheet`/filenames updated to use `startDate`/`endDate`/`campaignId` instead of `year`/`month`.

- [ ] **Step 2: Typecheck the web app**

Run: `cd apps/web && bun run typecheck`
Expected: no errors referencing `CampaignClaimReportPage.tsx`, `report.service.ts`, or the shared `CampaignClaimReportResponse` type.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/pages/reports/CampaignClaimReportPage.tsx
git commit -m "feat(web): campaign claim report page gets date-range + campaign filters"
```

---

### Task 6: Live verification (OrbStack smoke test)

**Files:** none (verification only).

**Interfaces:** none produced — this task only confirms Tasks 1-5 work end-to-end against a real database, following this codebase's existing convention of live-testing this specific report instead of unit-testing the query layer.

- [ ] **Step 1: Start the stack**

```bash
orb start
docker ps --format '{{.Names}}\t{{.Status}}'
```
Expected: `car-stock-db` is `Up`.

- [ ] **Step 2: Run the API from source against the real DB**

Get the DB container IP and run the API on a scratch port (adjust the IP to what `docker inspect` returns):

```bash
docker inspect car-stock-db --format '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}'
DATABASE_URL='postgresql://postgres:postgres@<DB_IP>:5432/car_stock?schema=public' JWT_SECRET=x PORT=3099 CORS_ORIGIN='*' PDF_ASSETS_DIR="$PWD/apps/api/src/modules/pdf" bun run apps/api/src/index.ts
```

- [ ] **Step 3: Mint an admin JWT for a real user ID**

Find a real user ID (e.g. `db.user.findFirst()` via Prisma Studio, or reuse one seen in existing campaign `createdById` fields), then sign a token with the same `JWT_SECRET=x`:

```bash
bun -e '
const crypto = require("crypto");
function base64url(input) {
  return Buffer.from(input).toString("base64").replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
}
const header = { alg: "HS256", typ: "JWT" };
const now = Math.floor(Date.now()/1000);
const payload = { sub: "<REAL_USER_ID>", username: "admin", role: "ADMIN", exp: now + 6*3600, iat: now };
const h = base64url(JSON.stringify(header));
const p = base64url(JSON.stringify(payload));
const data = h + "." + p;
const sig = crypto.createHmac("sha256","x").update(data).digest("base64").replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
console.log(data + "." + sig);
'
```

- [ ] **Step 4: Verify the JSON endpoint with a custom date range**

```bash
TOKEN="<token from step 3>"
curl -s -H "Authorization: Bearer $TOKEN" \
  "http://localhost:3099/api/reports/campaign-claims?startDate=2026-07-01&endDate=2026-07-15&brand=<A_REAL_BRAND>" | python3 -m json.tool
```
Expected: `success: true`, `period.startDate`/`period.endDate` echo back the requested range (no `year`/`month` fields), and `rows` only include sales within that 15-day window.

- [ ] **Step 5: Verify the `campaignId` filter narrows correctly**

```bash
curl -s -H "Authorization: Bearer $TOKEN" \
  "http://localhost:3099/api/reports/campaign-claims?startDate=2026-01-01&endDate=2026-12-31&brand=<A_REAL_BRAND>&campaignId=<A_REAL_CAMPAIGN_ID>" | python3 -m json.tool
```
Expected: every row's underlying sale belongs to that campaign only (cross-check against the unfiltered response from Step 4 covering a wider range — the filtered response's row count must be ≤ the unfiltered one, and `expenseColumns` must match only that campaign's configured expense-line names for the matching vehicle model).

- [ ] **Step 6: Verify the PDF endpoint renders the period label**

```bash
curl -s -H "Authorization: Bearer $TOKEN" \
  "http://localhost:3099/api/pdf/campaign-claims?startDate=2026-07-01&endDate=2026-07-15&brand=<A_REAL_BRAND>" \
  -o /tmp/claim-report-verify.pdf -w "HTTP %{http_code}, size %{size_download} bytes\n"
```
Expected: `HTTP 200`; open the PDF (e.g. via the Read tool) and confirm the title reads "...ประจำงวด 1 กรกฎาคม 2569 - 15 กรกฎาคม 2569" (not the old "ประจำเดือน" + month-name form), and totals match Step 4's JSON.

- [ ] **Step 7: Kill the scratch API**

```bash
lsof -ti tcp:3099 | xargs -r kill -9
```

- [ ] **Step 8: Manual web check**

Temporarily point `apps/web/vite.config.ts`'s proxy target at `http://localhost:3099/` (only while the scratch API from Step 2 is running), start `bun run dev` in `apps/web`, log in, open `/reports/campaign-claims`, and confirm: the page defaults to the current month's first/last day, the แคมเปญ dropdown lists only campaigns matching the selected brand, changing the campaign or either date narrows the table, and downloading the PDF produces the same filtered data. Revert the `vite.config.ts` proxy target back to `http://localhost:3001/` afterward — **do not commit the temporary proxy change.**
