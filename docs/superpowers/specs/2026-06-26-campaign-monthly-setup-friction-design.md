# #1 — Reduce monthly campaign-setup friction

**Date:** 2026-06-26
**Status:** Approved (design)
**Feature ID:** #1 (campaign feedback 2026-06-25)

## Problem

Setting up promo campaigns is repetitive month-to-month. The dealership runs
campaigns **both** ways — some are recreated fresh each month (similar models +
formulas, new dates), others are edited in place. Three concrete frictions:

1. **No duplicate.** Recreating last month's campaign means re-entering every
   model and every per-model formula by hand.
2. **No bulk model-select.** The campaign form lists models as click-one-at-a-time
   cards — no select-all, no search — tedious for a long list.
3. **No branch field.** Campaigns can't be tagged with a สาขา (branch), so
   per-branch campaigns can't be told apart or filtered.

## Current state (verified)

- `Campaign` has `name, description, status, startDate, endDate, notes`, a
  many-to-many to `VehicleModel` via `CampaignVehicleModel`, and per-model
  `CampaignModelFormula` rows. **No `branch` field.**
- Formulas are **not** part of campaign create/update. They are managed
  one-by-one through `POST/PUT/DELETE /campaigns/:id/vehicle-models/:modelId/formulas`
  after the campaign exists. The create form only submits `vehicleModelIds`.
- `CampaignFormPage` selects models via click-to-toggle cards (no select-all,
  search, or grouping).
- "Branch/สาขา" is **not** a first-class concept anywhere: `branch` (BankAccount)
  and `receivingBranch` (Stock) are free-text strings; there is no `Branch`
  entity, enum, or central list.

Because formulas live outside the create form, a duplicate that preserved
formulas **cannot** be purely client-side — it must be a transactional
server-side clone, or it would silently drop every formula (the most valuable
thing to copy).

## Scope

Three independent levers, one spec/plan. All small, all aimed at setup friction.

**In scope**

- **A — Branch label:** schema `Campaign.branch String?`; create/update accept it;
  free-text + `<datalist>` input on the form; list column + filter; detail display;
  `GET /campaigns/branches` (distinct values).
- **B — Duplicate:** `POST /campaigns/:id/duplicate` (transactional clone); list +
  detail "ทำสำเนา" action that navigates to the new DRAFT's edit form.
- **C — Bulk model-select:** web-only search box + select-all/clear-all in
  `CampaignFormPage`.

**Out of scope (YAGNI)**

- Per-brand grouping in the model selector.
- Any per-branch business logic (filtering sales/reports by branch, branch
  permissions, branch-scoped visibility). Branch is a **label only**.
- A duplicate "wizard" / in-memory unsaved duplicate. Duplicate persists a DRAFT
  and lands the user in its edit view.
- Touching the formula engine, claim report, or `applyLoadedFormulas`.

## Part A — Branch label (สาขา)

**Schema.** Add `branch String? @map("branch")` to `Campaign`. Migration adds a
nullable column (no backfill).

**API.**
- `createCampaign` / `updateCampaign` payload (shared Zod schema) gains
  `branch: z.string().trim().max(100).optional()`. Empty string normalises to
  `null`/undefined.
- Campaign read payloads include `branch`.
- `GET /campaigns/branches` → `{ success, data: string[] }` — distinct non-null,
  non-empty `branch` values, sorted, for the datalist + list filter.
- `getAll(page, limit, search, branch?)` filters by exact `branch` when provided.

**Web.**
- `CampaignFormPage`: a `สาขา` text input bound to `formData.branch`, with a
  `<datalist>` whose options come from `GET /campaigns/branches`. Optional field.
- `CampaignsListPage`: a `สาขา` column and a branch filter dropdown (distinct
  values from the same endpoint); selecting a branch passes it to `getAll`.
- `CampaignDetailPage`: show `สาขา` in the campaign header/meta when present.

