# Dynamic Sale Finance Sheet Design

**Date:** 2026-07-11  
**Status:** Approved for implementation planning  
**Scope:** Sales create/edit form + sales detail — money UI only (not full payments module / quotations / reports rewrite)

## Problem

Staff work with highly variable customer deals (cash, finance, mixed fees, one-off adjustments). Today:

- Finance fields are gated behind non-cash payment modes, so **cash deals feel forced into the wrong mental model**.
- Money is entered in a static form and **viewed separately** on detail; overrides and system calculations are not first-class.
- Calculated values (installment, finance commission preview, totals) are **easy to fight** when a deal needs manual numbers.
- Staff cannot see **which money fields feed which printed documents** (thank-you letter, contract, receipts, etc.).

Customer feedback emphasized cash should be simple/manual. Product decision: make the sheet **fully dynamic from day one**, with **system defaults first** so most deals are “review and save,” while every calculated cell remains overrideable.

## Goals

1. **One FinanceSheet** shared by Sales Form and Sales Detail.
2. **Spreadsheet-style line items**: system rows + optional custom rows.
3. **Calculate first, override anytime**: empty-path = accept system values and save.
4. **Cash preset**: hide finance group; focus on price, discounts, fees, deposit, total.
5. **Document mapping UX**: per-row chips + side panel listing document + field labels.
6. **Backward compatible storage**: keep Sale canonical columns so existing PDF/reports keep working.

## Non-goals (this milestone)

- Full rewrite of payments module, quotation pricing, or report engines.
- True Excel engine (formulas in cells, multi-sheet, pivot).
- User-editable document registry in admin UI (config in code/shared for v1).
- Real-time collaborative editing / advanced concurrency control.

## Decisions (from brainstorm)

| Topic | Decision |
|-------|----------|
| Scope | Form + Detail, same money UI |
| Interaction metaphor | Line-item spreadsheet (not only smart fixed fields) |
| Row flexibility | Fixed system catalog + add custom rows |
| Override behavior | Per-field lock + dependents still auto; cash easy preset (option D) |
| Architecture | Hybrid C: Sale columns canonical + `SaleFinanceLine` for custom (+ override meta) |
| Document UX | Chips in row + click opens side panel (option D) |

## Architecture

```
FinanceSheet (web)
    ↓ uses
@car-stock/shared: finance engine + system row catalog + document registry
    ↓ persists via sales API
Sale (canonical money columns)  +  SaleFinanceLine (custom lines / optional meta)
    ↓ consumed by
Existing PDF templates + reports (read Sale columns as today)
```

### Layers

1. **UI — `FinanceSheet`**  
   Shared component for create/edit and detail (read-only + “edit finance” mode).

2. **Shared package — finance domain**  
   - System row catalog (`fieldKey`, label TH, group, visibility by `paymentMode`, role gate).  
   - Calc engine (pure functions, unit-tested).  
   - Document registry: `fieldKey → { doc, fieldLabel, path?, note? }[]`.

3. **Persistence — hybrid**  
   - System amounts continue to write **existing Sale columns** (`totalAmount`, `depositAmount`, `downPayment`, `financeAmount`, fees, discounts, commissions, rates, terms, etc.).  
   - **Custom lines** stored in new `SaleFinanceLine` (or equivalent) rows.  
   - **Override meta** stored as `editedKeys` (JSON on Sale or side table) so hydrate can restore auto vs edit.

4. **Downstream**  
   PDF/reports keep reading Sale. Custom customer-charge lines that affect total must be reflected into `totalAmount` (and fee invariant) on save so balances stay correct.

## Data model

### Sale (existing, still canonical)

Unchanged columns remain source of truth for system keys, including but not limited to:

- `paymentMode`, `totalAmount`, `depositAmount`, `paidAmount`, `remainingAmount`
- `downPayment`, `financeAmount`, `financeProvider`, `interestRate`, `numberOfTerms`, `monthlyInstallment`
- `carDiscount`, `downPaymentDiscount`
- `insuranceFee`, `compulsoryInsuranceFee`, `registrationFee`
- `salesCommission`, `salesExpense`, `financeCommission`

### New: SaleFinanceLine (custom + extensibility)

| Field | Type | Notes |
|-------|------|--------|
| id | cuid | |
| saleId | fk | |
| key | string | `custom:<uuid>` for user rows; system keys optional if we snapshot |
| label | string | Display name |
| group | enum | e.g. `CUSTOMER_CHARGE`, `DEALER`, `INFO` |
| amount | Decimal | |
| source | enum | `AUTO` \| `EDIT` \| `MANUAL` \| `CUSTOM` |
| sortOrder | int | |
| notes | string? | |
| createdAt / updatedAt | datetime | |

