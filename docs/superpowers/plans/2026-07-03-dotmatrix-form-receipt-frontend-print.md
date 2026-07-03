# Dot Matrix Full-Form Receipt Frontend Print — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The "มีฟอร์ม" temporary receipt prints via the frontend popup + `window.print()` flow (like the existing Dot Matrix overlay button) instead of downloading a backend PDF.

**Architecture:** Extend the existing `GET /api/pdf/temporary-receipt/:paymentId/html` endpoint with a `withForm=true` query param that switches the Handlebars template from the data-only overlay (`TEMPORARY_RECEIPT_BG`) to the full form (`TEMPORARY_RECEIPT`). The frontend's existing popup/auto-print flow gains a `withForm` flag; the PDF-download button becomes a second print button. Dead download methods are deleted.

**Tech Stack:** ElysiaJS (Bun), Handlebars templates, React 19, `bun:test`.

**Spec:** `docs/superpowers/specs/2026-07-03-dotmatrix-form-receipt-frontend-print-design.md`

## Global Constraints

- Paper size is hardware-locked: `@page { size: 9in 5.5in }` comes from the template — do not add page CSS anywhere else.
- Do NOT touch the PDF endpoints (`/temporary-receipt/:paymentId`, `/temporary-receipt-bg/:paymentId`) or `temporary-receipt.hbs` / `temporary-receipt-bg.hbs`.
- Biome formatting: single quotes, 2-space indent, 100-char width. Run `bun run lint` before each commit.
- UI copy is Thai; use the exact strings given in the tasks.
- Do NOT run `tsc --noEmit` in `apps/api` (it OOMs). API is verified by `bun test`; web by `bunx tsc -b`.

---

### Task 1: Backend — `withForm` param on the HTML print endpoint

**Files:**
- Modify: `apps/api/src/modules/pdf/pdf.controller.ts` (endpoint `'/temporary-receipt/:paymentId/html'`, ~line 1328)
- Test: `apps/api/src/__tests__/pdf.test.ts`

**Interfaces:**
- Consumes: `pdfService.renderHtml(templateType, data, options)` (exists), `PdfTemplateType.TEMPORARY_RECEIPT` / `.TEMPORARY_RECEIPT_BG` (exist in `apps/api/src/modules/pdf/types.ts`).
- Produces: `GET /api/pdf/temporary-receipt/:paymentId/html?withForm=true` returns the full-form HTML; without the param, behavior is unchanged (overlay). Task 2 relies on exactly the query-param name `withForm` with value `'true'`.

- [ ] **Step 1: Write the failing tests**

Append this `describe` block at the end of `apps/api/src/__tests__/pdf.test.ts` (before the final closing `});` of `'PdfService — Puppeteer engine'` is fine, or as a sibling top-level describe — match file style):

```ts
describe('renderHtml — temporary receipt HTML print path', () => {
  // Same fixture shape as the existing generateTemporaryReceipt test above.
  const data: TemporaryReceiptData = {
    header: mockHeader,
    receiptNumber: 'TR-2026-0002',
    date: '2026-07-03',
    customerName: 'ทดสอบ ระบบ',
    amount: '10,000.00',
    amountText: 'หนึ่งหมื่นบาทถ้วน',
    description: 'ค่ามัดจำรถ',
    paymentMethod: 'เงินสด',
    receiverName: 'พนักงาน ทดสอบ',
  };
  // Mirrors the options the /html endpoint passes for both templates.
  const options = {
    width: '9in',
    height: '5.5in',
    padding: '0mm',
    margin: { top: '0mm', right: '0mm', bottom: '0mm', left: '0mm' },
  };

  it('full-form template renders the CSS-drawn form (receipt-container)', async () => {
    const html = await pdfService.renderHtml(PdfTemplateType.TEMPORARY_RECEIPT, data, options);
    expect(html).toContain('receipt-container'); // form's root — form template only
    expect(html).not.toContain('f-receipt-no'); // overlay-only positioned cell
  });

  it('overlay template renders data-only cells (f-receipt-no), no form container', async () => {
    const html = await pdfService.renderHtml(PdfTemplateType.TEMPORARY_RECEIPT_BG, data, options);
    expect(html).toContain('f-receipt-no');
    expect(html).not.toContain('receipt-container');
  });
});
```