## Part B — Duplicate (server-side clone)

**API.** `POST /campaigns/:id/duplicate` — in a single Prisma transaction:
1. Load the source campaign with its `CampaignVehicleModel` rows and each row's
   `CampaignModelFormula` rows. 404 if not found.
2. Create a new `Campaign`: `name = source.name + ' (สำเนา)'`,
   copy `description, branch, notes`, `status = DRAFT`, `createdById = requester`,
   and `startDate`/`endDate` = `shiftToNextMonth(source.start, source.end)`.
3. Recreate every `CampaignVehicleModel` join row for the new campaign.
4. Recreate every `CampaignModelFormula` (new `id`, new `campaignId`, same
   `vehicleModelId, name, operator, value, priceTarget, sortOrder`).
5. Return `{ success, data: { id, ... } }` for the new campaign.

Permission: same as create (`requirePermission` for campaign create/manage —
match the existing create route's guard).

**Date shift.** Pure helper `shiftToNextMonth(start: Date, end: Date)`:
- Adds one month to both dates; year rolls over (Dec → Jan).
- Clamps the day to the target month's last day (e.g. start Jan 31 → Feb 28/29).
- Returns `{ startDate, endDate }`. Lives in a small testable module
  (`apps/api/src/modules/campaigns/campaign-duplicate.helpers.ts`).

**Web.** A "ทำสำเนา" action on (a) each row's menu in `CampaignsListPage` and
(b) the `CampaignDetailPage`. On click → `POST .../duplicate` → on success
navigate to the new campaign's **edit form** (`/campaigns/:newId/edit`), which is
pre-filled (DRAFT, next-month dates, copied models/branch/notes). Formulas are
visible/editable on the detail page. Show an error toast on failure; the source
campaign is never modified.

## Part C — Bulk model-select (web only)

In `CampaignFormPage`, above the model grid:
- A search input that filters the rendered model cards by
  `brand / model / variant` (case-insensitive substring).
- **เลือกทั้งหมด** and **ล้างทั้งหมด** buttons. "Select all" adds the currently
  **filtered** model ids to `vehicleModelIds` (union, no duplicates); "clear all"
  removes the currently filtered ids (so a search + clear removes just that
  subset; with no search it clears everything).
- The existing click-to-toggle cards and "เลือกแล้ว N รุ่น" counter stay.

No API or schema change for Part C.

## Testing

- **Unit — `shiftToNextMonth`** (`apps/api`): add-one-month with same day-of-month
  (Jun 1–Jun 30 → Jul 1–Jul 30); month-length clamp when the day overflows the
  target month (Jan 31 → Feb 28 in a non-leap year, Feb 29 in a leap year);
  year rollover (Dec 15 → Jan 15, year + 1). Uses UTC date parts to avoid the
  known UTC-vs-local-midnight off-by-one.
- **Unit — clone copy-logic** (`apps/api`): given a source campaign's models +
  formulas, the builder produces the expected new join rows + formula rows
  (status DRAFT, name suffixed, dates shifted, formula fields preserved, new ids).
  Extract the pure transformation so it is testable without a DB; the
  transactional persistence is thin glue.
- **Bulk-select + search**: verified manually in the running app (UI-only).
- **Branch**: covered by the create/update Zod schema test if one exists for
  campaigns; the distinct-branches query is simple and verified manually.

Reports/claim untouched, so no report regressions expected.

## Verification checklist

- [ ] `Campaign.branch` migrates as a nullable column.
- [ ] Branch saves/edits via the form; datalist shows prior values; list filter works.
- [ ] Duplicate creates a DRAFT copy with all models AND formulas, name "(สำเนา)",
      dates next month; source unchanged; lands in the new campaign's edit form.
- [ ] `shiftToNextMonth` clamps month length and rolls the year over.
- [ ] Select-all/clear-all + search operate on the filtered set; counter updates.