**v1 write rule:** System catalog amounts always sync to Sale columns. Custom rows always live in `SaleFinanceLine`. Optionally also persist system override flags via `Sale.financeEditedKeys Json?` for simpler GET hydrate without joining every system line.

### System row catalog (illustrative keys)

| key | Group | Sale mapping | Visibility |
|-----|-------|--------------|------------|
| car_price | customer | vehicle model price (input to total) | always |
| car_discount | discount | carDiscount | always (role for edit as today) |
| down_payment_discount | discount | downPaymentDiscount | always / finance-relevant |
| insurance_fee | fee | insuranceFee | always |
| compulsory_insurance_fee | fee | compulsoryInsuranceFee | always |
| registration_fee | fee | registrationFee | always |
| deposit | payment | depositAmount | always |
| total_amount | summary | totalAmount | always |
| down_payment | finance | downPayment | FINANCE / MIX |
| finance_amount | finance | financeAmount | FINANCE / MIX |
| finance_provider | finance | financeProvider (text) | FINANCE / MIX |
| interest_rate | finance | interestRate | FINANCE / MIX |
| number_of_terms | finance | numberOfTerms | FINANCE / MIX |
| monthly_installment | finance | monthlyInstallment | FINANCE / MIX |
| sales_commission | dealer | salesCommission | ADMIN/ACCOUNTANT |
| sales_expense | dealer | salesExpense | ADMIN/ACCOUNTANT |
| finance_commission | dealer | financeCommission | ADMIN/ACCOUNTANT |

Exact key list can expand in implementation without changing UI shell.

## Calculation rules

### Sources per cell

| src | Meaning |
|-----|---------|
| auto | Engine-owned; recalculates when dependencies change |
| edit | User override; locked until reset |
| manual | No formula (deposit, free-text provider, most custom) |
| hidden | Not applicable for current paymentMode; excluded from calc |

### Core formulas (align with current product behavior)

**Server invariant (must not break):** on update,  
`remainingAmount = totalAmount + (insuranceFee + compulsoryInsuranceFee + registrationFee) - paidAmount`.  
Create path currently seeds remaining with deposit as initial settlement; payment flows then own `paidAmount`. The sheet must not invent a second remaining formula.

**What lives in `totalAmount` vs fee columns**

- Built-in buyer fees (`insuranceFee`, `compulsoryInsuranceFee`, `registrationFee`) stay **separate Sale columns** and remain **additive** in the remaining formula (as today).
- Auto `totalAmount` is derived from vehicle price minus discounts (and any other amounts the product already treats as part of total — **not** double-counting the three fee columns).
- **Custom `CUSTOMER_CHARGE` lines (v1):** included in the engine’s auto `totalAmount` (so they affect what the customer owes **without** changing the remaining formula or inventing a fourth fee column). They are **not** also added into the three fee columns.
- **Custom `DEALER` / `INFO`:** do not affect `totalAmount` or remaining.

Other rules:

- `price_after_discount = car_price - car_discount` (plus other discount fields per existing product rules).
- **CASH:** finance keys hidden; no installment/finance amount required.
- **FINANCE / MIX:**  
  - Installment auto uses existing form formula:  
    `years = terms/12`, `totalInterest = finance * (rate/100) * years`,  
    `installment = round((finance + totalInterest) / terms)` when rate, terms, finance &gt; 0.  
  - Finance commission **preview** may show the 8% detail-page formula; saved `financeCommission` is the confirmed field (auto default or edit).
- **Override:** keys in `editedKeys` never overwritten by engine. Reset removes key and recalculates.
- **Paid / remaining:** `paidAmount` from payments remains system-owned (not a free sheet cell).

### Cash preset

Selecting CASH:

- Collapses finance group in the sheet.
- Emphasizes price, discounts, buyer fees, deposit, total.
- Staff can type totals/fees directly (manual or edit) without finance scaffolding.

### Mode switch CASH ↔ FINANCE

- Soft-keep finance field values in form state/DB when switching to CASH so toggling back does not wipe work.
- While CASH, finance values do not affect remaining/total calculation.

## UI / UX

### Shared `FinanceSheet`

**Toolbar**

- Payment mode segmented control: เงินสด | ไฟแนนซ์ | ผสม  
- Preset badge when CASH (“กรอกง่าย”)  
- Count of edited fields + “reset all auto” where applicable  

**Main table columns**

1. รายการ (label)  
2. กลุ่ม  
3. จำนวน (editable when allowed)  
4. src (auto / edit / manual) + reset control for edit  
5. เอกสาร (chip: count of mapped docs)

