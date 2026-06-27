# Vehicle Card Browser HTML Print Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Print the vehicle card from the browser as live HTML (with `@page` sized to the actual Letter paper) instead of downloading a custom-size PDF, fixing the flush-to-edge margin problem and enabling instant preview.

**Architecture:** The API exposes the existing handlebars card template rendered as HTML via `?format=html` (same template/data as the PDF — single source). The frontend loads that HTML into a hidden iframe and calls `print()`, reusing the existing `PrintButton` iframe pattern. The browser controls page size and margins natively through an injected `@page { size: Letter landscape; margin }` rule, so there is no custom-PDF-vs-paper scaling.

**Tech Stack:** ElysiaJS + Bun (API), Handlebars templates, Puppeteer (existing PDF path, untouched), React 19 + Vite (web), `bun:test`.

## Global Constraints

- Physical paper: **US Letter, landscape** → `@page { size: 27.94cm 21.59cm }`.
- Card design width stays **26.85cm** (`.page` width), height **20.71cm** — proportions unchanged from the current PDF.
- Target edge gap (starting point, tuned against a real print): **left ≈ 1mm, top ≈ 1.7mm**.
- Scope: **only** the two vehicle-card variants (`vehicle-card`, `vehicle-card-template`). Do not touch the other ~15 PDF endpoints or remove Puppeteer.
- Auth on the HTML routes is unchanged: `authMiddleware` + `requirePermission('DOC_CAR_DETAIL_CARD')`.
- The existing PDF download path (no `format=html`) must remain byte-for-byte unchanged.
- API tests mock the settings service to avoid a DB dependency (see `apps/api/src/__tests__/pdf.test.ts`). Run API tests from `apps/api`.

---

### Task 1: Extract `renderHtml()` from `generatePdf()` (pure refactor)

Split the HTML-building half of `generatePdf` into a reusable async method so both the PDF path and the new HTML path share one code path. No behavior change.

**Files:**
- Modify: `apps/api/src/modules/pdf/pdf.service.ts` (the `generatePdf` method, ~lines 594-670)
- Test: `apps/api/src/__tests__/pdf.test.ts` (existing regression suite — no new test, just must still pass)

**Interfaces:**
- Produces: `renderHtml(templateType: PdfTemplateType, data: T, options?: PdfOptions): Promise<string>` — returns the full HTML document string (template render + base layout). Used by Task 2 and Task 3.

- [ ] **Step 1: Add the `renderHtml` method** (insert immediately before `generatePdf` in `pdf.service.ts`)

```ts
  /**
   * Render a template + data into the full HTML document (no Puppeteer).
   * Shared by generatePdf (PDF path) and the HTML print endpoints.
   */
  public async renderHtml<T>(
    templateType: PdfTemplateType,
    data: T,
    options: PdfOptions = {}
  ): Promise<string> {
    const template = this.getTemplate(templateType);

    const dbSettings = await import('../settings/settings.service').then((m) =>
      m.settingsService.getSettings()
    );

    const providedHeader = (data as any).header || {};

    const dbHeader = dbSettings
      ? {
          companyName: dbSettings.companyNameTh || DEFAULT_COMPANY_HEADER.companyName,
          address1: dbSettings.addressTh || DEFAULT_COMPANY_HEADER.address1,
          address2: '',
          phone:
            `โทร. ${dbSettings.phone} ${dbSettings.fax ? `โทรสาร. ${dbSettings.fax}` : ''}`.trim(),
          logoBase64: dbSettings.logo || this.logoBase64 || DEFAULT_COMPANY_HEADER.logoBase64,
        }
      : DEFAULT_COMPANY_HEADER;

    const dataWithHeader = {
      ...data,
      header: {
        ...dbHeader,
        ...providedHeader,
        logoBase64: providedHeader.logoBase64 || dbHeader.logoBase64 || this.logoBase64,
      },
      receiptBgBase64: this.receiptBgBase64,
    };

    const content = template(dataWithHeader);
    return this.getBaseHtml(content, options);
  }
```

- [ ] **Step 2: Replace the HTML-building lines inside `generatePdf` with a call to `renderHtml`**

In `generatePdf`, replace everything from `// Get and compile template` down through `const html = this.getBaseHtml(content, options);` (the template fetch, settings import, `dataWithHeader`, `content`, and `html` assignment — roughly lines 600-635) with:

```ts
      // Build the HTML (shared with the HTML print path)
      const html = await this.renderHtml(templateType, data, options);
```

