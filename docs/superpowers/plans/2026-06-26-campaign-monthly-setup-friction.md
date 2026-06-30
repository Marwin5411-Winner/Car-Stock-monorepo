# #1 — Monthly campaign-setup friction — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cut repetition in monthly campaign setup with a branch (สาขา) label, a server-side duplicate that clones models + formulas with next-month dates, and bulk model-selection in the form.

**Architecture:** Three independent levers. Branch is a nullable scalar plumbed through schema → API → web. Duplicate is a transactional clone endpoint built on two pure, unit-tested helpers (`shiftToNextMonth`, `buildClonedCampaign`). Bulk-select is web-only state logic on the existing form.

**Tech Stack:** Prisma/PostgreSQL, ElysiaJS (`t.Object` request validation), Bun test, React 19 + TanStack Query, Tailwind, shared Zod schemas.

## Global Constraints

- Branch is a **label only** — no per-branch filtering of sales/reports, no permissions, no `Branch` entity. Free text, nullable; empty string normalises to null/undefined.
- Duplicate must copy **both** `CampaignVehicleModel` rows **and** their `CampaignModelFormula` rows; the source campaign is never modified; the copy is `status = DRAFT`, name = source name + `' (สำเนา)'`, dates shifted +1 month.
- `shiftToNextMonth`: add one month to each date using **UTC** date parts (avoid the UTC-vs-local-midnight off-by-one); clamp the day to the target month's last day; year rolls over.
- `FormulaOperator` ∈ {ADD, SUBTRACT, MULTIPLY, PERCENT, PERCENT_SUBTRACT, FIXED}; `FormulaPriceTarget` ∈ {COST_PRICE, SELLING_PRICE}.
- Edit route is `/campaigns/:id/edit`; duplicate navigates there for the new id.
- Do not touch the formula engine, claim report, `applyLoadedFormulas`, or sales/reports.
- Biome: single quotes, semicolons, 2-space indent, 100-char width. Thai UI strings.
- `apps/api` full `tsc --noEmit` OOMs — verify API code with `bun test` + `bunx prisma generate`; verify web with `cd apps/web && bunx tsc -b`.

---

## File Structure

- **Create** `apps/api/src/modules/campaigns/campaign-duplicate.helpers.ts` — pure `shiftToNextMonth` + `buildClonedCampaign`.
- **Create** `apps/api/src/__tests__/campaign-duplicate.helpers.test.ts` — unit tests for both.
- **Modify** `apps/api/prisma/schema.prisma` — `Campaign.branch String?`.
- **Create** `apps/api/prisma/migrations/<ts>_campaign_branch/migration.sql` — add column.
- **Modify** `packages/shared/src/schemas/index.ts` — `branch` on Campaign/Create schemas.
- **Modify** `apps/api/src/modules/campaigns/campaigns.service.ts` — branch in create type + getAll filter + `getBranches()` + `duplicate()`.
- **Modify** `apps/api/src/modules/campaigns/campaigns.controller.ts` — branch in create/update `t.Object`; `GET /branches`; `POST /:id/duplicate`.
- **Modify** `apps/web/src/services/campaign.service.ts` — branch on types, `CampaignFilters.branch`, `getAll` passes branch, `getBranches()`, `duplicate()`.
- **Modify** `apps/web/src/pages/campaigns/CampaignFormPage.tsx` — branch input + datalist; bulk-select + search.
- **Modify** `apps/web/src/pages/campaigns/CampaignsListPage.tsx` — branch column + filter + duplicate action.
- **Modify** `apps/web/src/pages/campaigns/CampaignDetailPage.tsx` — branch display + duplicate button.

---

## Task 1: Branch field — schema, API, shared types, web service

**Files:**
- Modify: `apps/api/prisma/schema.prisma` (Campaign model, ~line 345)
- Create: `apps/api/prisma/migrations/<timestamp>_campaign_branch/migration.sql`
- Modify: `packages/shared/src/schemas/index.ts:502-523`
- Modify: `apps/api/src/modules/campaigns/campaigns.service.ts` (CreateCampaignData type, `getAll`, add `getBranches`)
- Modify: `apps/api/src/modules/campaigns/campaigns.controller.ts` (create/update body, add `GET /branches`)
- Modify: `apps/web/src/services/campaign.service.ts`