Marker rationale: `receipt-container` is the form template's root class; `f-receipt-no` exists only in the overlay. The string `ใบรับเงินชั่วคราว` appears in BOTH files (in the overlay it's inside a `{{!-- --}}` Handlebars comment that is stripped from output — too subtle to assert on).

- [ ] **Step 2: Run tests to verify current state**

Run: `cd apps/api && bun test src/__tests__/pdf.test.ts`

Expected: the two new tests PASS already — they exercise existing service code, not the controller change. That is fine: they pin the render contract the endpoint switch depends on. (If either fails, a template class name changed — stop and re-check markers.)

- [ ] **Step 3: Add the `withForm` switch to the endpoint**

In `apps/api/src/modules/pdf/pdf.controller.ts`, endpoint `'/temporary-receipt/:paymentId/html'`:

3a. Handler signature — extend the query type:

```ts
    }: { params: { paymentId: string }; query: { lateFee?: string; withForm?: string }; set: any }) => {
```

3b. Replace the render call (currently hardcodes `TEMPORARY_RECEIPT_BG`):

```ts
      // withForm=true prints the CSS-drawn form too (for blank continuous paper);
      // default remains the data-only overlay for pre-printed SIAMK forms.
      const templateType =
        query.withForm === 'true'
          ? PdfTemplateType.TEMPORARY_RECEIPT
          : PdfTemplateType.TEMPORARY_RECEIPT_BG;

      // Data-only overlay: prints just the values onto the PRE-PRINTED form's
      // boxes. padding 0 so overlay coordinates map directly to the paper origin
      // (no scaling — @page 9×5.5in is passed straight to the dot-matrix driver).
      const html = await pdfService.renderHtml(templateType, data, {
        width: '9in',
        height: '5.5in',
        padding: '0mm',
        margin: { top: '0mm', right: '0mm', bottom: '0mm', left: '0mm' },
      });
```

3c. Query schema — in the endpoint's options object:

```ts
      query: t.Object({ lateFee: t.Optional(t.String()), withForm: t.Optional(t.String()) }),
```

3d. Update the endpoint's swagger `description` to mention the param (append one sentence):

```ts
        description:
          'Returns standalone HTML that auto-prints itself via window.print(). Browser passes 9×5.5 in size to printer driver via CSS @page — no per-machine setup needed. withForm=true renders the full CSS-drawn form (blank paper) instead of the data-only overlay.',
```

- [ ] **Step 4: Run tests + lint**

Run: `cd apps/api && bun test src/__tests__/pdf.test.ts` — Expected: all PASS.
Run: `bun run lint` (repo root) — Expected: no new errors.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/pdf/pdf.controller.ts apps/api/src/__tests__/pdf.test.ts
git commit -m "feat(pdf): temporary-receipt /html endpoint takes withForm=true for full-form print"
```

---

### Task 2: Frontend — print button for the full-form receipt, delete dead download code

**Files:**
- Modify: `apps/web/src/services/payment.service.ts:232-305`
- Modify: `apps/web/src/pages/payments/PaymentDetailPage.tsx` (lines 84, 161-166, 250-259)

**Interfaces:**
- Consumes: `GET /api/pdf/temporary-receipt/:id/html?withForm=true` from Task 1; `api.getBlob` (exists).
- Produces: `paymentService.printReceiptDirect(id: string, lateFee?: number, withForm?: boolean): Promise<void>`. Existing caller `PaymentsListPage.tsx:145` (`printReceiptDirect(paymentId)`) keeps compiling — new param is optional.

- [ ] **Step 1: Update `printReceiptDirect` and delete dead methods in `payment.service.ts`**

1a. DELETE the whole `downloadReceipt` method (lines 232-251, incl. its doc comment) — zero callers.

1b. DELETE the whole `downloadReceiptBg` method (lines 284-305, incl. its doc comment) — its only caller is replaced in Step 2.

1c. Replace `printReceiptDirect`'s signature and query-string building (popup/blob logic stays identical):

```ts
  /**
   * Print temporary receipt directly via browser window.print().
   * Browser passes the @page size (9×5.5 in) from the HTML to the printer driver,
   * so the EPSON Dot Matrix needs no per-machine paper-size setup.
   *
   * withForm=true renders the full CSS-drawn form (for blank continuous paper);
   * default is the data-only overlay for pre-printed forms.
   *
   * Popup is opened synchronously inside the user-gesture (button onClick) so
   * it isn't blocked. The fetched HTML is wrapped in a Blob URL and assigned
   * to popup.location — the popup loads it as a real document, executing the
   * embedded auto-print script naturally without document.write.
   */
  async printReceiptDirect(id: string, lateFee?: number, withForm?: boolean): Promise<void> {
    const popup = window.open('about:blank', '_blank', 'width=900,height=600');
    if (!popup) {
      throw new Error('Popup blocked — please allow popups for this site to print receipts.');
    }

    try {
      const params = new URLSearchParams();
      if (lateFee) params.set('lateFee', String(lateFee));
      if (withForm) params.set('withForm', 'true');
      const qsStr = params.toString();
      const qs = qsStr ? `?${qsStr}` : '';
      const blob = await api.getBlob(`/api/pdf/temporary-receipt/${id}/html${qs}`);
      const htmlBlob =
        blob.type === 'text/html' ? blob : new Blob([await blob.text()], { type: 'text/html' });
      const blobUrl = URL.createObjectURL(htmlBlob);
      popup.location.replace(blobUrl);
      setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
    } catch (error) {
      popup.close();
      console.error('Print receipt error:', error);
      throw error;
    }
  }