Leave the Puppeteer block (`getBrowser`, `setContent(html, ...)`, `page.pdf`, margins) exactly as-is.

- [ ] **Step 3: Run the existing PDF tests to verify no regression**

Run (from `apps/api`): `bun test src/__tests__/pdf.test.ts`
Expected: PASS — all existing PDF generation tests still pass (delivery receipt, deposit, vehicle card, temporary receipt, stock report, daily payment, browser reuse).

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/modules/pdf/pdf.service.ts
git commit -m "refactor(api): extract renderHtml() from generatePdf()"
```

---

### Task 2: `@page` injection + `renderVehicleCardHtml` / `renderVehicleCardTemplateHtml`

Add an `htmlPage` option that makes `getBaseHtml` emit an `@page` rule (page size = real paper) and neutralize the template's own print padding so the gap is controlled solely by `@page margin`. Add two service methods that produce the card HTML for printing.

**Files:**
- Modify: `apps/api/src/modules/pdf/types.ts` (`PdfOptions`, ~lines 347-361)
- Modify: `apps/api/src/modules/pdf/pdf.service.ts` (`getBaseHtml` ~lines 273-515; add two methods near `generateVehicleCard` ~line 787)
- Test: `apps/api/src/__tests__/pdf-html.test.ts` (new)

**Interfaces:**
- Consumes: `renderHtml(...)` from Task 1.
- Produces:
  - `renderVehicleCardHtml(data: VehicleCardData): Promise<string>`
  - `renderVehicleCardTemplateHtml(data: VehicleCardData): Promise<string>`
  - `PdfOptions.htmlPage?: { size: string; margin: string }`

- [ ] **Step 1: Write the failing test** — create `apps/api/src/__tests__/pdf-html.test.ts`

```ts
import { describe, it, expect, mock } from 'bun:test';
import type { VehicleCardData, CompanyHeader } from '../modules/pdf/types';

// Mock settings to avoid DB dependency (same pattern as pdf.test.ts)
mock.module('../modules/settings/settings.service', () => ({
  settingsService: { getSettings: () => Promise.resolve(null) },
}));

const { pdfService } = await import('../modules/pdf/pdf.service');

const mockHeader: CompanyHeader = {
  logoBase64: '',
  companyName: 'Test Company',
  address1: '123 Test St',
  address2: 'Test City',
  phone: '000-000-0000',
};

const cardData: VehicleCardData = {
  header: mockHeader,
  stockNumber: 'STK-HTML-001',
  car: {
    brand: 'Toyota',
    model: 'Yaris Ativ',
    engineNo: 'ENG-HTML',
    chassisNo: 'CHS-HTML',
    color: 'แดง',
  },
} as VehicleCardData;

