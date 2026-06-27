# Vehicle Card — Browser HTML Print (Approach A)

**Date:** 2026-06-27
**Status:** Approved design, pending implementation plan
**Scope:** การ์ดรายละเอียดรถยนต์ (vehicle card) print path only — 2 variants

## Problem

The vehicle card prints **flush to the top-left edge with no gap** on the customer's
printer. The customer measured the desired gap: **left ≈ 1mm, top ≈ 1.7mm**.

### Root cause

The server renders the card PDF at a **custom page size 26.85×20.71cm**
(`generateVehicleCard` / `generateVehicleCardTemplate` in
`apps/api/src/modules/pdf/pdf.service.ts`). The user prints onto **US Letter
(21.59×27.94cm / 8.5×11in)** selected in the computer's print dialog. The PDF
viewer/printer driver must reconcile the custom PDF page size against Letter →
it scales / fits / centers → margins shift and content lands flush to the edge.

Tweaking the Puppeteer `margin` option (tried earlier: 5mm→1mm, then +1mm/+1.7mm)
only fights the symptom. The real fix is to make the **page size match the actual
paper (Letter)** and control margins natively, which the browser's `@page` rule
does directly.

### Goals (from user)

1. **Fix the flush-to-edge / margin problem** when printing.
2. **Improve dev iteration / preview** (server Puppeteer render is slow to eyeball).

## Approach: print live HTML in the browser

Reuse the app's existing in-app print pattern (`apps/web/src/components/reports/PrintButton.tsx`,
already used by report pages) instead of the current crude "download blob, user
opens & prints" flow. The API exposes the **same handlebars template rendered as
HTML** (single source of truth — no duplicated template), and the frontend loads
it into a hidden iframe and calls `print()`, so the **browser controls page size
and margins via `@page`** and the user gets a live print preview to nudge alignment.

### Data flow

```
[ปุ่มพิมพ์การ์ด in StockDetailPage]
  → api.getBlob('/api/pdf/vehicle-card/:id?format=html')        (JWT attached)
  → text/html blob (handlebars template + @page Letter CSS)
  → URL.createObjectURL(blob) → hidden <iframe>.src
  → iframe.onload → iframe.contentWindow.print()
  → browser print dialog: live preview, user prints onto Letter @ 100%
```

The existing PDF endpoints stay for a "ดาวน์โหลด PDF" file-export use case.

## Changes

### API (`apps/api`)

1. **Extract HTML building from `generatePdf()`** into a reusable
   `renderHtml(templateType, data, options): string` that returns the full HTML
   (template render + `getBaseHtml`). `generatePdf` calls it, then runs Puppeteer.
   Single source — the HTML print and the PDF use the identical template + data.
2. **`?format=html` on both card routes** in `pdf.controller.ts`:
   - `/vehicle-card/:stockId`
   - `/vehicle-card-template/:stockId`
   - Add `query: t.Object({ format: t.Optional(t.String()) })`.
   - When `format === 'html'`: return `renderHtml(...)` with
     `set.headers['Content-Type'] = 'text/html; charset=utf-8'`.
   - Otherwise: unchanged PDF behavior.
   - Auth/permission unchanged: `authMiddleware` + `requirePermission('DOC_CAR_DETAIL_CARD')`.
3. **`@page` injection for HTML mode.** When building HTML for print, the base
   layout (or a per-template block) includes:
   ```css
   @page { size: 27.94cm 21.59cm; margin: <top> <right> <bottom> <left>; }
   ```
   (Letter, **landscape** — the card is a landscape layout.) Page size matches the
   physical paper so the browser does not scale. Margins are the single tuning point.

### Frontend (`apps/web`)

1. **Generalize `PrintButton.printPdfBlob(blob)` → `printBlob(blob)`** — the iframe
   logic is content-type agnostic; a `text/html` blob renders and prints the same
   way a PDF blob does. (Export the helper or lift it so `StockDetailPage` can reuse it.)
2. **Rewire the two handlers** in `apps/web/src/pages/stock/StockDetailPage.tsx`:
   - `handlePrintVehicleCard` → `getBlob('/api/pdf/vehicle-card/${id}?format=html')` then `printBlob`.
   - `handlePrintVehicleCardTemplate` → same with the template route.
   - No new `ApiClient` method needed — `getBlob` already returns a Blob of any content type.
3. **Buttons** keep their current labels (`พิมพ์การ์ดรถยนต์ (ปกติ)` / `(ลงฟอร์ม)`);
   only the behavior changes from download to print.

### Print CSS for the card

- `@page { size: 27.94cm 21.59cm; margin: <tuned> }` — Letter landscape.
- Keep the template's existing `@media print` / `.page` rules; adjust `.page`
  padding in concert with the `@page` margin so the **measured gap (left ≈1mm,
  top ≈1.7mm)** is achieved. Final values are tuned against a real print using the
  live preview — this is the one place to nudge.

## Scope (YAGNI)

- **Only the two vehicle-card variants.** The other ~15 PDFs (reports/receipts) are
  download-only and need no print registration — leave them on server Puppeteer.
- No full migration off Puppeteer. No change to other consumers.

## Verification

1. **Dev preview:** open `/api/pdf/vehicle-card/:id?format=html` in a browser tab →
   instant layout preview; edit CSS, refresh, see result (no Puppeteer round-trip).
2. **Print test:** print onto Letter, measure edges, tune `@page margin` until
   left ≈ 1mm / top ≈ 1.7mm.
3. Confirm the PDF download path (no `format=html`) is unchanged.

## Risks & notes

- **Browser print chrome:** browsers add their own default margins + header/footer.
  The user must select "Margins: Default/None" and untick "Headers and footers", and
  print at 100% / no fit-to-page. `@page { size: letter }` removes the scaling
  ambiguity that the custom-size PDF caused, which is the main win.
- **Cross-browser variance:** low risk — internal tool on a known machine/browser.
- **Single source of truth:** HTML and PDF share the handlebars template; a layout
  change updates both.
- **Orientation:** card is landscape; confirm `@page size` orientation in the live
  preview before tuning margins.

## Out of scope / follow-ups

- Applying the HTML-print pattern to other documents (possible later, not now).
- Removing Puppeteer / dropping the Chromium dependency.
- A dedicated end-user "print settings" helper/onboarding for the browser dialog.
