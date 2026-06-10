# Design: Sale Expense Fields (ค่าใช้จ่ายงานขาย + รายงานการขายประจำเดือน)

**Date:** 2026-06-10
**Status:** Approved
**Origin:** Customer sent a sample monthly sales report (รายงานการขายประจำเดือน) and requested
additional fields: รายการของแถม, ค่าประกันชั้น 1, ค่าพรบ, ค่าจดทะเบียน, รวมค่าใช้จ่าย — shown in
the sales record (ใบบันทึกการขาย). Scope expanded to cover all missing monthly sales report
columns (คอมฯ พนักงานขาย, ค่าใช้จ่ายในการขาย, ค่าตอบไฟแนนซ์).

## Decisions (from brainstorming)

1. ค่าประกันชั้น 1 / ค่าพรบ / ค่าจดทะเบียน are **charged to the buyer**.
2. Buyer-charged fees **roll into the outstanding balance** (remainingAmount).
3. ของแถม is a **list of names only** (no per-item value), editable per sale, pre-filled from campaign.
4. Scope includes **all monthly sales report columns**, not just the 5 customer-requested items.
5. Approach **A — flat columns on Sale** (matches existing pattern: carDiscount, downPaymentDiscount).
6. **Report-first ordering**: monthly sales report (Phase 1) before sales-record PDF polish (Phase 2).

## 1. Schema (Prisma) — 6 new nullable fields on Sale

```prisma
// Charged to buyer (adds to outstanding balance)
insuranceFee           Decimal?  @map("insurance_fee") @db.Decimal(15, 2)            // ค่าประกันชั้น 1
compulsoryInsuranceFee Decimal?  @map("compulsory_insurance_fee") @db.Decimal(15, 2) // ค่าพรบ
registrationFee        Decimal?  @map("registration_fee") @db.Decimal(15, 2)         // ค่าจดทะเบียน

// Dealer side (profit calculation only; does not affect customer balance)
salesCommission        Decimal?  @map("sales_commission") @db.Decimal(15, 2)         // คอมฯ พนักงานขาย
salesExpense           Decimal?  @map("sales_expense") @db.Decimal(15, 2)            // ค่าใช้จ่ายในการขาย
financeCommission      Decimal?  @map("finance_commission") @db.Decimal(15, 2)       // ค่าตอบไฟแนนซ์ (income)
```

- All nullable; no backfill. Old sales render as 0 in reports.
- `รวมค่าใช้จ่าย` (total buyer-charged fees) is **always computed**, never stored:
  `totalFees = insuranceFee + compulsoryInsuranceFee + registrationFee`
- Freebies reuse existing `freebiesSnapshot` (String), stored newline-separated, one gift per line.
  Old free-text data still displays unchanged.
- One migration: `add_sale_expense_fields`.

## 2. Money formulas

**Outstanding balance** (sales.service.ts create/update):

```
remainingAmount = totalAmount (ราคารถ) + totalFees − paidAmount
```

The existing test `apps/api/src/__tests__/update-sale-remaining.test.ts` must be updated and
extended for fee cases.

**Net profit per sale in the monthly report** (คงเหลือสุทธิ):

```
netProfit = (sellingPrice − totalCostWithInterest)   // existing
          + financeCommission
          − salesCommission
          − salesExpense
```

Insurance/พรบ/registration fees are **pass-through** (collected from buyer, paid onward) and do
not affect profit. ⚠ Flagged for confirmation with the customer's accounting team.

## 3. Phase 1 — Monthly sales report (customer priority)

### 3.1 Shared schemas (`packages/shared/src/schemas/index.ts`)
Add the 6 fields (optional numbers) to sale create/update Zod schemas.

### 3.2 API (`apps/api/src/modules/sales/sales.service.ts`)
- Accept and persist the 6 fields on create/update.
- Apply the remainingAmount formula above.

### 3.3 Report service (`apps/api/src/modules/reports/reports.service.ts`)
Replace the placeholder block (lines ~785–791) in `getSalesSummaryReport`:

| Report column (customer form) | Source |
|---|---|
| ส่วนลดตัวรถ / คงเหลือ | `sale.carDiscount` (existing, wire up) |
| ส่วนลดเงินดาวน์ / คงเหลือ | `sale.downPaymentDiscount` (existing, wire up) |
| ค่าคอม (ไฟแนนท์) | `financeCommission` |
| ทะเบียน, พรบ, ขนส่ง | `registrationFee + compulsoryInsuranceFee` |
| แคมเปญขาย | `sale.campaign.name` (relation exists; add to include) |
| คอมฯ พนักงานขาย | `salesCommission` |
| ค่าใช้จ่ายในการขาย | `salesExpense` |
| ค่าเบี้ยประกัน | `insuranceFee` |
| คงเหลือสุทธิ | netProfit formula above |

### 3.4 Report PDF template (`sales-summary-report.hbs`)
- Add/adjust columns to match the customer form layout (two-row header preserved).
- Footer additions: ยอดมูลค่าขาย/ภาษีขาย and ยอดมูลค่าต้นทุน/ภาษีซื้อ (use existing `splitVat()`),
  signature lines ผู้จัดทำ / ผู้ตรวจสอบ.
- A4 landscape (project standard).

### 3.5 Web form (`SalesFormPage.tsx`) — required so the report has data
- New section **"ค่าใช้จ่ายเรียกเก็บจากลูกค้า"**: 3 inputs + live-computed รวมค่าใช้จ่าย display.
- New inputs **คอมฯ พนักงานขาย / ค่าใช้จ่ายในการขาย / ค่าตอบไฟแนนซ์** inside the yellow
  "สำหรับบัญชี/กรรมการ" zone (same treatment as the discount fields).
- `SalesDetailPage.tsx`: display all new values.

## 4. Phase 2 — Sales record PDF (ใบบันทึกการขาย)

`apps/api/src/modules/pdf/pdf.controller.ts` (two hardcoded blocks, ~lines 309 and 447):
- Replace `'0'` placeholders with `insuranceFee`, `compulsoryInsuranceFee` (actInsurance),
  `registrationFee` from the sale.
- `gifts`: parse `freebiesSnapshot` by newline → array for the template's bullet list.
- `totalDelivery` includes totalFees.
- Form: freebies textarea (one per line), pre-filled from the selected campaign's freebies.

## 5. Testing

- Unit: remainingAmount including fees (update existing test + new cases).
- Unit: report column mapping + netProfit formula.
- Visual: Playwright screenshot of both PDFs compared against the customer's sample form.

## Out of scope

- Per-gift values/costs.
- SaleExpense line-item table (rejected approach B).
- Backfilling historical sales.