```

- [ ] **Step 2: Switch the button in `PaymentDetailPage.tsx`**

2a. Line 84 — rename the state pair:

```ts
  const [printingForm, setPrintingForm] = useState(false);
```

2b. Lines 161-166 — replace `handlePrintBg`:

```ts
  const handlePrintForm = async () => {
    if (!payment) return;
    setPrintingForm(true);
    await executeDownload(paymentService.printReceiptDirect(payment.id, lateFee || undefined, true));
    setPrintingForm(false);
  };
```

2c. Lines 250-259 — replace the second button:

```tsx
                  <button
                    onClick={handlePrintForm}
                    disabled={printingForm}
                    title="สำหรับเครื่อง Dot Matrix + กระดาษต่อเนื่องเปล่า — พิมพ์ฟอร์มพร้อมข้อมูล (9×5.5 นิ้ว)"
                    className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
                  >
                    <Printer className="h-4 w-4 mr-2" />
                    {printingForm ? 'กำลังโหลด...' : 'ใบเสร็จ Dot Matrix (มีฟอร์ม)'}
                  </button>
```

- [ ] **Step 3: Typecheck + lint**

Run: `cd apps/web && bunx tsc -b` — Expected: no errors (also proves the dead methods had no other callers).
Run: `bun run lint` (repo root) — Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/services/payment.service.ts apps/web/src/pages/payments/PaymentDetailPage.tsx
git commit -m "feat(web): full-form receipt prints via frontend popup, drop PDF-download dead code"
```

---

### Task 3: End-to-end visual verification

**Files:** none (verification only)

**Interfaces:**
- Consumes: everything from Tasks 1-2, local stack per `reference_local_db_smoke_test` memory (OrbStack DB `car-stock-db`, API from source with `PDF_ASSETS_DIR`, seed creds `admin/admin123`).

- [ ] **Step 1: Start the local stack**

```bash
orb start                      # brings up car-stock-db (postgres/postgres/car_stock)
bun run dev                    # API :3001 + web :5173 (repo root)
```

If the DB container is not running, follow `reference_local_db_smoke_test` memory notes.

- [ ] **Step 2: Verify endpoint output directly**

With a valid ADMIN JWT (mint per memory notes or log in as admin/admin123 and copy from localStorage), pick any payment id and fetch:

```bash
curl -s -H "Authorization: Bearer $JWT" "http://localhost:3001/api/pdf/temporary-receipt/$PAYMENT_ID/html?withForm=true" | grep -c receipt-container   # expect ≥ 1
curl -s -H "Authorization: Bearer $JWT" "http://localhost:3001/api/pdf/temporary-receipt/$PAYMENT_ID/html" | grep -c f-receipt-no                     # expect ≥ 1 (overlay unchanged)
```

- [ ] **Step 3: Browser check**

Log in at `http://localhost:5173` (admin/admin123), open a payment detail page, click **ใบเสร็จ Dot Matrix (มีฟอร์ม)** — a popup must open showing the full form (frame, header, table) at receipt proportions with the print dialog appearing automatically. Screenshot the popup and compare against `receipt-popup-9x5.5in.png` (repo root, from the earlier template-rework session). Also click the original **ใบเสร็จ Dot Matrix** button — overlay behavior must be unchanged.

- [ ] **Step 4: Report**

No commit. Report pass/fail with the screenshot; if layout is off, stop and surface findings before patching.