**Interfaces:**
- Produces: `Campaign.branch String?` (DB); `campaignsService.getAll(page, limit, search?, branch?)`; `campaignsService.getBranches(): Promise<string[]>`; web `campaignService.getBranches(): Promise<string[]>`; `CampaignFilters.branch?: string`; `Campaign.branch?: string` and `CreateCampaignData.branch?`/`UpdateCampaignData.branch?` (web).

- [ ] **Step 1: Add the schema field**

In `apps/api/prisma/schema.prisma`, in `model Campaign`, add after the `notes String?` line:

```prisma
  branch        String?                @map("branch")
```

- [ ] **Step 2: Hand-author the migration + sync local dev DB + regenerate client**

The remote DB in `.env` is usually down and local migration history is inconsistent (prior features used `db push`), so author the migration file for prod and push the column to the local OrbStack DB for dev. Create `apps/api/prisma/migrations/20260626120000_campaign_branch/migration.sql`:

```sql
-- Add nullable branch label to campaigns
ALTER TABLE "campaigns" ADD COLUMN "branch" TEXT;
```

Then, with the local DB up (`orb start`; DB at `192.168.107.4`, postgres/postgres/car_stock — see the local-smoke-test note):

Run: `cd apps/api && DATABASE_URL='postgresql://postgres:postgres@192.168.107.4:5432/car_stock?schema=public' bunx prisma db push && bunx prisma generate`
Expected: `db push` reports the column added; `generate` succeeds. (Prod gets this via `prisma migrate deploy` later — carry that caveat.)

If the local DB is unreachable, still run `cd apps/api && bunx prisma generate` (works offline) so the client types include `branch`, and report the push as blocked-pending.

- [ ] **Step 3: Add `branch` to the shared Zod schemas**

In `packages/shared/src/schemas/index.ts`, add `branch` to `CampaignSchema` (after `notes`):

```ts
  notes: z.string().nullable(),
  branch: z.string().nullable(),
```

and to `CreateCampaignSchema` (after `notes`):

```ts
  notes: z.string().optional(),
  branch: z.string().trim().max(100).optional(),
```

(`UpdateCampaignSchema` is `CreateCampaignSchema.partial()` — inherits it.)

- [ ] **Step 4: Add `branch` to the API create body + a `GET /branches` route**

In `apps/api/src/modules/campaigns/campaigns.controller.ts`, in the `.post('/')` body `t.Object` (~line 297), add after `notes`:

```ts
        notes: t.Optional(t.String()),
        branch: t.Optional(t.String()),
```

Add the same `branch: t.Optional(t.String())` line to the `.put('/:id')` body `t.Object`. (`...body` already flows both into the service.)