**Side panel — “ใช้ในเอกสาร”**

- Opens on row click or chip click.  
- Lists Thai document name, field label on that document, live value preview.  
- Hover on chip may show short tooltip; panel is the full detail.

**Form vs Detail**

- Form: sheet fully editable (within roles).  
- Detail: read-only sheet + “แก้ไขการเงิน” (permissioned) entering the same editor.

**Custom row**

- Add row: label, group, amount, optional notes.  
- Document chip: “ไม่ map / หมายเหตุ” until a future registry entry exists.

**Role gates**

- Dealer group (commissions, sales expense) visible/editable per existing ADMIN/ACCOUNTANT rules.  
- Discount fields keep existing permission behavior.

**Keyboard**

- Tab between amount cells, Enter to commit — spreadsheet *feel* without embedding a full grid engine in v1.

## Document registry

Config in `@car-stock/shared` (or `packages/shared` finance module), not hardcoded only inside React components.

```ts
// Conceptual shape
type DocMapEntry = {
  doc: PdfTemplateType | string; // e.g. 'thank-you-letter'
  fieldLabel: string;            // Thai label staff recognize
  path?: string;                 // optional template data path
  note?: string;
};

type FinanceDocumentRegistry = Record<string /* fieldKey */, DocMapEntry[]>;
```

### Phase 1 documents

Prioritize sale-facing money documents already in the PDF module:

- thank-you-letter  
- sales-confirmation / sales-confirmation-form  
- contract  
- deposit-receipt  
- payment-receipt  

Expand registry over time without UI redesign.

## API

### Write (create/update sale)

Accept existing sale money fields **plus**:

```ts
{
  // existing money fields…
  editedKeys?: string[];
  customLines?: Array<{
    id?: string;
    label: string;
    group: 'CUSTOMER_CHARGE' | 'DEALER' | 'INFO';
    amount: number;
    notes?: string;
    sortOrder?: number;
  }>;
}
```

Server responsibilities:

1. Zod validate (shared schemas).  
2. Optionally re-run engine for non-overridden consistency checks (warn or coerce policy — default: trust validated payload that already ran client engine; server still enforces remaining/paid invariant).  
3. Persist Sale columns.  
4. Replace/upsert custom lines for the sale.  
5. Persist `editedKeys`.  
6. Recompute `remainingAmount` with existing rules.

### Read

Return sale as today + `customLines` + `editedKeys` so the client can rebuild the sheet via the engine.

## Error handling & edge cases

| Case | Behavior |
|------|----------|
| Discount &gt; price / negative totals | Inline warning; ADMIN/ACCOUNTANT may still save; others blocked or warned (match strictest safe default: warn all, block non-privileged) |
| Empty finance provider on FINANCE | Keep existing required validation |
| Custom CUSTOMER_CHARGE changes | Recalc total if total still auto |
| Delete custom line | Remove from total if it was included |
| Concurrent edits | No new locking scheme in this milestone |

## Testing

1. **Unit (shared engine):** cash path; finance installment; override lock; reset; custom customer charge in total.  
2. **Unit (registry):** every system key has an explicit entry (may be empty array) so missing maps are intentional.  
3. **API:** create/update with `customLines` + `editedKeys`, GET round-trip.  
4. **UI smoke:** Form and Detail share sheet; CASH hides finance; chip opens panel; save without edits keeps auto values.

## Implementation sketch (for planning, not exhaustive)

1. Shared: catalog, engine, registry, Zod extensions.  
2. Prisma: `SaleFinanceLine` + `financeEditedKeys` (or equivalent).  
3. sales.service create/update/get wiring.  
4. Web: `FinanceSheet` component + integrate SalesFormPage / SalesDetailPage.  
5. Map existing PDF field usage into registry content.  
6. Tests + manual QA cash/finance deals.

## Success criteria

- Cash deal: staff complete money entry without finance fields; can save system defaults with zero edits.  
- Finance deal: system fills installment etc.; any cell overridable with visible edit state and reset.  
- Custom one-off customer charge appears in sheet, can affect total when grouped correctly, survives reload.  
- Selecting a row shows which documents/fields use that amount.  
- Existing PDFs and remaining-balance behavior still correct for deals that only use system fields.

## Open points resolved in design

- Prefer hybrid persistence over full line-item rewrite of Sale.  
- Document mapping is read-only guidance in v1 (does not reconfigure PDF templates from the sheet).  
- Payments list remains separate; sheet shows paid/remaining summary from sale aggregates, not a full payment ledger editor (ledger expansion can be a later milestone).
