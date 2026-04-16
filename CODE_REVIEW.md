# Code Review — Bug Audit Fixes (commits `f5d6470` + `ce6d68b`)

**Reviewed:** 2026-04-16
**Scope:** 49 changed files across `apps/api`, `apps/web`, `packages/shared`
**Method:** 4 parallel code-reviewer agents split by domain
**Tests:** 58/58 Bun tests passing throughout

---

## Summary

| Tier | Found by review | Fixed inline | Deferred |
|------|-----------------|--------------|----------|
| Critical | 4 | 4 | 0 |
| High | 9 | 1 | 8 |
| Medium | 8 | 0 | 8 |
| Low | 4 | 0 | 4 |
| **Total** | **25** | **5** | **20** |

All 4 Critical findings were **real regressions** or **missed bug sites** from the main audit — they are now fixed in this review pass.

---

## ✅ Fixed Inline (5)

### Critical #1 — `sales.service.ts:530-532` — missing `reservedDate` in select
The `updateSaleStatus` function selects only `{ id, status, stockId, remainingAmount }` but then reads `existingSale.reservedDate` at line 586. TypeScript inferred the field as `never`, so the `!existingSale.reservedDate` guard was always true, silently overwriting the original reservation date on any subsequent status-change call.
**Fix:** Added `reservedDate: true` to the select.

### Critical #2 — `interest.controller.ts:200` — second site of `requester!.userId`
I fixed the occurrence at line 150 during the main audit, but missed this second site in `updateInterestRate`. Same bug as before: auth middleware populates `.id`, not `.userId`, so `createdById` on new interest periods was `undefined`.
**Fix:** `requester!.userId` → `requester!.id`.

### Critical #3 — `quotations.service.ts:566-587` — duplicate non-atomic sale-number generator
`convertToSale` has its own inline copy of the sale-number generation logic using the old `findFirst` + `create` + `update` pattern. The original `generateSaleNumber` in `sales.service.ts` was made atomic, but this duplicate was missed — so concurrent quotation conversions could still produce duplicate sale numbers.
**Fix:** Replaced with the same serializable-transaction `updateMany`/`create` fallback pattern used in `generateSaleNumber`.

### Critical #4 — 5 list pages — debounced search fires on every keystroke
The audit "fix" added `searchTerm` to the `useCallback` deps and used `if (page === 1) return; setTimeout(() => setPage(1), 500)`. Problem: when `searchTerm` changes, the `useCallback` identity changes, triggering the fetch effect **immediately** with no debounce. The second effect was a no-op whenever already on page 1.
**Fix:** Introduced `debouncedSearchTerm` state. The fetch callback depends on `debouncedSearchTerm`; the debounce effect sets it after 500ms. Applied to all 5 pages (Customers, Payments, Sales, Users, Stock).

### High #1 (resolved via #4) — page-reset race
Addressed as part of the debouncedSearchTerm refactor — `setPage(1)` now runs unconditionally when `debouncedSearchTerm` changes, without racing against the fetch effect.

---

## ⚠️ Deferred (20) — Follow-up backlog

These are real issues but are **not regressions from the audit**. They should be handled in a dedicated follow-up. Listed in priority order.

### High — worth fixing soon

| File:Line | Issue | Suggested Fix |
|-----------|-------|---------------|
| `apps/api/src/modules/payments/payments.service.ts:380` | `updatePayment` uses default isolation, not Serializable — same TOCTOU race the `createPayment` fix addressed | Add `{ isolationLevel: 'Serializable' }` to the `$transaction` call |
| `apps/api/src/modules/interest/interest.service.ts:474-528` | `stopInterestCalculation` (service-level, separate from the inlined version in `recordDebtPayment`) — 2 writes outside a transaction | Wrap in `db.$transaction` |
| `apps/api/src/modules/interest/interest.service.ts:533-603` | `resumeInterestCalculation` — same pattern, not atomic | Wrap in `db.$transaction` |
| `apps/api/src/modules/pdf/pdf.controller.ts:1145` | Daily report accepts invalid date string; `new Date("abc")` → `Invalid Date` → Prisma treats as `NULL` → returns all payments (data exposure) | Add `if (isNaN(date.getTime()))` guard returning 400 |
| `apps/api/src/modules/sales/sales.service.ts:491-510` | `updateSale` writes sale + activity log in 2 sequential calls, no transaction | Wrap in `db.$transaction` |
| `apps/api/src/modules/payments/payments.service.ts:231` | `generateReceiptNumber()` is called before the serializable transaction; on retry the sequence increments again, burning numbers | Move inside the transaction callback |
| `apps/web/src/pages/payments/PaymentFormPage.tsx:97,122-127` | Double initialization of `paymentMode` (`useState` init + `useEffect`) | Remove the redundant `setPaymentMode('sale')` from the effect |
| `apps/web/src/pages/vehicles/VehicleFormPage.tsx:81-116` | `<form onSubmit>` + `<button type="button" onClick>` both wired — Enter inside fields can still double-fire despite the saving guard | Pick one: either `type="submit"` without onClick, or remove the `<form>`'s onSubmit |
| `apps/web/src/components/reports/PrintButton.tsx:120` | `document.title = originalTitle` runs synchronously after setTimeout schedules the print — original title is restored before print fires | Move inside the setTimeout callback |

