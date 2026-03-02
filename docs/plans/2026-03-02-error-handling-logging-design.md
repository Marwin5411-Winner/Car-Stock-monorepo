# Error Handling & Logging Design

**Date:** 2026-03-02
**Status:** Approved

## Problem

1. Backend controllers use manual try-catch with hardcoded status codes, bypassing the global error handler
2. No structured logging — only `console.error()` calls
3. Frontend pages use `window.alert()` instead of the existing toast system and `useErrorHandler` hook
4. Unique constraint violations (duplicate VIN, engine number, stock in active sale) lack specific user-facing error messages
5. No inline field-level error display on forms for API errors

## Solution Overview

### 1. Backend: Pino Logger with File Rotation

**New file:** `apps/api/src/lib/logger.ts`

- Pino logger with two file targets:
  - `logs/error.log` — level `error`, daily rotation, 7-day retention
  - `logs/combined.log` — level `info`+, daily rotation, 14-day retention
- Dev mode: pretty-print to stdout
- Add `logs/` to `.gitignore`

**Integration:**
- Replace `console.error()` in `src/index.ts` global error handler with `logger.error()`
- Add request logging via Elysia lifecycle hooks (`onRequest`/`onAfterResponse`) — method, path, status, duration
- Use `logger.warn()` for business rule violations
- Use `logger.info()` for key operations

### 2. Backend: Controller Cleanup

- Remove try-catch wrappers from controller endpoints
- Let service-thrown errors (`ConflictError`, `NotFoundError`, etc.) propagate to global `onError`
- The global handler already maps all error types correctly

### 3. Backend: Improved Unique Constraint Messages

- Add specific error codes: `DUPLICATE_VIN`, `DUPLICATE_ENGINE_NUMBER`, `STOCK_ALREADY_IN_SALE`
- Improve `handlePrismaError` P2002 handling to extract target field and return specific error codes
- Return field-level details in `ConflictError`: `{ fields: { vin: ["VIN นี้มีอยู่ในระบบแล้ว"] } }`

### 4. Frontend: Toast Migration

- Replace every `window.alert()` across all pages with `useErrorHandler`/`useMutationHandler` hooks
- Hooks already handle Thai error messages via `getErrorMessage()` and toast display
- Add missing Thai error messages to `apps/web/src/lib/errors.ts` for new error codes

### 5. Frontend: Inline Field Errors

- Enhance `useErrorHandler` to extract field-level errors from `ApiError.details`
- Return `fieldErrors` state from the hook
- Forms display: red border on input + Thai error message below
- Toast also fires for general visibility

**Example flow (duplicate VIN):**
1. User submits Stock form with duplicate VIN
2. API returns `{ error: "DUPLICATE_VIN", details: { fields: { vin: ["VIN นี้มีอยู่ในระบบแล้ว"] } } }`
3. `useErrorHandler` populates `fieldErrors.vin`
4. VIN input shows red border + error message
5. Toast notification also appears

## Dependencies

- `pino` — JSON logger (Bun-compatible)
- `pino-pretty` — dev-only pretty printing
- `pino-roll` — log file rotation

## Files to Create/Modify

**New files:**
- `apps/api/src/lib/logger.ts`

**Backend modifications:**
- `apps/api/src/index.ts` — replace console.error with logger, add request logging
- `apps/api/src/lib/errors.ts` — add specific error codes, improve P2002 handling
- `apps/api/src/modules/*/controller.ts` — remove try-catch wrappers
- `apps/api/.gitignore` — add `logs/`

**Frontend modifications:**
- `apps/web/src/lib/errors.ts` — add Thai messages for new error codes
- `apps/web/src/hooks/useErrorHandler.ts` — add field-level error extraction
- `apps/web/src/pages/**/*.tsx` — migrate alert() to hooks (all pages)

## Out of Scope

- Request ID tracking
- Frontend error boundary logging to API
- Error rate metrics/alerting
- Retry mechanisms
