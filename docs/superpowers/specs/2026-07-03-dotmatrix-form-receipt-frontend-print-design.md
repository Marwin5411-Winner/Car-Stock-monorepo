# Dot Matrix ใบเสร็จรับเงินชั่วคราว (มีฟอร์ม) — Frontend Print Flow

**Date:** 2026-07-03
**Status:** Approved (Approach A)

## Problem

PaymentDetailPage has two receipt buttons:

| Button | Template | Render path |
|--------|----------|-------------|
| ใบเสร็จ Dot Matrix | `temporary-receipt-bg.hbs` (data-only overlay) | Frontend: popup + `window.print()` via `GET /api/pdf/temporary-receipt/:id/html` |
| ใบเสร็จ A4 (มีฟอร์ม) | `temporary-receipt.hbs` (full form) | Backend PDF download (Puppeteer/Gotenberg) |

The full-form variant should print through the same frontend popup flow as the
overlay variant — popup opens, print dialog appears immediately, CSS `@page`
passes 9×5.5 in to the dot-matrix driver with no per-machine paper setup.

Note: `temporary-receipt.hbs` is **already 9×5.5 in** (`@page { size: 9in 5.5in;
margin: 3mm }`); the "A4" button label is stale.

## Design

### Backend — `apps/api/src/modules/pdf/pdf.controller.ts`

- Extend `GET /api/pdf/temporary-receipt/:paymentId/html` with optional query
  param `withForm` (`t.Optional(t.String())`).
- When `withForm === 'true'`, render `PdfTemplateType.TEMPORARY_RECEIPT`
  (full form) instead of `TEMPORARY_RECEIPT_BG`. Everything else — data
  object, auto-print script injection, headers — is shared unchanged.
- `renderHtml` options for the form variant: `width: '9in'`, `padding: '0mm'`,
  zero margins (same as overlay call). The template's own `@page` rule governs
  the print size/margins.
- The `bankAccount` field is overlay-only; harmless to pass for both.
- No changes to the PDF endpoints (`/temporary-receipt/:id`,
  `/temporary-receipt-bg/:id`).

### Frontend — `apps/web/src/services/payment.service.ts`

- `printReceiptDirect(id, lateFee?, withForm?)`: when `withForm` is true,
  append `withForm=true` to the query string. Same popup/blob flow otherwise.
- Delete `downloadReceiptBg` (replaced by the print flow) and
  `downloadReceipt` if a caller grep confirms it is dead code.

### Frontend — `apps/web/src/pages/payments/PaymentDetailPage.tsx`

- `handlePrintBg` → calls `printReceiptDirect(payment.id, lateFee || undefined, true)`.
- Button label: `ใบเสร็จ A4 (มีฟอร์ม)` → `ใบเสร็จ Dot Matrix (มีฟอร์ม)`.
- Button title: `สำหรับเครื่อง Dot Matrix + กระดาษต่อเนื่องเปล่า — พิมพ์ฟอร์มพร้อมข้อมูล (9×5.5 นิ้ว)`.

## What is intentionally kept / dropped

- **Kept:** backend PDF endpoint for the full-form receipt (no UI caller; a
  file copy is still available via "Save as PDF" in the print dialog).
- **Dropped:** PDF download button. No new React receipt component — the
  Handlebars template stays the single source of truth for both PDF and print.

## Error handling

Unchanged from the existing popup flow: popup-blocked throws a user-facing
error; fetch failure closes the popup and rethrows.

## Testing / verification

- Extend `apps/api/src/__tests__/pdf.test.ts`: `/html?withForm=true` returns
  HTML containing a full-form marker (e.g. the `ใบรับเงินชั่วคราว` title cell)
  plus the auto-print script; without the param it still returns the overlay.
- Visual: start local stack (OrbStack DB), open PaymentDetailPage, click the
  form button, screenshot the popup and compare against the existing
  `receipt-popup-9x5.5in.png` reference.