Add a branches route just before the `.post('/')` create route (a GET needs no special permission beyond auth — match the existing list route's `beforeHandle: [authMiddleware]`):

```ts
  .get(
    '/branches',
    async () => {
      const branches = await campaignsService.getBranches();
      return { success: true, data: branches };
    },
    {
      beforeHandle: [authMiddleware],
      detail: { tags: ['Campaigns'], summary: 'Distinct campaign branch labels' },
    }
  )
```

Note: register `/branches` **before** any `/:id` GET route so it is not captured as an id.

- [ ] **Step 5: Branch in the service — create type, getAll filter, getBranches**

In `apps/api/src/modules/campaigns/campaigns.service.ts`:

(a) Add `branch?: string | null` to the `CreateCampaignData` type (the interface/type whose fields are spread into `db.campaign.create`). The `...campaignData` spread already persists it.

(b) Extend `getAll` to filter by branch. Change the signature and `where`:

```ts
  async getAll(page: number = 1, limit: number = 20, search?: string, branch?: string) {
    const skip = (page - 1) * limit;
    const where: Prisma.CampaignWhereInput = {
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
              { description: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
      ...(branch ? { branch } : {}),
    };
```

(Leave the rest of `getAll` unchanged; `branch` is a scalar already returned.)

(c) Add a `getBranches` method (place it after `getAll`):

```ts
  /** Distinct, non-empty branch labels across all campaigns, sorted. */
  async getBranches(): Promise<string[]> {
    const rows = await db.campaign.findMany({
      where: { branch: { not: null } },
      distinct: ['branch'],
      select: { branch: true },
      orderBy: { branch: 'asc' },
    });
    return rows
      .map((r) => r.branch)
      .filter((b): b is string => !!b && b.trim().length > 0);
  }
```

Wire the list controller to pass branch: in the `.get('/')` list route handler, read `query.branch` and pass it as the 4th arg to `campaignsService.getAll(page, limit, search, query.branch)`, and add `branch: t.Optional(t.String())` to that route's `query` `t.Object` (alongside the existing `search`/`page`/`limit`).

- [ ] **Step 6: Branch on the web service types + getBranches**

In `apps/web/src/services/campaign.service.ts`:

(a) Add `branch?: string;` to the `Campaign` interface (after `notes`), to `CreateCampaignData`, and to `UpdateCampaignData`.

(b) Add `branch?: string;` to `CampaignFilters`.

(c) In `getAll`, include `branch` in the query params it forwards (it already forwards `search`/`page`/`limit` — add `branch` the same way).

(d) Add a method:

```ts
  async getBranches(): Promise<string[]> {
    const res = await api.get<ApiResponse<string[]>>('/campaigns/branches');
    return res.data;
  }
```

(Match the exact `api` call style used by neighbouring methods — e.g. `getActiveCampaigns`.)

- [ ] **Step 7: Verify**

Run: `cd apps/api && bun test` → expect no new failures (pre-existing DB-integration suites may fail on network; unrelated).
Run: `cd apps/web && bunx tsc -b` → expect exit 0.
Run: `cd apps/api && bunx prisma generate` → succeeds (client has `branch`).

- [ ] **Step 8: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations packages/shared/src/schemas/index.ts \
        apps/api/src/modules/campaigns/campaigns.service.ts apps/api/src/modules/campaigns/campaigns.controller.ts \
        apps/web/src/services/campaign.service.ts
git commit -m "feat(campaigns): branch (สาขา) label on campaigns + distinct-branches endpoint"
```

---

## Task 2: Branch in the UI — form input, list column + filter, detail display

**Files:**
- Modify: `apps/web/src/pages/campaigns/CampaignFormPage.tsx`
- Modify: `apps/web/src/pages/campaigns/CampaignsListPage.tsx`
- Modify: `apps/web/src/pages/campaigns/CampaignDetailPage.tsx`

**Interfaces:**
- Consumes: `campaignService.getBranches()`, `CampaignFilters.branch`, `Campaign.branch` (Task 1).

- [ ] **Step 1: Form — branch state + input with datalist**

In `CampaignFormPage.tsx`:

(a) Add `branch: ''` to the `useState` `formData` initial object (after `notes`).

(b) In the edit-init `useEffect`, add `branch: campaign.branch || ''` to the `setFormData` object.

(c) In `handleSubmit`'s `data` object, add `branch: formData.branch.trim() || undefined,` (after `notes`).

(d) Fetch branch suggestions near the other queries:

```tsx
  const { data: branchOptions = [] } = useQuery({
    queryKey: ['campaign-branches'],
    queryFn: () => campaignService.getBranches(),
  });
```

(e) Add the input in the form's general-info card (next to the `notes`/`description` fields). Use a `<datalist>`:

```tsx
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">สาขา</label>
              <input
                type="text"
                list="campaign-branch-options"
                value={formData.branch}
                onChange={(e) => setFormData({ ...formData, branch: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="เช่น สำนักงานใหญ่"
              />
              <datalist id="campaign-branch-options">
                {branchOptions.map((b) => (
                  <option key={b} value={b} />
                ))}
              </datalist>
            </div>
```

- [ ] **Step 2: List — branch column + filter dropdown**

In `CampaignsListPage.tsx`:

(a) Add branch filter state: `const [branchFilter, setBranchFilter] = useState('');` and fetch options:

```tsx
  const { data: branchOptions = [] } = useQuery({
    queryKey: ['campaign-branches'],
    queryFn: () => campaignService.getBranches(),
  });
```

(b) Pass `branch` into the query: change the `useQuery` to
`queryKey: ['campaigns', page, search, branchFilter]` and
`queryFn: () => campaignService.getAll({ page, limit: 20, search, branch: branchFilter || undefined })`.

(c) Add a `<select>` next to the search input bound to `branchFilter` (reset `page` to 1 on change):

```tsx
              <select
                value={branchFilter}
                onChange={(e) => { setBranchFilter(e.target.value); setPage(1); }}
                className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">ทุกสาขา</option>
                {branchOptions.map((b) => (
                  <option key={b} value={b}>{b}</option>
                ))}
              </select>
```

(d) Add a `สาขา` column: a `<th>` in the header row and a `<td>` in the body row rendering `{campaign.branch || '-'}` (match the existing cell classes, e.g. `className="px-6 py-4 whitespace-nowrap text-sm text-gray-600"`).

- [ ] **Step 3: Detail — show branch**

In `CampaignDetailPage.tsx`, in the campaign meta/info block (near where `notes`/`startDate` render), add a labelled line shown only when present:

```tsx
                {campaign.branch && (
                  <div>
                    <span className="text-gray-500">สาขา</span>
                    <p className="text-gray-900 mt-1">{campaign.branch}</p>
                  </div>
                )}
```

(Match the surrounding markup/classes of the adjacent fields.)

- [ ] **Step 4: Verify**

Run: `cd apps/web && bunx tsc -b` → exit 0.
Manual: in the running app, create/edit a campaign with a branch; confirm it saves, the datalist shows prior values, the list shows the column and the filter narrows results, and the detail page shows the branch.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/pages/campaigns/CampaignFormPage.tsx apps/web/src/pages/campaigns/CampaignsListPage.tsx apps/web/src/pages/campaigns/CampaignDetailPage.tsx
git commit -m "feat(campaigns): สาขา field in form (datalist), list column+filter, detail"
```

---

## Task 3: Duplicate pure helpers — `shiftToNextMonth` + `buildClonedCampaign` (TDD)

**Files:**
- Create: `apps/api/src/modules/campaigns/campaign-duplicate.helpers.ts`
- Test: `apps/api/src/__tests__/campaign-duplicate.helpers.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export function shiftToNextMonth(start: Date, end: Date): { startDate: Date; endDate: Date };

  export interface CloneSourceFormula {
    vehicleModelId: string;
    name: string;
    operator: FormulaOperator;
    value: number;
    priceTarget: FormulaPriceTarget;
    sortOrder: number;
  }
  export interface CloneSource {
    name: string;
    description: string | null;
    branch: string | null;
    notes: string | null;
    startDate: Date;
    endDate: Date;
    vehicleModelIds: string[];
    formulas: CloneSourceFormula[];
  }
  export interface ClonedCampaign {
    name: string;
    description: string | null;
    branch: string | null;
    notes: string | null;
    status: 'DRAFT';
    startDate: Date;
    endDate: Date;
    vehicleModelIds: string[];
    formulas: CloneSourceFormula[];
  }
  export function buildClonedCampaign(source: CloneSource): ClonedCampaign;
  ```

- [ ] **Step 1: Write the failing tests**

Create `apps/api/src/__tests__/campaign-duplicate.helpers.test.ts`:

```ts
import { describe, expect, it } from 'bun:test';
import {
  shiftToNextMonth,
  buildClonedCampaign,
  type CloneSource,
} from '../modules/campaigns/campaign-duplicate.helpers';

const iso = (d: Date) => d.toISOString().slice(0, 10);

describe('shiftToNextMonth', () => {
  it('adds one month keeping the day-of-month', () => {
    const r = shiftToNextMonth(new Date(Date.UTC(2026, 5, 1)), new Date(Date.UTC(2026, 5, 30)));
    expect(iso(r.startDate)).toBe('2026-07-01');
    expect(iso(r.endDate)).toBe('2026-07-30');
  });

  it('clamps the day to the target month length (Jan 31 -> Feb 28 non-leap)', () => {
    const r = shiftToNextMonth(new Date(Date.UTC(2026, 0, 31)), new Date(Date.UTC(2026, 0, 31)));
    expect(iso(r.startDate)).toBe('2026-02-28');
    expect(iso(r.endDate)).toBe('2026-02-28');
  });

  it('clamps to Feb 29 in a leap year', () => {
    const r = shiftToNextMonth(new Date(Date.UTC(2024, 0, 31)), new Date(Date.UTC(2024, 0, 31)));
    expect(iso(r.startDate)).toBe('2024-02-29');
  });

  it('rolls the year over for December', () => {
    const r = shiftToNextMonth(new Date(Date.UTC(2026, 11, 15)), new Date(Date.UTC(2026, 11, 20)));
    expect(iso(r.startDate)).toBe('2027-01-15');
    expect(iso(r.endDate)).toBe('2027-01-20');
  });
});

describe('buildClonedCampaign', () => {
  const source: CloneSource = {
    name: 'โปรเดือนมิถุนา',
    description: 'desc',
    branch: 'สำนักงานใหญ่',
    notes: 'note',
    startDate: new Date(Date.UTC(2026, 5, 1)),
    endDate: new Date(Date.UTC(2026, 5, 30)),
    vehicleModelIds: ['m1', 'm2'],
    formulas: [
      { vehicleModelId: 'm1', name: 'ลด 2%', operator: 'PERCENT', value: 2, priceTarget: 'COST_PRICE', sortOrder: 0 },
      { vehicleModelId: 'm2', name: 'แถม', operator: 'FIXED', value: 20000, priceTarget: 'SELLING_PRICE', sortOrder: 1 },
    ],
  };

  it('suffixes the name, resets to DRAFT, and shifts dates to next month', () => {
    const c = buildClonedCampaign(source);
    expect(c.name).toBe('โปรเดือนมิถุนา (สำเนา)');
    expect(c.status).toBe('DRAFT');
    expect(iso(c.startDate)).toBe('2026-07-01');
    expect(iso(c.endDate)).toBe('2026-07-30');
  });

  it('copies branch, notes, description, models, and all formulas verbatim', () => {
    const c = buildClonedCampaign(source);
    expect(c.branch).toBe('สำนักงานใหญ่');
    expect(c.notes).toBe('note');
    expect(c.description).toBe('desc');
    expect(c.vehicleModelIds).toEqual(['m1', 'm2']);
    expect(c.formulas).toEqual(source.formulas);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd apps/api && bun test src/__tests__/campaign-duplicate.helpers.test.ts`
Expected: FAIL — module/exports not found.

- [ ] **Step 3: Implement the helpers**

Create `apps/api/src/modules/campaigns/campaign-duplicate.helpers.ts`:

```ts
import type { FormulaOperator, FormulaPriceTarget } from '@prisma/client';

/** Add one month to a date using UTC parts, clamping the day to the target
 * month's last day (avoids the UTC-vs-local-midnight off-by-one). */
function addOneMonthClampedUTC(d: Date): Date {
  const year = d.getUTCFullYear();
  const monthAbs = d.getUTCMonth() + 1; // 0-11 -> next month (may be 12)
  const targetYear = year + Math.floor(monthAbs / 12);
  const targetMonth = monthAbs % 12;
  const lastDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  const day = Math.min(d.getUTCDate(), lastDay);
  return new Date(Date.UTC(targetYear, targetMonth, day));
}

export function shiftToNextMonth(start: Date, end: Date): { startDate: Date; endDate: Date } {
  return { startDate: addOneMonthClampedUTC(start), endDate: addOneMonthClampedUTC(end) };
}

export interface CloneSourceFormula {
  vehicleModelId: string;
  name: string;
  operator: FormulaOperator;
  value: number;
  priceTarget: FormulaPriceTarget;
  sortOrder: number;
}

export interface CloneSource {
  name: string;
  description: string | null;
  branch: string | null;
  notes: string | null;
  startDate: Date;
  endDate: Date;
  vehicleModelIds: string[];
  formulas: CloneSourceFormula[];
}

export interface ClonedCampaign {
  name: string;
  description: string | null;
  branch: string | null;
  notes: string | null;
  status: 'DRAFT';
  startDate: Date;
  endDate: Date;
  vehicleModelIds: string[];
  formulas: CloneSourceFormula[];
}

/** Pure transform: source campaign -> the data for its duplicate. */
export function buildClonedCampaign(source: CloneSource): ClonedCampaign {
  const { startDate, endDate } = shiftToNextMonth(source.startDate, source.endDate);
  return {
    name: `${source.name} (สำเนา)`,
    description: source.description,
    branch: source.branch,
    notes: source.notes,
    status: 'DRAFT',
    startDate,
    endDate,
    vehicleModelIds: [...source.vehicleModelIds],
    formulas: source.formulas.map((f) => ({ ...f })),
  };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd apps/api && bun test src/__tests__/campaign-duplicate.helpers.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/campaigns/campaign-duplicate.helpers.ts apps/api/src/__tests__/campaign-duplicate.helpers.test.ts
git commit -m "feat(campaigns): pure shiftToNextMonth + buildClonedCampaign helpers (TDD)"
```

---

## Task 4: Duplicate endpoint — service, controller, web service

**Files:**
- Modify: `apps/api/src/modules/campaigns/campaigns.service.ts` (add `duplicate`)
- Modify: `apps/api/src/modules/campaigns/campaigns.controller.ts` (add `POST /:id/duplicate`)
- Modify: `apps/web/src/services/campaign.service.ts` (add `duplicate`)

**Interfaces:**
- Consumes: `buildClonedCampaign`, `CloneSource`, `CloneSourceFormula` (Task 3); branch plumbing (Task 1).
- Produces: `campaignsService.duplicate(id: string, userId: string)`; `POST /campaigns/:id/duplicate`; web `campaignService.duplicate(id: string): Promise<Campaign>`.

- [ ] **Step 1: Service `duplicate` method**

In `apps/api/src/modules/campaigns/campaigns.service.ts`, import the helpers at the top:

```ts
import { buildClonedCampaign, type CloneSource } from './campaign-duplicate.helpers';
```

Add the method (after `create`):

```ts
  /** Clone a campaign (models + formulas), next-month dates, status DRAFT. */
  async duplicate(id: string, userId: string) {
    const source = await db.campaign.findUnique({
      where: { id },
      include: {
        vehicleModels: { include: { formulas: true } },
      },
    });
    if (!source) throw new NotFoundError('ไม่พบแคมเปญ');

    const cloneSource: CloneSource = {
      name: source.name,
      description: source.description,
      branch: source.branch,
      notes: source.notes,
      startDate: source.startDate,
      endDate: source.endDate,
      vehicleModelIds: source.vehicleModels.map((vm) => vm.vehicleModelId),
      formulas: source.vehicleModels.flatMap((vm) =>
        vm.formulas.map((f) => ({
          vehicleModelId: f.vehicleModelId,
          name: f.name,
          operator: f.operator,
          value: Number(f.value),
          priceTarget: f.priceTarget,
          sortOrder: f.sortOrder,
        }))
      ),
    };

    const cloned = buildClonedCampaign(cloneSource);

    const created = await db.$transaction(async (tx) => {
      const campaign = await tx.campaign.create({
        data: {
          name: cloned.name,
          description: cloned.description,
          branch: cloned.branch,
          notes: cloned.notes,
          status: cloned.status,
          startDate: cloned.startDate,
          endDate: cloned.endDate,
          createdById: userId,
          vehicleModels: {
            create: cloned.vehicleModelIds.map((vehicleModelId) => ({ vehicleModelId })),
          },
        },
      });
      if (cloned.formulas.length) {
        await tx.campaignModelFormula.createMany({
          data: cloned.formulas.map((f) => ({
            campaignId: campaign.id,
            vehicleModelId: f.vehicleModelId,
            name: f.name,
            operator: f.operator,
            value: f.value,
            priceTarget: f.priceTarget,
            sortOrder: f.sortOrder,
          })),
        });
      }
      return campaign;
    });

    return this.getById(created.id);
  }
```

(Confirm `NotFoundError` is imported in this file — it uses error classes already; if not, add it to the existing `../../lib/errors` import.)

- [ ] **Step 2: Controller route**

In `apps/api/src/modules/campaigns/campaigns.controller.ts`, add after the `.put('/:id')` update route (uses the same permission as create):

```ts
  .post(
    '/:id/duplicate',
    async ({ params, set, requester }) => {
      const campaign = await campaignsService.duplicate(params.id, requester.id);
      set.status = 201;
      return { success: true, data: campaign, message: 'Campaign duplicated' };
    },
    {
      beforeHandle: [authMiddleware, requirePermission('CAMPAIGN_CREATE')],
      detail: { tags: ['Campaigns'], summary: 'Duplicate a campaign' },
    }
  )
```

(`duplicate` throws `NotFoundError` for a missing id; the global `onError` handler maps it to 404.)

- [ ] **Step 3: Web service method**

In `apps/web/src/services/campaign.service.ts`, add:

```ts
  async duplicate(id: string): Promise<Campaign> {
    const res = await api.post<ApiResponse<Campaign>>(`/campaigns/${id}/duplicate`, {});
    return res.data;
  }
```

(Match the exact `api.post` signature used by neighbouring methods.)

- [ ] **Step 4: Verify**

Run: `cd apps/api && bun test` → no new failures; the helper tests from Task 3 still pass.
Run: `cd apps/web && bunx tsc -b` → exit 0.

> The transactional persistence is thin glue over the Task-3-tested `buildClonedCampaign`; full end-to-end duplicate is exercised in Task 5's manual verification.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/campaigns/campaigns.service.ts apps/api/src/modules/campaigns/campaigns.controller.ts apps/web/src/services/campaign.service.ts
git commit -m "feat(campaigns): POST /:id/duplicate clones models+formulas into a DRAFT"
```

---

## Task 5: Duplicate UI action — list + detail, navigate to edit

**Files:**
- Modify: `apps/web/src/pages/campaigns/CampaignsListPage.tsx`
- Modify: `apps/web/src/pages/campaigns/CampaignDetailPage.tsx`

**Interfaces:**
- Consumes: `campaignService.duplicate(id)` (Task 4).

- [ ] **Step 1: List — duplicate action**

In `CampaignsListPage.tsx`:

(a) Import the `Copy` icon: add `Copy` to the existing `lucide-react` import.

(b) Add a duplicate mutation (uses the existing `queryClient` + `navigate`):

```tsx
  const duplicateMutation = useMutation({
    mutationFn: (id: string) => campaignService.duplicate(id),
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
      navigate(`/campaigns/${created.id}/edit`);
    },
  });
```

(Import `useMutation`/`useQueryClient` from `@tanstack/react-query` if not already imported; add a `useErrorHandler` wrap if the file already uses one — match the page's existing mutation/error pattern.)

(c) Add a button in the row actions cell (next to the Edit button), guarded by the same role check the Edit/Delete buttons use:

```tsx
                          <button
                            onClick={() => duplicateMutation.mutate(campaign.id)}
                            disabled={duplicateMutation.isPending}
                            className="text-gray-600 hover:text-blue-600 disabled:opacity-50"
                            title="ทำสำเนา"
                          >
                            <Copy className="w-5 h-5" />
                          </button>
```

- [ ] **Step 2: Detail — duplicate button**

In `CampaignDetailPage.tsx`:

(a) Add `Copy` to the `lucide-react` import; ensure `useMutation`/`useQueryClient`/`useNavigate` are available (the page already navigates).

(b) Add the same `duplicateMutation` as above.

(c) Add a "ทำสำเนา" button next to the Edit link in the header actions:

```tsx
              <button
                onClick={() => duplicateMutation.mutate(id!)}
                disabled={duplicateMutation.isPending}
                className="inline-flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                <Copy className="w-5 h-5" /> ทำสำเนา
              </button>
```

- [ ] **Step 3: Verify**

Run: `cd apps/web && bunx tsc -b` → exit 0.
Manual (running app): duplicate a campaign that has models + formulas from both the list and the detail page → lands on the new campaign's edit form, name ends with "(สำเนา)", status DRAFT, dates one month later, models present; open the new campaign's detail/formulas → formulas were copied; the source campaign is unchanged.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/pages/campaigns/CampaignsListPage.tsx apps/web/src/pages/campaigns/CampaignDetailPage.tsx
git commit -m "feat(campaigns): ทำสำเนา action on list + detail, navigates to the new draft"
```

---

## Task 6: Bulk model-select + search in the form

**Files:**
- Modify: `apps/web/src/pages/campaigns/CampaignFormPage.tsx`

**Interfaces:**
- Consumes: existing `vehicleModels`, `formData.vehicleModelIds`, `setFormData`.

- [ ] **Step 1: Add a model search filter**

In `CampaignFormPage.tsx`, add state near the other `useState`s:

```tsx
  const [modelSearch, setModelSearch] = useState('');
```

Derive the filtered list just before the model grid render:

```tsx
  const filteredModels = vehicleModels.filter((m: VehicleModel) => {
    const q = modelSearch.trim().toLowerCase();
    if (!q) return true;
    return `${m.brand} ${m.model} ${m.variant ?? ''}`.toLowerCase().includes(q);
  });
```

Change the model grid to map over `filteredModels` instead of `vehicleModels`.

- [ ] **Step 2: Add select-all / clear-all over the filtered set**

Add two handlers:

```tsx
  const selectAllFiltered = () => {
    setFormData((prev) => ({
      ...prev,
      vehicleModelIds: Array.from(
        new Set([...prev.vehicleModelIds, ...filteredModels.map((m: VehicleModel) => m.id)])
      ),
    }));
  };

  const clearFiltered = () => {
    const filteredIds = new Set(filteredModels.map((m: VehicleModel) => m.id));
    setFormData((prev) => ({
      ...prev,
      vehicleModelIds: prev.vehicleModelIds.filter((id) => !filteredIds.has(id)),
    }));
  };
```

- [ ] **Step 3: Render the search box + buttons above the grid**

In the "รุ่นรถยนต์ในแคมเปญ" card, above the model grid (after the header/counter row), add:

```tsx
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="text"
                value={modelSearch}
                onChange={(e) => setModelSearch(e.target.value)}
                placeholder="ค้นหารุ่น..."
                className="flex-1 min-w-[12rem] px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                type="button"
                onClick={selectAllFiltered}
                className="px-3 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                เลือกทั้งหมด
              </button>
              <button
                type="button"
                onClick={clearFiltered}
                className="px-3 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                ล้างทั้งหมด
              </button>
            </div>
```

(Use `type="button"` so the buttons never submit the form.)

- [ ] **Step 4: Verify**

Run: `cd apps/web && bunx tsc -b` → exit 0.
Manual: type in the search box → grid filters; "เลือกทั้งหมด" selects all currently-visible models (counter updates, no duplicates); "ล้างทั้งหมด" removes the currently-visible models from the selection; the per-card toggle still works.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/pages/campaigns/CampaignFormPage.tsx
git commit -m "feat(campaigns): search + select-all/clear-all in the model picker"
```

---

## Self-Review

**Spec coverage:**
- Part A branch (schema, create/update, datalist input, list column+filter, detail, `GET /branches`) → Tasks 1 + 2. ✓
- Part B duplicate (transactional clone of models+formulas, name "(สำเนา)", DRAFT, next-month dates, lands in edit form, source unchanged) → Tasks 3 + 4 + 5. ✓
- Part C bulk-select (search + select-all/clear-all on filtered set) → Task 6. ✓
- `shiftToNextMonth` (clamp + year rollover, UTC) → Task 3. ✓
- Out-of-scope (per-brand grouping, branch business logic, formula engine, reports) → untouched. ✓

**Placeholder scan:** No TBD/TODO; every code step shows full code. UI tasks name exact files, state fields, and JSX. ✓

**Type consistency:** `shiftToNextMonth`/`buildClonedCampaign`/`CloneSource`/`CloneSourceFormula`/`ClonedCampaign` and method names (`getBranches`, `duplicate`) and field names (`branch`, `vehicleModelIds`) match across Tasks 1–6. Enum members (`PERCENT`, `FIXED`, `COST_PRICE`, `SELLING_PRICE`) are real. ✓

**Note for executor:** Tasks 1/2/4/5/6 are DB- or UI-integration work without isolated unit tests; their gates are `bunx tsc -b` (web), `bun test` (api, no new failures), `bunx prisma generate`, and the named manual checks. Task 3 is the pure TDD core.