describe('Vehicle card HTML print', () => {
  it('renderVehicleCardHtml returns a full HTML doc sized to Letter landscape with card data', async () => {
    const html = await pdfService.renderVehicleCardHtml(cardData);
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('@page');
    expect(html).toContain('27.94cm 21.59cm'); // Letter landscape size
    expect(html).toContain('STK-HTML-001'); // data rendered
    expect(html).toContain('การ์ดรายละเอียดรถยนต์'); // card title text present
  });

  it('renderVehicleCardTemplateHtml returns the frameless overlay HTML with @page', async () => {
    const html = await pdfService.renderVehicleCardTemplateHtml(cardData);
    expect(html).toContain('@page');
    expect(html).toContain('27.94cm 21.59cm');
    expect(html).toContain('STK-HTML-001');
  });

  it('neutralizes the template print padding so the @page margin is the sole gap', async () => {
    const html = await pdfService.renderVehicleCardHtml(cardData);
    expect(html).toContain('html body .page'); // higher-specificity override present
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run (from `apps/api`): `bun test src/__tests__/pdf-html.test.ts`
Expected: FAIL with `pdfService.renderVehicleCardHtml is not a function`.

- [ ] **Step 3: Add the `htmlPage` field to `PdfOptions`** in `apps/api/src/modules/pdf/types.ts`

Inside the `PdfOptions` interface, after the `scale?: number;` line, add:

```ts
  /**
   * When set, render an HTML page for browser printing: emits an @page rule
   * (size = physical paper) and neutralizes template .page print padding so
   * the @page margin is the only edge gap.
   */
  htmlPage?: {
    size: string; // CSS @page size, e.g. '27.94cm 21.59cm' (Letter landscape)
    margin: string; // CSS @page margin shorthand, e.g. '1.7mm 5mm 5mm 1mm'
  };
```

- [ ] **Step 4: Inject the `@page` rule in `getBaseHtml`** in `apps/api/src/modules/pdf/pdf.service.ts`

In `getBaseHtml`, after the `const padding = options.padding || '10mm';` line, add:

```ts
    // For browser HTML printing: page size = physical paper, and a
    // higher-specificity !important override zeroes the template's own
    // .page print padding so the @page margin is the sole edge gap.
    const htmlPageCss = options.htmlPage
      ? `
    @page { size: ${options.htmlPage.size}; margin: ${options.htmlPage.margin}; }
    @media print { html body .page { padding: 0 !important; } }
    `
      : '';
```

Then, in the returned template string, insert `${htmlPageCss}` immediately before the closing `</style>` (right after the existing `/* Print styles */ @media print { ... }` block, before `  </style>`):

```html
    }
    ${htmlPageCss}
  </style>
```

(The `}` shown is the closing brace of the existing `@media print { .page { ... } }` block at ~line 507.)

- [ ] **Step 5: Add the two render methods** in `pdf.service.ts`, immediately after `generateVehicleCardTemplate` (~line 818)

```ts
  /**
   * Render Vehicle Card as HTML for browser printing (การ์ดรายละเอียดรถยนต์).
   * @page is sized to the real paper (US Letter, landscape) so the browser
   * does not scale; the @page margin is the single edge-gap tuning point.
   */
  public async renderVehicleCardHtml(data: VehicleCardData): Promise<string> {
    return this.renderHtml(PdfTemplateType.VEHICLE_CARD, data, {
      width: '26.85cm',
      height: '20.71cm',
      padding: '0mm',
      htmlPage: { size: '27.94cm 21.59cm', margin: '1.7mm 5mm 5mm 1mm' },
    });
  }

  /**
   * Render the frameless Vehicle Card overlay as HTML for browser printing.
   */
  public async renderVehicleCardTemplateHtml(data: VehicleCardData): Promise<string> {
    return this.renderHtml(PdfTemplateType.VEHICLE_CARD_TEMPLATE, data, {
      width: '26.85cm',
      height: '20.71cm',
      padding: '0mm',
      htmlPage: { size: '27.94cm 21.59cm', margin: '1.7mm 5mm 5mm 1mm' },
    });
  }
```

- [ ] **Step 6: Run the test to verify it passes**

Run (from `apps/api`): `bun test src/__tests__/pdf-html.test.ts`
Expected: PASS — all three assertions green.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/modules/pdf/types.ts apps/api/src/modules/pdf/pdf.service.ts apps/api/src/__tests__/pdf-html.test.ts
git commit -m "feat(api): renderVehicleCardHtml with @page Letter sizing for browser print"
```

---

### Task 3: Wire `?format=html` into the two card controller routes

Branch the existing card endpoints on a `format` query param: `html` returns `text/html`, otherwise the existing PDF behavior. The stock lookup and data assembly are shared.

**Files:**
- Modify: `apps/api/src/modules/pdf/pdf.controller.ts` (`/vehicle-card/:stockId` ~lines 985-1093 and `/vehicle-card-template/:stockId` ~lines 1098-1206)

**Interfaces:**
- Consumes: `pdfService.renderVehicleCardHtml`, `pdfService.renderVehicleCardTemplateHtml` (Task 2).

- [ ] **Step 1: Add the `format` branch to `/vehicle-card/:stockId`**

In the handler, replace the final three lines:

```ts
      const pdfBuffer = await pdfService.generateVehicleCard(data);

      set.headers['Content-Type'] = 'application/pdf';
      set.headers['Content-Disposition'] = `attachment; filename="vehicle-card-${stock.vin}.pdf"`;

      return pdfBuffer;
```

with:

```ts
      if (query.format === 'html') {
        set.headers['Content-Type'] = 'text/html; charset=utf-8';
        return await pdfService.renderVehicleCardHtml(data);
      }

      const pdfBuffer = await pdfService.generateVehicleCard(data);

      set.headers['Content-Type'] = 'application/pdf';
      set.headers['Content-Disposition'] = `attachment; filename="vehicle-card-${stock.vin}.pdf"`;

      return pdfBuffer;
```

Then add `query` to the handler's destructured arg (`async ({ params, query, set }) => {`) and add a `query` schema to the route options alongside `params`:

```ts
      params: t.Object({
        stockId: t.String(),
      }),
      query: t.Object({
        format: t.Optional(t.String()),
      }),
```

- [ ] **Step 2: Add the same `format` branch to `/vehicle-card-template/:stockId`**

In that handler, replace:

```ts
      const pdfBuffer = await pdfService.generateVehicleCardTemplate(data);

      set.headers['Content-Type'] = 'application/pdf';
      set.headers['Content-Disposition'] =
        `attachment; filename="vehicle-card-template-${stock.vin}.pdf"`;

      return pdfBuffer;
```

with:

```ts
      if (query.format === 'html') {
        set.headers['Content-Type'] = 'text/html; charset=utf-8';
        return await pdfService.renderVehicleCardTemplateHtml(data);
      }

      const pdfBuffer = await pdfService.generateVehicleCardTemplate(data);

      set.headers['Content-Type'] = 'application/pdf';
      set.headers['Content-Disposition'] =
        `attachment; filename="vehicle-card-template-${stock.vin}.pdf"`;

      return pdfBuffer;
```

Add `query` to the destructured arg and the `query: t.Object({ format: t.Optional(t.String()) })` schema, same as Step 1.

- [ ] **Step 3: Typecheck the API change**

Run (from `apps/api`): `bunx tsc --noEmit -p tsconfig.json 2>&1 | grep -i "pdf.controller" || echo "no pdf.controller type errors"`
Expected: `no pdf.controller type errors` (note: a full `tsc` on apps/api may OOM — grep is to scope output; if it OOMs, instead verify by importing: `bun -e "import('./src/modules/pdf/pdf.controller')"` resolves without error).

- [ ] **Step 4: Manual endpoint smoke test** (DB must be up — see local OrbStack flow)

Start the API, then with a valid ADMIN JWT and a real `stockId`:

```bash
curl -s -H "Authorization: Bearer $JWT" \
  "http://localhost:3001/api/pdf/vehicle-card/$STOCK_ID?format=html" | head -c 400
```

Expected: HTML beginning with `<!DOCTYPE html>` containing `@page` and `27.94cm 21.59cm`.
Also confirm the PDF path is unchanged:

```bash
curl -s -H "Authorization: Bearer $JWT" \
  "http://localhost:3001/api/pdf/vehicle-card/$STOCK_ID" | head -c 5
```

Expected: `%PDF-`.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/pdf/pdf.controller.ts
git commit -m "feat(api): ?format=html on vehicle-card routes returns printable HTML"
```

---

### Task 4: Frontend — print HTML via iframe from the stock detail page

Extract the iframe-print helper from `PrintButton` so it can be reused, then rewire the two stock-detail handlers from "download PDF" to "fetch HTML, print via iframe".

**Files:**
- Modify: `apps/web/src/components/reports/PrintButton.tsx` (extract `printBlob`, ~lines 79-104)
- Modify: `apps/web/src/pages/stock/StockDetailPage.tsx` (`handlePrintVehicleCard` ~lines 101-116, `handlePrintVehicleCardTemplate` ~lines 118-132)

**Interfaces:**
- Consumes: API `?format=html` (Task 3), `api.getBlob` (returns a Blob of any content type).
- Produces: `printBlob(blob: Blob): void` exported from `PrintButton.tsx`.

- [ ] **Step 1: Extract `printBlob` to module scope** in `PrintButton.tsx`

Add this exported function at module scope (e.g. just below the imports, above the component). It is the existing `printPdfBlob` body, generalized — works for both `application/pdf` and `text/html` blobs:

```ts
/**
 * Load a blob (PDF or HTML) into a hidden iframe and open the print dialog on
 * it, so what prints is exactly that document. Works for application/pdf and
 * text/html alike.
 */
export function printBlob(blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  iframe.style.visibility = 'hidden';
  iframe.src = url;
  iframe.onload = () => {
    try {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    } catch {
      window.open(url, '_blank');
    }
    window.setTimeout(() => {
      iframe.remove();
      URL.revokeObjectURL(url);
    }, 60_000);
  };
  document.body.appendChild(iframe);
}
```

Then inside the component, replace the local `printPdfBlob` definition (the `const printPdfBlob = (blob: Blob) => { ... };` block) with a one-line delegate so existing behavior is unchanged:

```ts
  const printPdfBlob = (blob: Blob) => printBlob(blob);
```

- [ ] **Step 2: Verify the report print path still builds**

Run (from `apps/web`): `bunx tsc -b 2>&1 | grep -i "PrintButton" || echo "PrintButton OK"`
Expected: `PrintButton OK`.

- [ ] **Step 3: Rewire the two stock-detail handlers** in `StockDetailPage.tsx`

Add the import near the top (with the other component imports):

```ts
import { printBlob } from '@/components/reports/PrintButton';
```

Replace `handlePrintVehicleCard` with:

```ts
  const handlePrintVehicleCard = async () => {
    if (!stock) return;
    await executeQuery(
      api
        .getBlob(`/api/pdf/vehicle-card/${stock.id}?format=html`)
        .then((blob) => printBlob(blob))
    );
  };
```

Replace `handlePrintVehicleCardTemplate` with:

```ts
  const handlePrintVehicleCardTemplate = async () => {
    if (!stock) return;
    await executeQuery(
      api
        .getBlob(`/api/pdf/vehicle-card-template/${stock.id}?format=html`)
        .then((blob) => printBlob(blob))
    );
  };
```

- [ ] **Step 4: Typecheck the web change**

Run (from `apps/web`): `bunx tsc -b`
Expected: exit 0, no type errors.

- [ ] **Step 5: Manual UI verification** (API + web running, DB up)

1. Open a stock detail page, click **พิมพ์การ์ดรถยนต์ (ปกติ)**.
2. Expected: the browser print dialog opens showing the card; paper size reads **Letter**; orientation **Landscape**; the card is NOT scaled to fit (100%).
3. Repeat for **พิมพ์การ์ดรถยนต์ (ลงฟอร์ม)** — same dialog, frameless overlay variant.
4. Confirm no file download happens (the old behavior is gone).

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/reports/PrintButton.tsx apps/web/src/pages/stock/StockDetailPage.tsx
git commit -m "feat(web): print vehicle card as HTML via iframe instead of downloading PDF"
```

---

### Task 5: Tune the `@page margin` against a real print

The starting `@page margin` is `1.7mm 5mm 5mm 1mm` (top right bottom left). Verify on the real printer and adjust the single value until the measured gap matches.

**Files:**
- Modify (if needed): `apps/api/src/modules/pdf/pdf.service.ts` — the `margin` strings inside `renderVehicleCardHtml` / `renderVehicleCardTemplateHtml`.

- [ ] **Step 1: Print a test card onto Letter** at 100% scale, "Margins: Default/None", "Headers and footers" unticked.

- [ ] **Step 2: Measure** the printed left gap and top gap with a ruler.

- [ ] **Step 3: Adjust** the `@page margin` shorthand (`top right bottom left`) in both render methods so the printed gap reads left ≈ 1mm, top ≈ 1.7mm. Example: if the left prints 2mm too far in, reduce the `left` value by 2mm.

- [ ] **Step 4: Re-run the API HTML test** to confirm nothing broke.

Run (from `apps/api`): `bun test src/__tests__/pdf-html.test.ts`
Expected: PASS.

- [ ] **Step 5: Reprint and confirm** the gap is correct, then commit.

```bash
git add apps/api/src/modules/pdf/pdf.service.ts
git commit -m "fix(api): tune vehicle-card @page margin to measured print gap"
```

---

## Self-Review

**Spec coverage:**
- Root-cause fix (page size = Letter) → Task 2 (`@page size`) + Task 5 (tune). ✓
- API exposes HTML from the same template → Task 1 (`renderHtml`) + Task 2/3. ✓
- Frontend prints HTML via iframe (reuse PrintButton) → Task 4. ✓
- PDF download path unchanged → Task 1 Step 3 regression + Task 3 Step 4 (`%PDF-`). ✓
- Scope limited to the two card variants → only those routes/methods touched. ✓
- Dev-preview goal → `?format=html` openable in a tab (Task 3 Step 4). ✓
- Browser-print-chrome risk documented → spec Risks; surfaced in Task 4 Step 5 + Task 5 Step 1. ✓

**Type consistency:** `renderHtml`, `renderVehicleCardHtml`, `renderVehicleCardTemplateHtml`, `printBlob`, and `PdfOptions.htmlPage` are named identically everywhere they appear. ✓

**Placeholder scan:** every code step contains the actual code; the only deliberately empirical value is the `@page margin` numbers, which Task 5 resolves by measurement (method specified, not a TODO). ✓
