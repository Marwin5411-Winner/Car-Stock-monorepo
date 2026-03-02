# Error Handling & Logging Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add Pino file logging to the API, clean up controller error handling, and migrate all frontend pages from `window.alert()` to the existing toast/hook system with inline field-level error support.

**Architecture:** Backend gets a Pino logger writing to rotating log files, controllers are simplified by removing try-catch (letting the existing global error handler work), and error classes gain field-level details for unique constraint violations. Frontend adopts `useErrorHandler`/`useMutationHandler` hooks everywhere, replacing all alert() calls, with a new `useFormErrorHandler` hook that extracts field-level errors from API responses.

**Tech Stack:** Pino (logging), ElysiaJS (backend), React hooks (frontend), existing toast system

---

### Task 1: Install Pino dependencies

**Files:**
- Modify: `apps/api/package.json`

**Step 1: Install pino and pino-roll**

Run from repo root:
```bash
cd apps/api && bun add pino pino-roll && bun add -d pino-pretty
```

**Step 2: Verify installation**

Run: `cd apps/api && bun run build`
Expected: Build succeeds with no errors

**Step 3: Commit**

```bash
git add apps/api/package.json bun.lock*
git commit -m "chore: add pino, pino-roll, pino-pretty dependencies"
```

---

### Task 2: Create the Pino logger module