### Medium

| File:Line | Issue | Suggested Fix |
|-----------|-------|---------------|
| `apps/api/src/lib/discord-notify.ts:13-28` | Rate-limiter uses fixed 5s timer regardless of elapsed time; pending items beyond 5 per flush are silently dropped | Compute remaining wait; reschedule if more than 5 pending |
| `apps/api/src/modules/auth/auth.middleware.ts:40-44` | No null check on `decoded.sub`/`.username`/`.role` — missing claims silently produce `undefined` fields | Reject with 401 if required claims are missing |
| `apps/api/src/modules/users/users.service.ts:188-191` | `delete validated.role` may leave `undefined` in the object, which Prisma may write as `null` depending on config | Destructure: `const { role: _r, status: _s, ...safe } = validated` |
| `apps/api/src/modules/reports/reports.service.ts:254-258` | `canAccrueInterest = debtStatus !== 'PAID_OFF' \|\| hasStopDate` — logic error, should use `&& !stopInterestCalc` (matches other sites) | Align with the rule in `pdf.controller.ts:110` |
| `apps/api/src/modules/campaigns/campaigns.service.ts:660` | Sales without a stock record get `costPrice = 0` — produces wrong profit calc in campaign reports | Fall back to `vehicleModel.standardCost` |
| `apps/api/src/modules/pdf/pdf.controller.ts:133` | Same `canAccrueInterest` logic error as reports.service | Same fix |
| `apps/api/src/modules/interest/interest.service.ts:119-127` | `where.OR` assigned for search, then reassigned for `isCalculating=false` — search term is silently lost | Merge into `where.AND` with nested ORs |
| `apps/web/src/pages/payments/PaymentsListPage.tsx + SalesListPage + StockListPage` | Stats fetch re-runs when filters change, even though stats API ignores filters | Remove filter deps from stats effects |
| `apps/web/src/pages/stock/StockDetailPage.tsx:498-505` | Duplicate "พิมพ์การ์ดรถยนต์แบบพิมพ์ล่วงหน้า" button — third button calls same handler as second | Wire distinct handler or remove |
| `apps/web/src/pages/users/UsersListPage.tsx:247-253` | `TablePagination` rendered unconditionally; other pages guard on `totalPages > 1` | Add the guard |
| `apps/web/src/contexts/AuthContext.tsx:97-103` | Context `value` object not memoized — all consumers re-render on every parent render | Wrap with `useMemo` |

### Low

| File:Line | Issue | Suggested Fix |
|-----------|-------|---------------|
| `apps/web/src/lib/api.ts:187,200,204` | Auth method return types still `Promise<any>` despite the new `RawApiResponse` typing | Type with proper response shapes |
| `apps/api/src/modules/system/system.service.ts:9-13` | `UPDATER_URL` has no production warning when default is used | Log warning if production + default URL |
| `apps/api/src/modules/vehicles/vehicles.service.ts:95-99` | Uses `STOCK_CREATE` for vehicle-model creation — semantic mismatch with existing `VEHICLE_EDIT` permission | Consider a dedicated `VEHICLE_CREATE` permission |
| `apps/web/src/components/reports/reportUtils.ts:88-121` | `getDateRange('today')` uses UTC dates — user in UTC+7 before 07:00 gets yesterday's date (pre-existing, not a regression) | Use local-date formatting |

---

## 🟢 Clean

- **Critical security fixes** (#1-5, #16 from audit) — all verified live
- **JWT refresh** — live smoke test confirms `sub` claim preserved
- **Atomicity fixes** for `recordDebtPayment`, `updateInterestRate`, `deleteSale`, `updateSaleStatus` — structures look sound
- **Null guards** in analytics/reports/campaigns — well-placed
- **Frontend security** (PrintButton XSS rewrite, type narrowing) — solid
- **Functional setState** conversions in forms — mechanical, no regressions found
- **Unmount guards** in SystemUpdateSection + SettingsPage — correctly implemented
- **Shared constants** reconciliation — enum and label maps now match

---

## Verification

- Bun test suite: **58/58 pass** after all fixes
- Docker rebuilt: all 4 containers healthy
- Live smoke: login, refresh, profile, 5 list endpoints all HTTP 200
