# Quotation Detail Page Bug Fix

## Problem
Page redirected back to list every time.

## Root Cause
`.then(data => setQuotation(data))` chained inside `executeQuery()` returns `void` → `undefined` → `if (!result)` always true → navigate away.

## Fix (`apps/web/src/pages/quotations/QuotationDetailPage.tsx`)
```typescript
// Before (bug)
const result = await executeQuery(
  quotationService.getById(id).then(data => setQuotation(data))
);
if (!result) navigate('/quotations');

// After (fixed)
const result = await executeQuery(quotationService.getById(id));
if (result) setQuotation(result);
else navigate('/quotations');
```

## Pattern Warning
Never chain `.then(setState)` inside `executeQuery()` — it swallows the return value.