**Files:**
- Create: `apps/api/src/lib/logger.ts`
- Modify: `apps/api/.gitignore` (create if doesn't exist)
- Modify: `.gitignore` (root — add logs/)

**Step 1: Create the logger**

Create `apps/api/src/lib/logger.ts`:
```typescript
import pino from 'pino';
import { join } from 'path';

const isDev = process.env.NODE_ENV !== 'production';
const logDir = join(import.meta.dir, '..', '..', 'logs');

// Ensure log directory exists
import { mkdirSync } from 'fs';
try {
  mkdirSync(logDir, { recursive: true });
} catch {}

const targets: pino.TransportTargetOptions[] = [
  // Error log — errors only, daily rotation, 7-day retention
  {
    target: 'pino-roll',
    level: 'error',
    options: {
      file: join(logDir, 'error.log'),
      frequency: 'daily',
      limit: { count: 7 },
      mkdir: true,
    },
  },
  // Combined log — info+, daily rotation, 14-day retention
  {
    target: 'pino-roll',
    level: 'info',
    options: {
      file: join(logDir, 'combined.log'),
      frequency: 'daily',
      limit: { count: 14 },
      mkdir: true,
    },
  },
];

// In dev, also pretty-print to stdout
if (isDev) {
  targets.push({
    target: 'pino-pretty',
    level: 'debug',
    options: {
      colorize: true,
      translateTime: 'SYS:HH:MM:ss',
      ignore: 'pid,hostname',
    },
  });
}

export const logger = pino({
  level: isDev ? 'debug' : 'info',
  transport: { targets },
});
```

**Step 2: Add logs/ to gitignore**

Create `apps/api/.gitignore`:
```
logs/
```

Also add to root `.gitignore`:
```
# Log files
logs/
```

**Step 3: Verify logger imports**

Run: `cd apps/api && bun run build`
Expected: Build succeeds

**Step 4: Commit**

```bash
git add apps/api/src/lib/logger.ts apps/api/.gitignore .gitignore
git commit -m "feat: add Pino logger with file rotation"
```

---

### Task 3: Integrate logger into the global error handler and add request logging

**Files:**
- Modify: `apps/api/src/index.ts` (lines 1-6 for imports, lines 117-188 for error handler)

**Step 1: Add logger import**

At the top of `apps/api/src/index.ts`, add:
```typescript
import { logger } from './lib/logger';
```

**Step 2: Replace console.error in onError handler**

In the `.onError()` handler (line 118), replace:
```typescript
console.error(`Error [${code}]:`, error);
```
with:
```typescript
logger.error({ code, err: error, stack: error instanceof Error ? error.stack : undefined }, `Error [${code}]: ${error instanceof Error ? error.message : 'Unknown error'}`);
```

**Step 3: Add request logging**

Before the `.onError()` chain (before line 117), add lifecycle hooks:
```typescript
.onRequest(({ request, store }) => {
  (store as any).startTime = Date.now();
  logger.debug({ method: request.method, url: request.url }, 'Incoming request');
})
.onAfterResponse(({ request, set, store }) => {
  const duration = Date.now() - ((store as any).startTime || Date.now());
  const url = new URL(request.url);
  logger.info({
    method: request.method,
    path: url.pathname,
    status: set.status || 200,
    duration,
  }, `${request.method} ${url.pathname} ${set.status || 200} ${duration}ms`);
})
```

**Step 4: Replace startup console.log with logger**

Replace the startup console.log block (lines 191-197) with:
```typescript
logger.info(`VBeyond Car Sales API running on http://${app.server?.hostname}:${app.server?.port}`);
```

Keep the console.log version too for immediate visibility in dev terminal (since pino-pretty goes through transport which may delay):
```typescript
console.log(`
🚗 VBeyond Car Sales API
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🌐 Server:  http://${app.server?.hostname}:${app.server?.port}
📚 Docs:    http://${app.server?.hostname}:${app.server?.port}/docs
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`);
logger.info({ port: app.server?.port }, 'VBeyond Car Sales API started');
```

**Step 5: Verify**

Run: `cd apps/api && bun run dev`
Expected: Server starts, `logs/combined.log` is created with startup message. Hit a few endpoints and verify logs are written.

**Step 6: Commit**

```bash
git add apps/api/src/index.ts
git commit -m "feat: integrate Pino logger into error handler and request lifecycle"
```

---

### Task 4: Improve backend error classes with field-level details

**Files:**
- Modify: `apps/api/src/lib/errors.ts` (lines 80-97 for ConflictError, lines 130-176 for handlePrismaError)

**Step 1: Update ConflictError to include field-level error details**

In `apps/api/src/lib/errors.ts`, replace the `ConflictError` class (lines 80-97) with:
```typescript
export class ConflictError extends AppError {
  constructor(
    field: string,
    value?: string,
    details?: Record<string, unknown>
  ) {
    const message = value
      ? `${field} already exists: ${value}`
      : `${field} already exists`;

    const errorCode = `${field.toUpperCase().replace(/\s+/g, '_')}_ALREADY_EXISTS`;

    // Build field-level error details for frontend inline display
    const fieldKey = field.toLowerCase().replace(/\s+/g, '');
    const fieldDetails = {
      ...details,
      fields: { [fieldKey]: [`${field} already exists`] },
    };

    super(message, 409, errorCode, fieldDetails);
    this.name = 'ConflictError';
  }
}
```

**Step 2: Improve handlePrismaError P2002 to map field names**

Replace the P2002 case in `handlePrismaError` (lines 135-141) with:
```typescript
case 'P2002': {
  const targets = error.meta?.target as string[] | undefined;
  const field = targets?.[0] || 'field';

  // Map DB column names to user-friendly field names
  const fieldNameMap: Record<string, string> = {
    vin: 'VIN',
    engine_number: 'Engine Number',
    engineNumber: 'Engine Number',
    tax_id: 'Tax ID',
    taxId: 'Tax ID',
    username: 'Username',
    email: 'Email',
  };

  const friendlyName = fieldNameMap[field] || field;
  return new ConflictError(friendlyName, undefined, {
    target: error.meta?.target,
    code: 'P2002',
  });
}
```

**Step 3: Verify build**

Run: `cd apps/api && bun run build`
Expected: Build succeeds

**Step 4: Commit**

```bash
git add apps/api/src/lib/errors.ts
git commit -m "feat: add field-level error details to ConflictError and improve P2002 mapping"
```

---

### Task 5: Clean up backend controllers — remove try-catch wrappers

This task removes the manual try-catch blocks from all controllers. The services already throw proper custom errors (ConflictError, NotFoundError, BadRequestError, etc.) which propagate to the global `.onError()` handler.

**Key principle:** Keep data processing logic (like parseFloat conversions, safeParseFloat). Only remove the try-catch wrapper and the manual error response.

**Files to modify** (all controllers):
- `apps/api/src/modules/stock/stock.controller.ts`
- `apps/api/src/modules/sales/sales.controller.ts`
- `apps/api/src/modules/customers/customers.controller.ts`
- `apps/api/src/modules/vehicles/vehicles.controller.ts`
- `apps/api/src/modules/payments/payments.controller.ts`
- `apps/api/src/modules/users/users.controller.ts`
- `apps/api/src/modules/quotations/quotations.controller.ts`
- `apps/api/src/modules/campaigns/campaigns.controller.ts`
- `apps/api/src/modules/interest/interest.controller.ts`
- `apps/api/src/modules/reports/reports.controller.ts`
- `apps/api/src/modules/pdf/pdf.controller.ts`
- `apps/api/src/modules/analytics/analytics.controller.ts`
- `apps/api/src/modules/settings/settings.controller.ts`
- `apps/api/src/modules/system/system.controller.ts`

**Step 1: Transform stock controller**

Each endpoint handler goes from:
```typescript
async ({ query, set, requester }) => {
  try {
    const result = await stockService.getAllStock(query, requester!);
    set.status = 200;
    return {
      success: true,
      data: result.data,
      meta: result.meta,
    };
  } catch (error) {
    set.status = 500;
    return {
      success: false,
      error: 'Server error',
      message: error instanceof Error ? error.message : 'Failed to fetch stock',
    };
  }
}
```
To:
```typescript
async ({ query, set, requester }) => {
  const result = await stockService.getAllStock(query, requester!);
  set.status = 200;
  return {
    success: true,
    data: result.data,
    meta: result.meta,
  };
}
```

Apply this pattern to ALL endpoints in `stock.controller.ts`. Keep the data processing logic (parseFloat conversions) inside POST and PATCH handlers — just remove the try-catch wrapper.

Also remove the manual permission check in GET /available (lines 87-95) — replace with `beforeHandle: [authMiddleware, requirePermission('STOCK_VIEW')]` (uses the existing pattern).

Remove the unused import of `authService` if no longer used after this change.

**Step 2: Transform sales controller**

Same pattern. For POST and PATCH, keep the `safeParseFloat` helper and processedBody logic — just remove the try-catch. The `BadRequestError` thrown by safeParseFloat will correctly propagate to the global handler.

Note: `safeParseFloat` is defined inside the try block — move it outside (or to module scope). Recommended: extract `safeParseFloat` to a utility at the top of the file:
```typescript
import { BadRequestError } from '../../lib/errors';

const safeParseFloat = (value: unknown): number => {
  if (typeof value !== 'string') return value as number;
  const parsed = parseFloat(value);
  if (isNaN(parsed)) throw new BadRequestError(`Invalid number format: ${value}`);
  return parsed;
};
```

Then use it in both POST and PATCH without try-catch.

**Step 3: Transform all other controllers**

Apply the same try-catch removal pattern to all remaining controllers. For each:
1. Remove try-catch wrapper
2. Keep business logic and data processing
3. Let errors propagate to global handler

**Step 4: Verify**

Run: `cd apps/api && bun run build`
Expected: Build succeeds with no type errors

Run: `cd apps/api && bun run dev`
Test: Hit a few endpoints to verify success and error responses work correctly.

**Step 5: Commit**

```bash
git add apps/api/src/modules/
git commit -m "refactor: remove try-catch from controllers, let global error handler manage errors"
```

---

### Task 6: Add missing Thai error messages to frontend

**Files:**
- Modify: `apps/web/src/lib/errors.ts` (lines 27-65, the ERROR_MESSAGES object)

**Step 1: Add new error codes**

Add these entries to `ERROR_MESSAGES` in `apps/web/src/lib/errors.ts`:
```typescript
// Additional Conflict Errors (field-level)
'VIN_ALREADY_EXISTS': 'เลขตัวถัง (VIN) นี้มีอยู่แล้วในระบบ',
'ENGINE_NUMBER_ALREADY_EXISTS': 'เลขเครื่องยนต์นี้มีอยู่แล้วในระบบ',
'MOTOR_NUMBER_ALREADY_EXISTS': 'เลขมอเตอร์นี้มีอยู่แล้วในระบบ',
'STOCK_ALREADY_IN_SALE': 'รถคันนี้มีรายการขายอยู่แล้ว',
'CONTRACT_NUMBER_ALREADY_EXISTS': 'เลขสัญญานี้มีอยู่แล้วในระบบ',

// Sale-specific errors
'STOCK_NOT_AVAILABLE': 'รถไม่พร้อมขาย (ไม่ได้สถานะ AVAILABLE)',
'SALE_ALREADY_COMPLETED': 'รายการขายนี้เสร็จสิ้นแล้ว',
'SALE_ALREADY_CANCELLED': 'รายการขายนี้ถูกยกเลิกแล้ว',

// Payment errors
'PAYMENT_ALREADY_VOIDED': 'รายการชำระเงินนี้ถูกยกเลิกแล้ว',
'OVERPAYMENT': 'จำนวนเงินเกินยอดที่ต้องชำระ',
```

Note: Some of these may already exist — check first and only add missing ones.

**Step 2: Verify build**

Run: `cd apps/web && bun run build`
Expected: Build succeeds

**Step 3: Commit**

```bash
git add apps/web/src/lib/errors.ts
git commit -m "feat: add Thai error messages for new conflict and sale error codes"
```

---

### Task 7: Enhance useErrorHandler to support field-level errors

**Files:**
- Modify: `apps/web/src/hooks/useErrorHandler.ts`

**Step 1: Add field error extraction**

Replace the entire contents of `apps/web/src/hooks/useErrorHandler.ts` with:
```typescript
import { useState, useCallback } from 'react';
import { useToast } from '../components/toast';
import { isApiError, getErrorMessage } from '../lib/errors';

interface ErrorHandlerOptions {
  showToast?: boolean;
  successMessage?: string;
  onSuccess?: () => void;
  onError?: (error: Error) => void;
}

interface ErrorHandlerResult<T> {
  execute: (promise: Promise<T>) => Promise<T | undefined>;
  fieldErrors: Record<string, string>;
  clearFieldErrors: () => void;
}

/**
 * Hook for handling errors in async operations
 * Shows toast notifications and extracts field-level errors
 */
export function useErrorHandler<T = unknown>(options: ErrorHandlerOptions = {}): ErrorHandlerResult<T> {
  const { addToast } = useToast();
  const { showToast = true, successMessage, onSuccess, onError } = options;
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const clearFieldErrors = useCallback(() => setFieldErrors({}), []);

  const execute = async (promise: Promise<T>): Promise<T | undefined> => {
    // Clear previous field errors on new attempt
    setFieldErrors({});

    try {
      const result = await promise;

      if (showToast && successMessage) {
        addToast(successMessage, 'success');
      }

      onSuccess?.();
      return result;
    } catch (error) {
      if (isApiError(error)) {
        // Extract field-level errors for inline display
        const fields = error.details?.fields as Record<string, string[]> | undefined;
        if (fields) {
          const mapped: Record<string, string> = {};
          for (const [key, messages] of Object.entries(fields)) {
            mapped[key] = Array.isArray(messages) ? messages[0] : String(messages);
          }
          setFieldErrors(mapped);
        }

        if (showToast) {
          const message = getErrorMessage(error.errorCode, error.message);
          addToast(message, 'error');
        }
      } else if (showToast) {
        if (error instanceof Error) {
          addToast(error.message, 'error');
        } else {
          addToast('เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ', 'error');
        }
      }

      onError?.(error instanceof Error ? error : new Error(String(error)));
      return undefined;
    }
  };

  return { execute, fieldErrors, clearFieldErrors };
}

/**
 * Hook specifically for mutation operations (create, update, delete)
 * Automatically shows success/error toasts and extracts field errors
 */
export function useMutationHandler<T = unknown>(
  successMsg: string,
  options: Omit<ErrorHandlerOptions, 'successMessage' | 'showToast'> = {}
): ErrorHandlerResult<T> {
  return useErrorHandler<T>({
    showToast: true,
    successMessage: successMsg,
    ...options,
  });
}
```

**Step 2: Verify build**

Run: `cd apps/web && bun run build`
Expected: Build succeeds

**Step 3: Commit**

```bash
git add apps/web/src/hooks/useErrorHandler.ts
git commit -m "feat: add field-level error extraction to useErrorHandler hook"
```

---

### Task 8: Migrate frontend pages from alert() to toast — Stock pages

**Files:**
- Modify: `apps/web/src/pages/stock/StockFormPage.tsx`
- Modify: `apps/web/src/pages/stock/StockListPage.tsx`
- Modify: `apps/web/src/pages/stock/StockDetailPage.tsx`

**Transformation pattern for form pages (StockFormPage):**

1. Add import at top:
```typescript
import { useMutationHandler, useErrorHandler } from '../../hooks/useErrorHandler';
```

2. Inside the component, add hooks:
```typescript
const { execute: executeMutation, fieldErrors, clearFieldErrors } = useMutationHandler(
  isEdit ? 'แก้ไขข้อมูลสต็อกสำเร็จ' : 'เพิ่มสต็อกสำเร็จ',
  {
    onSuccess: () => navigate('/stock'),
  }
);
const { execute: executeQuery } = useErrorHandler({ showToast: true });
```

3. Replace save try-catch:
```typescript
// BEFORE:
try {
  setSaving(true);
  if (isEdit) {
    await stockService.update(id!, formData);
    alert('แก้ไขข้อมูลสำเร็จ');
  } else {
    await stockService.create(formData);
    alert('เพิ่มสต็อกสำเร็จ');
  }
  navigate('/stock');
} catch (error) {
  console.error(error);
  alert('เกิดข้อผิดพลาด');
} finally {
  setSaving(false);
}

// AFTER:
setSaving(true);
clearFieldErrors();
const result = await executeMutation(
  isEdit ? stockService.update(id!, formData) : stockService.create(formData)
);
setSaving(false);
// Navigation handled by onSuccess callback
```

4. Replace data loading try-catch:
```typescript
// BEFORE:
try { ... } catch { alert('ไม่สามารถโหลดข้อมูลได้'); }

// AFTER:
await executeQuery(stockService.getById(id!).then(res => { setFormData(res.data); }));
```

5. Add inline field error display on VIN and engine number inputs:
```typescript
{/* VIN input */}
<input
  className={`... ${fieldErrors.vin ? 'border-red-500' : ''}`}
  value={formData.vin}
  onChange={e => { setFormData({...formData, vin: e.target.value}); clearFieldErrors(); }}
/>
{fieldErrors.vin && <p className="text-sm text-red-500 mt-1">{fieldErrors.vin}</p>}

{/* Engine Number input */}
<input
  className={`... ${fieldErrors.enginenumber ? 'border-red-500' : ''}`}
  ...
/>
{fieldErrors.enginenumber && <p className="text-sm text-red-500 mt-1">{fieldErrors.enginenumber}</p>}
```

**Transformation pattern for list pages (StockListPage):**

1. Add import:
```typescript
import { useMutationHandler, useErrorHandler } from '../../hooks/useErrorHandler';
```

2. Add hooks:
```typescript
const { execute: executeDelete } = useMutationHandler('ลบสต็อกสำเร็จ', {
  onSuccess: () => fetchStocks(),
});
const { execute: executeQuery } = useErrorHandler();
```

3. Replace delete confirm + try-catch:
```typescript
// BEFORE:
if (confirm('...')) {
  try { await stockService.delete(id); fetchStocks(); }
  catch { alert('ไม่สามารถลบได้'); }
}

// AFTER:
if (confirm('คุณต้องการลบสต็อกนี้ใช่หรือไม่?')) {
  await executeDelete(stockService.delete(id));
}
```

4. Replace fetch try-catch with executeQuery (for fetchStocks, fetchStats).

**Transformation pattern for detail pages (StockDetailPage):**

Same as list pages — replace alert() with toast via hooks for data loading and delete actions.

**Step: Verify build**

Run: `cd apps/web && bun run build`
Expected: Build succeeds

**Step: Commit**

```bash
git add apps/web/src/pages/stock/
git commit -m "refactor: migrate Stock pages from alert() to toast notifications with field errors"
```

---

### Task 9: Migrate frontend pages from alert() to toast — Sales pages

**Files:**
- Modify: `apps/web/src/pages/sales/SalesFormPage.tsx`
- Modify: `apps/web/src/pages/sales/SalesDetailPage.tsx`

Apply the same transformation patterns from Task 8. Key differences:
- SalesFormPage already has a local `errors` state for form validation — keep that for client-side validation, add `fieldErrors` from `useMutationHandler` for server-side errors.
- SalesDetailPage has status update and delete actions — wrap those with `useMutationHandler`.

**Step: Commit**

```bash
git add apps/web/src/pages/sales/
git commit -m "refactor: migrate Sales pages from alert() to toast notifications"
```

---

### Task 10: Migrate frontend pages from alert() to toast — Customer pages

**Files:**
- Modify: `apps/web/src/pages/customers/CustomersListPage.tsx`
- Modify: `apps/web/src/pages/customers/CustomerFormPage.tsx`
- Modify: `apps/web/src/pages/customers/CustomerDetailPage.tsx`

Apply same transformation patterns. CustomerFormPage should show inline errors for `taxId` field (duplicate tax ID).

**Step: Commit**

```bash
git add apps/web/src/pages/customers/
git commit -m "refactor: migrate Customer pages from alert() to toast notifications"
```

---

### Task 11: Migrate frontend pages from alert() to toast — Remaining pages (batch)

**Files:**
- Modify: `apps/web/src/pages/payments/PaymentFormPage.tsx`
- Modify: `apps/web/src/pages/payments/PaymentDetailPage.tsx`
- Modify: `apps/web/src/pages/users/UsersListPage.tsx`
- Modify: `apps/web/src/pages/users/UserDetailPage.tsx`
- Modify: `apps/web/src/pages/vehicles/VehicleFormPage.tsx`
- Modify: `apps/web/src/pages/vehicles/VehicleDetailPage.tsx`
- Modify: `apps/web/src/pages/vehicles/VehiclesListPage.tsx`
- Modify: `apps/web/src/pages/quotations/QuotationFormPage.tsx`
- Modify: `apps/web/src/pages/quotations/QuotationDetailPage.tsx`
- Modify: `apps/web/src/pages/campaigns/CampaignFormPage.tsx`
- Modify: `apps/web/src/pages/campaigns/CampaignsListPage.tsx`
- Modify: `apps/web/src/pages/interest/InterestDetailPage.tsx`
- Modify: `apps/web/src/pages/interest/InterestEditPage.tsx`
- Modify: `apps/web/src/pages/settings/SettingsPage.tsx`
- Modify: `apps/web/src/components/reports/ExportButton.tsx`

Apply same transformation patterns from Task 8. For each page:
1. Import `useMutationHandler` and/or `useErrorHandler`
2. Replace every `alert()` with appropriate hook call
3. Replace `console.error` in catch blocks (they're now handled by hooks)

**Step: Verify no alert() remaining**

Run: `grep -r "alert(" apps/web/src/pages/ apps/web/src/components/ --include="*.tsx" --include="*.ts"`
Expected: Only `confirm()` calls remain (those are user confirmation dialogs, not error alerts).

**Step: Commit per group**

```bash
git add apps/web/src/pages/payments/ apps/web/src/pages/users/
git commit -m "refactor: migrate Payment and User pages from alert() to toast"

git add apps/web/src/pages/vehicles/ apps/web/src/pages/quotations/
git commit -m "refactor: migrate Vehicle and Quotation pages from alert() to toast"

git add apps/web/src/pages/campaigns/ apps/web/src/pages/interest/ apps/web/src/pages/settings/ apps/web/src/components/reports/
git commit -m "refactor: migrate Campaign, Interest, Settings, and Report pages from alert() to toast"
```

---

### Task 12: Final verification and cleanup

**Step 1: Full build check**

Run:
```bash
bun run build
bun run typecheck
bun run lint
```
Expected: All pass with no errors.

**Step 2: Verify no remaining alert() calls**

Run: `grep -r "window\.alert\|[^.]alert(" apps/web/src/ --include="*.tsx" --include="*.ts"`
Expected: No matches (or only `confirm()` dialogs).

**Step 3: Verify no remaining console.error in API controllers**

Run: `grep -r "console\.error" apps/api/src/modules/ --include="*.ts"`
Expected: No matches in controller files.

**Step 4: Manual smoke test**

1. Start dev: `bun run dev`
2. Create a stock with duplicate VIN → should see toast + inline field error
3. Try to create a sale with already-sold stock → should see toast error
4. Check `apps/api/logs/combined.log` → should have request logs
5. Trigger an error → check `apps/api/logs/error.log` → should have error logged

**Step 5: Final commit (if any fixes needed)**

```bash
git add -A
git commit -m "fix: address issues found during final verification"
```
