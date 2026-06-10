# Sale Expense Fields Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add 6 expense fields to Sale (insurance, compulsory insurance, registration, sales commission, sales expense, finance commission), wire them through the monthly sales report (priority) and the sales-record PDF, with form inputs to capture the data.

**Architecture:** Flat nullable Decimal columns on the existing Sale model (approach A from spec `docs/superpowers/specs/2026-06-10-sale-expense-fields-design.md`). Buyer-charged fees roll into `remainingAmount`; dealer-side amounts only affect report profit. `รวมค่าใช้จ่าย` is always computed, never stored. Freebies reuse `freebiesSnapshot` newline-separated.

**Tech Stack:** Bun monorepo — ElysiaJS + Prisma (PostgreSQL) API, React 19 + Vite web, Zod schemas in `@car-stock/shared`, Handlebars PDF templates, Bun test runner, Biome lint.

**Key money formulas (the spec):**
```
totalFees       = insuranceFee + compulsoryInsuranceFee + registrationFee   (computed, never stored)
remainingAmount = totalAmount + totalFees − paidAmount
netProfit       = (sellingPrice − totalCostWithInterest) + financeCommission − salesCommission − salesExpense
```
Buyer fees are pass-through for profit (collected from buyer, paid onward) — they appear as columns but do not change netProfit.

---

## Task 1: Prisma schema + migration

**Files:**
- Modify: `apps/api/prisma/schema.prisma` (Sale model, after `downPaymentDiscount` ~line 254)

> ⚠ Pre-check: `git status` shows `schema.prisma` already has uncommitted changes from earlier work (payment receiving-bank snapshot). Do NOT revert them; only add the new lines.

- [ ] **Step 1: Add the 6 fields to the Sale model**

In `apps/api/prisma/schema.prisma`, find the Sale model line:

```prisma
  downPaymentDiscount    Decimal?      @map("down_payment_discount") @db.Decimal(15, 2)
```

Insert immediately after it:

```prisma
  // Charged to buyer — adds to outstanding balance (remainingAmount)
  insuranceFee           Decimal?      @map("insurance_fee") @db.Decimal(15, 2)
  compulsoryInsuranceFee Decimal?      @map("compulsory_insurance_fee") @db.Decimal(15, 2)
  registrationFee        Decimal?      @map("registration_fee") @db.Decimal(15, 2)
  // Dealer side — report profit only, never affects customer balance
  salesCommission        Decimal?      @map("sales_commission") @db.Decimal(15, 2)
  salesExpense           Decimal?      @map("sales_expense") @db.Decimal(15, 2)
  financeCommission      Decimal?      @map("finance_commission") @db.Decimal(15, 2)
```

- [ ] **Step 2: Create the migration and regenerate the client**

Run from repo root:
```bash
cd apps/api && bunx prisma migrate dev --name add_sale_expense_fields && cd ../..
```
Expected: new folder `apps/api/prisma/migrations/<timestamp>_add_sale_expense_fields/` containing `ALTER TABLE "sales" ADD COLUMN ...` for the 6 columns, and "Generated Prisma Client".

- [ ] **Step 3: Typecheck**

Run: `bun run typecheck`
Expected: PASS (no new errors — fields not used anywhere yet).

- [ ] **Step 4: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations
git commit -m "feat(api): add sale expense fields to schema"
```

---

## Task 2: Shared Zod schemas

**Files:**
- Modify: `packages/shared/src/schemas/index.ts` (SaleSchema ~line 370, CreateSaleSchema ~line 409)

- [ ] **Step 1: Add response fields to SaleSchema**

Find in SaleSchema:
```ts
  downPayment: z.number().nullable(),
  financeAmount: z.number().nullable(),
  financeProvider: z.string().nullable(),
```
Insert after:
```ts
  insuranceFee: z.number().nullable().optional(),
  compulsoryInsuranceFee: z.number().nullable().optional(),
  registrationFee: z.number().nullable().optional(),
  salesCommission: z.number().nullable().optional(),
  salesExpense: z.number().nullable().optional(),
  financeCommission: z.number().nullable().optional(),
```
(`.optional()` because existing API responses constructed before this change may omit them.)

- [ ] **Step 2: Add input fields to CreateSaleSchema**

Find in CreateSaleSchema:
```ts
  carDiscount: z.number().optional(),
  downPaymentDiscount: z.number().optional(),
```
Insert after:
```ts
  insuranceFee: z.number().min(0).optional(),
  compulsoryInsuranceFee: z.number().min(0).optional(),
  registrationFee: z.number().min(0).optional(),
  salesCommission: z.number().min(0).optional(),
  salesExpense: z.number().min(0).optional(),
  financeCommission: z.number().min(0).optional(),
```
`UpdateSaleSchema = CreateSaleSchema.partial()` picks these up automatically — no change needed there.

- [ ] **Step 3: Typecheck and commit**

Run: `bun run typecheck` → PASS
```bash
git add packages/shared/src/schemas/index.ts
git commit -m "feat(shared): add sale expense fields to Zod schemas"
```

---

## Task 3: Fee-aware remainingAmount (TDD)

**Files:**
- Test: `apps/api/src/__tests__/update-sale-remaining.test.ts`
- Modify: `apps/api/src/modules/sales/sales.service.ts` (serializeSale ~line 23, createSale ~line 402, updateSale ~lines 487–544)

The test file mirrors the production formula (documented in its header: "the assertions are the spec"). Update the mirror + assertions first, watch new cases fail against the old mirror, then change the mirror and production together.

- [ ] **Step 1: Update the test — new invariant `remaining = total + fees − paid`**

In `apps/api/src/__tests__/update-sale-remaining.test.ts`, replace `recalcRemaining` with a fee-aware version and update the doc header invariant line to `remainingAmount = totalAmount + totalFees - paidAmount`:

```ts
// Mirror the formula. Numbers mirror `toNumber()` output: plain `number`.
// `fees` = insuranceFee + compulsoryInsuranceFee + registrationFee (buyer-charged).
function recalcRemaining(
  newTotal: number,
  newDeposit: number,
  paid: number,
  fees = 0
): { remaining: number; throws: false } | { throws: true; message: string } {
  if (newDeposit > newTotal) {
    return {
      throws: true,
      message: 'Deposit amount cannot exceed total amount',
    };
  }
  const remaining = newTotal + fees - paid;
  if (remaining < 0) {
    return {
      throws: true,
      message: `ยอดค้างชำระติดลบ — ไม่สามารถลดยอดได้ (ชำระแล้ว ${paid.toLocaleString()} บาท)`,
    };
  }
  return { remaining, throws: false };
}
```

Append this describe block at the end of the file:

```ts
describe('updateSale — buyer-charged fees add to remaining', () => {
  it('fees only, nothing paid: remaining = total + fees', () => {
    // 1M car + 25k insurance + 600 พรบ + 2,400 registration
    const r = recalcRemaining(1_000_000, 0, 0, 28_000);
    expect(r.throws).toBe(false);
    if (!r.throws) expect(r.remaining).toBe(1_028_000);
  });

  it('car fully paid but fees outstanding: remaining = fees (not 0)', () => {
    const r = recalcRemaining(1_000_000, 100_000, 1_000_000, 28_000);
    expect(r.throws).toBe(false);
    if (!r.throws) expect(r.remaining).toBe(28_000);
  });

  it('car + fees fully paid: remaining = 0', () => {
    const r = recalcRemaining(1_000_000, 100_000, 1_028_000, 28_000);
    expect(r.throws).toBe(false);
    if (!r.throws) expect(r.remaining).toBe(0);
  });

  it('zero fees behaves exactly like before (backward compat)', () => {
    const r = recalcRemaining(1_000_000, 100_000, 50_000, 0);
    expect(r.throws).toBe(false);
    if (!r.throws) expect(r.remaining).toBe(950_000);
  });

  it('overpay beyond total + fees throws', () => {
    const r = recalcRemaining(900_000, 0, 1_000_000, 28_000);
    expect(r.throws).toBe(true);
    if (r.throws) expect(r.message).toMatch(/ค้างชำระติดลบ/);
  });
});
```

- [ ] **Step 2: Run the test file**

Run: `cd apps/api && bun test src/__tests__/update-sale-remaining.test.ts`
Expected: ALL PASS (the mirror was updated with the assertions — passing confirms the mirror and the new cases agree; production is changed next to match the mirror).

- [ ] **Step 3: createSale — include fees in initial remaining**

In `apps/api/src/modules/sales/sales.service.ts` replace (~line 401):
```ts
    // Calculate remaining amount
    const remainingAmount = validated.totalAmount - (validated.depositAmount || 0);
```
with:
```ts
    // Calculate remaining amount.
    // Buyer-charged fees (insurance / พรบ / registration) are part of what the
    // customer owes: remaining = total + fees − settled.
    const createFees =
      (validated.insuranceFee || 0) +
      (validated.compulsoryInsuranceFee || 0) +
      (validated.registrationFee || 0);
    const remainingAmount = validated.totalAmount + createFees - (validated.depositAmount || 0);
```

- [ ] **Step 4: updateSale — recalc when fees change, include fees in formula**

Replace the recalculation block (~lines 522–544). The `if` condition gains fee fields, the `select` gains the 3 columns, and the formula gains `newFees`:

```ts
    const feeFields = ['insuranceFee', 'compulsoryInsuranceFee', 'registrationFee'] as const;
    const feeChanged = feeFields.some((f) => validated[f] !== undefined);

    if (
      validated.totalAmount !== undefined ||
      validated.depositAmount !== undefined ||
      feeChanged
    ) {
      const currentSale = await db.sale.findUnique({
        where: { id },
        select: {
          totalAmount: true,
          depositAmount: true,
          paidAmount: true,
          insuranceFee: true,
          compulsoryInsuranceFee: true,
          registrationFee: true,
        },
      });

      const newTotal = validated.totalAmount !== undefined ? validated.totalAmount : toNumber(currentSale!.totalAmount);
      const newDeposit = validated.depositAmount !== undefined ? validated.depositAmount : toNumber(currentSale!.depositAmount);
      const paid = toNumber(currentSale!.paidAmount);
      const newFees = feeFields.reduce(
        (sum, f) =>
          sum + (validated[f] !== undefined ? (validated[f] as number) : (toNumberOrNull(currentSale![f]) || 0)),
        0
      );

      if (newDeposit > newTotal) {
        throw new BadRequestError('Deposit amount cannot exceed total amount');
      }

      const newRemaining = newTotal + newFees - paid;
      if (newRemaining < 0) {
        throw new BadRequestError(
          `ยอดค้างชำระติดลบ — ไม่สามารถลดยอดได้ (ชำระแล้ว ${paid.toLocaleString()} บาท)`
        );
      }

      validated.remainingAmount = newRemaining;
    }
```
Keep the long invariant comment above the block but update its first line to: `// Invariant: remainingAmount = totalAmount + totalFees - paidAmount.`

- [ ] **Step 5: ACCOUNTANT allowed fields + Decimal serialization**

In the same file, `updateSale` allowedFields list (~line 487) — add the 6 fields:
```ts
      const allowedFields = [
        'totalAmount', 'depositAmount', 'paymentMode', 'downPayment',
        'financeAmount', 'financeProvider', 'carDiscount', 'downPaymentDiscount',
        'discountSnapshot', 'freebiesSnapshot',
        'insuranceFee', 'compulsoryInsuranceFee', 'registrationFee',
        'salesCommission', 'salesExpense', 'financeCommission',
        'interestRate', 'numberOfTerms', 'monthlyInstallment', 'notes',
      ];
```

In `serializeSale` (~line 23), after `downPaymentDiscount: toNumberOrNull(sale.downPaymentDiscount),` add:
```ts
    insuranceFee: toNumberOrNull(sale.insuranceFee),
    compulsoryInsuranceFee: toNumberOrNull(sale.compulsoryInsuranceFee),
    registrationFee: toNumberOrNull(sale.registrationFee),
    salesCommission: toNumberOrNull(sale.salesCommission),
    salesExpense: toNumberOrNull(sale.salesExpense),
    financeCommission: toNumberOrNull(sale.financeCommission),
```

- [ ] **Step 6: Run tests + typecheck**

Run: `cd apps/api && bun test` → all suites PASS
Run: `bun run typecheck` (repo root) → PASS

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/__tests__/update-sale-remaining.test.ts apps/api/src/modules/sales/sales.service.ts
git commit -m "feat(api): buyer-charged fees roll into sale remaining amount"
```

---

## Task 4: Report service — real data + netProfit + summary totals (TDD)

**Files:**
- Test: `apps/api/src/__tests__/sales-summary-report-fields.test.ts` (create)
- Modify: `apps/api/src/modules/reports/reports.service.ts` (`getSalesSummaryReport` lines ~651–800)

- [ ] **Step 1: Write the mirror test for the netProfit formula and fee mapping**

Create `apps/api/src/__tests__/sales-summary-report-fields.test.ts`:

```ts
/**
 * Mirror tests for the monthly sales report per-sale money mapping.
 *
 * Formula under test (spec: docs/superpowers/specs/2026-06-10-sale-expense-fields-design.md):
 *   netProfit = (sellingPrice − totalCostWithInterest)
 *             + financeCommission − salesCommission − salesExpense
 * Buyer-charged fees (insurance / พรบ / registration) are pass-through and
 * must NOT change netProfit. The logic mirrors getSalesSummaryReport in
 * apps/api/src/modules/reports/reports.service.ts — the assertions are the spec.
 */

import { describe, it, expect } from 'bun:test';

function computeNetProfit(input: {
  sellingPrice: number;
  totalCostWithInterest: number;
  financeCommission?: number | null;
  salesCommission?: number | null;
  salesExpense?: number | null;
}): number {
  return (
    input.sellingPrice -
    input.totalCostWithInterest +
    (input.financeCommission || 0) -
    (input.salesCommission || 0) -
    (input.salesExpense || 0)
  );
}

function computeTransportFee(input: {
  registrationFee?: number | null;
  compulsoryInsuranceFee?: number | null;
}): number {
  return (input.registrationFee || 0) + (input.compulsoryInsuranceFee || 0);
}

describe('monthly sales report — per-sale money mapping', () => {
  it('netProfit = gross profit + finance commission − staff commission − sales expense', () => {
    expect(
      computeNetProfit({
        sellingPrice: 1_000_000,
        totalCostWithInterest: 900_000,
        financeCommission: 15_000,
        salesCommission: 5_000,
        salesExpense: 3_000,
      })
    ).toBe(107_000);
  });

  it('null dealer-side fields behave as 0 (old sales)', () => {
    expect(
      computeNetProfit({
        sellingPrice: 1_000_000,
        totalCostWithInterest: 900_000,
        financeCommission: null,
        salesCommission: null,
        salesExpense: null,
      })
    ).toBe(100_000);
  });

  it('buyer-charged fees are pass-through — absent from netProfit inputs by design', () => {
    // The formula takes no insurance/registration argument at all; this test
    // documents the decision (spec §2) rather than guarding a code path.
    const base = computeNetProfit({ sellingPrice: 500_000, totalCostWithInterest: 450_000 });
    expect(base).toBe(50_000);
  });

  it('ทะเบียน/พรบ/ขนส่ง column = registrationFee + compulsoryInsuranceFee', () => {
    expect(computeTransportFee({ registrationFee: 2_400, compulsoryInsuranceFee: 600 })).toBe(3_000);
    expect(computeTransportFee({})).toBe(0);
  });
});
```

- [ ] **Step 2: Run the new test file**

Run: `cd apps/api && bun test src/__tests__/sales-summary-report-fields.test.ts`
Expected: PASS (mirror is self-contained; it now pins the formula production must match).

- [ ] **Step 3: Add campaign to the report query include**

In `getSalesSummaryReport` (~line 653), inside `include: {`, after `customer: { select: { name: true, type: true } },` add:
```ts
      campaign: { select: { name: true } },
```

- [ ] **Step 4: Replace the placeholder mapping with real fields**

In the `saleItems` map, replace (~line 738):
```ts
    const totalCostWithInterest = totalCost + accumulatedInterest;
    const netProfit = sellingPrice - totalCostWithInterest; // Net Profit includes interest cost
```
with:
```ts
    const totalCostWithInterest = totalCost + accumulatedInterest;
    const financeCommission = toNumber(sale.financeCommission) || 0;
    const salesCommission = toNumber(sale.salesCommission) || 0;
    const salesExpense = toNumber(sale.salesExpense) || 0;
    // Spec: netProfit = gross profit + finance commission − staff commission − sales expense.
    // Buyer-charged fees are pass-through and excluded.
    const netProfit =
      sellingPrice - totalCostWithInterest + financeCommission - salesCommission - salesExpense;
```

Replace (~line 759):
```ts
      discountAmount: toNumber(sale.discountSnapshot) || 0,
```
with:
```ts
      discountAmount: toNumber(sale.carDiscount) || toNumber(sale.discountSnapshot) || 0,
      downPaymentDiscount: toNumber(sale.downPaymentDiscount) || 0,
```

Replace the placeholder block (~lines 785–791):
```ts
      // Placeholder fields for report columns not yet in system
      financeReturn: 0, // ค่าตอบไฟแนนซ์
      transportFee: 0, // ทะเบียน/พรบ/ขนส่ง (Income or Expense?)
      campaignName: '-', // แคมเปญขาย
      salesCommission: 0, // คอมฯ พนักงานขาย
      salesExpense: 0, // ค่าใช้จ่ายในการขาย
      insurancePremium: 0, // ค่าเบี้ยประกัน
```
with:
```ts
      financeReturn: financeCommission, // ค่าตอบไฟแนนซ์
      transportFee:
        (toNumber(sale.registrationFee) || 0) + (toNumber(sale.compulsoryInsuranceFee) || 0), // ทะเบียน/พรบ/ขนส่ง
      campaignName: sale.campaign?.name || '-', // แคมเปญขาย
      salesCommission, // คอมฯ พนักงานขาย
      salesExpense, // ค่าใช้จ่ายในการขาย
      insurancePremium: toNumber(sale.insuranceFee) || 0, // ค่าเบี้ยประกัน
```

- [ ] **Step 5: Add summary totals for the new columns + VAT split**

After the existing summary lines (~line 800, after `const avgSaleAmount = ...`), add:

```ts
  // Column totals + VAT split for the report footer (customer form layout)
  const sumField = (field: string) =>
    saleItems.reduce((sum, s) => sum + ((s as Record<string, any>)[field] || 0), 0);

  const totalCarDiscount = sumField('discountAmount');
  const totalDownPaymentDiscount = sumField('downPaymentDiscount');
  const totalDownPayment = sumField('downPayment');
  const totalFinanceAmount = sumField('financeAmount');
  const totalFinanceReturn = sumField('financeReturn');
  const totalTransportFee = sumField('transportFee');
  const totalCostSum = sumField('totalCost');
  const totalSalesCommission = sumField('salesCommission');
  const totalSalesExpense = sumField('salesExpense');
  const totalInsurancePremium = sumField('insurancePremium');
  const totalNetProfit = sumField('netProfit');

  // ยอดมูลค่าขาย/ภาษีขาย from selling price; ยอดมูลค่าต้นทุน/ภาษีซื้อ from base cost
  const saleVat = saleItems.reduce(
    (acc, s) => {
      const split = splitVat(s.totalAmount);
      return { net: acc.net + split.net, vat: acc.vat + split.vat };
    },
    { net: 0, vat: 0 }
  );
  const costVat = saleItems.reduce(
    (acc, s) => {
      const split = splitVat(s.baseCost);
      return { net: acc.net + split.net, vat: acc.vat + split.vat };
    },
    { net: 0, vat: 0 }
  );
```

Then in the returned `summary` object (~line 935, after `totalRemaining,`), add:
```ts
      totalCarDiscount,
      totalDownPaymentDiscount,
      totalDownPayment,
      totalFinanceAmount,
      totalFinanceReturn,
      totalTransportFee,
      totalCostSum,
      totalSalesCommission,
      totalSalesExpense,
      totalInsurancePremium,
      totalNetProfit,
      saleVatNet: Math.round(saleVat.net * 100) / 100,
      saleVatAmount: Math.round(saleVat.vat * 100) / 100,
      costVatNet: Math.round(costVat.net * 100) / 100,
      costVatAmount: Math.round(costVat.vat * 100) / 100,
```

- [ ] **Step 6: Run tests + typecheck**

Run: `cd apps/api && bun test` → PASS; `bun run typecheck` → PASS

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/__tests__/sales-summary-report-fields.test.ts apps/api/src/modules/reports/reports.service.ts
git commit -m "feat(api): wire real expense fields into monthly sales report"
```

---

## Task 5: Report PDF template — match the customer form

**Files:**
- Modify: `apps/api/src/modules/pdf/templates/sales-summary-report.hbs`

- [ ] **Step 1: Swap the dead "ค่างวด" column for ส่วนลดดาวน์**

The customer form has เงินดาวน์ → ส่วนลด → คงเหลือ; the template's ค่างวด column always renders "-". Replace header (~line 75):
```html
        <th rowspan="2" style="width: 5%">ค่างวด</th>
```
with:
```html
        <th rowspan="2" style="width: 5%">ส่วนลด<br>ดาวน์</th>
```
and the body cell (~line 113):
```html
        <td class="text-right">-</td>
```
with:
```html
        <td class="text-right">{{formatCurrency downPaymentDiscount}}</td>
```

- [ ] **Step 2: Extend the totals row to cover every money column**

Replace the totals row (~lines 129–141):
```html
      <tr style="font-weight: bold; background-color: #eee;">
        <td colspan="3" class="text-right">รวมทั้งสิ้น ({{summary.totalSales}} คัน)</td>
        <td class="text-right">{{formatCurrency summary.totalAmount}}</td>
        <td class="text-right"></td>
        <td class="text-right"></td>
        <td class="text-right"></td>
        <td class="text-right"></td>
        <td class="text-right">{{formatCurrency summary.totalRemaining}}</td>
        <td class="text-right"></td>
        <td class="text-right"></td>
        <td class="text-right">{{formatCurrency summary.totalPaid}}</td>
        <td colspan="9"></td>
      </tr>
```
with:
```html
      <tr style="font-weight: bold; background-color: #eee;">
        <td colspan="3" class="text-right">รวมทั้งสิ้น ({{summary.totalSales}} คัน)</td>
        <td class="text-right">{{formatCurrency summary.totalAmount}}</td>
        <td class="text-right">{{formatCurrency summary.totalCarDiscount}}</td>
        <td class="text-right"></td>
        <td class="text-right">{{formatCurrency summary.totalDownPayment}}</td>
        <td class="text-right">{{formatCurrency summary.totalDownPaymentDiscount}}</td>
        <td class="text-right">{{formatCurrency summary.totalRemaining}}</td>
        <td class="text-right">{{formatCurrency summary.totalFinanceAmount}}</td>
        <td class="text-right">{{formatCurrency summary.totalFinanceReturn}}</td>
        <td class="text-right">{{formatCurrency summary.totalPaid}}</td>
        <td></td>
        <td class="text-right">{{formatCurrency summary.totalTransportFee}}</td>
        <td class="text-right">{{formatCurrency summary.totalCostSum}}</td>
        <td></td>
        <td class="text-right"></td>
        <td class="text-right">{{formatCurrency summary.totalSalesCommission}}</td>
        <td class="text-right">{{formatCurrency summary.totalSalesExpense}}</td>
        <td class="text-right">{{formatCurrency summary.totalInsurancePremium}}</td>
        <td class="text-right">{{formatCurrency summary.totalNetProfit}}</td>
      </tr>
```

- [ ] **Step 3: Add the VAT summary + signature footer**

Replace the existing footer (~lines 146–148):
```html
<div class="footer" style="margin-top: 50px; text-align: right; font-size: 10px; color: #666;">
  พิมพ์เมื่อ: {{formatThaiDateWithDay (currentThaiDate)}}
</div>
```
with:
```html
<table style="width: 65%; margin-top: 18px; font-size: 10px; border: none;">
  <tr>
    <td style="border: none; width: 18%;"><strong>ยอดมูลค่าขาย</strong></td>
    <td style="border: none; width: 17%;" class="text-right">{{formatCurrency summary.saleVatNet}}</td>
    <td style="border: none; width: 13%;"></td>
    <td style="border: none; width: 18%;"><strong>ยอดมูลค่าต้นทุน</strong></td>
    <td style="border: none; width: 17%;" class="text-right">{{formatCurrency summary.costVatNet}}</td>
  </tr>
  <tr>
    <td style="border: none;"><strong>ภาษีขาย</strong></td>
    <td style="border: none;" class="text-right">{{formatCurrency summary.saleVatAmount}}</td>
    <td style="border: none;"></td>
    <td style="border: none;"><strong>ภาษีซื้อ</strong></td>
    <td style="border: none;" class="text-right">{{formatCurrency summary.costVatAmount}}</td>
  </tr>
</table>

<div style="display: flex; justify-content: space-between; margin-top: 50px; font-size: 11px;">
  <div style="text-align: center; width: 45%;">
    ลงชื่อ.......................................................................ผู้จัดทำ
    <br><br>(.......................................................................)
  </div>
  <div style="text-align: center; width: 45%;">
    ลงชื่อ.......................................................................ผู้ตรวจสอบ
    <br><br>(.......................................................................)
  </div>
</div>

<div class="footer" style="margin-top: 30px; text-align: right; font-size: 10px; color: #666;">
  พิมพ์เมื่อ: {{formatThaiDateWithDay (currentThaiDate)}}
</div>
```
(Signature names left blank intentionally — the sample's hardcoded staff names must not be baked into the template.)

- [ ] **Step 4: Typecheck + commit**

Run: `bun run typecheck` → PASS (template-only change, sanity check)
```bash
git add apps/api/src/modules/pdf/templates/sales-summary-report.hbs
git commit -m "feat(api): monthly sales report PDF matches customer form layout"
```

---

## Task 6: Web — service types, sales form inputs, detail display

**Files:**
- Modify: `apps/web/src/services/sales.service.ts` (Sale interface ~line 61, CreateSaleData ~line 138, UpdateSaleData ~line 165)
- Modify: `apps/web/src/pages/sales/SalesFormPage.tsx` (FormData ~line 32, init ~line 84, fetchSale ~line 138, payload ~line 288, JSX after discount block ~line 644)
- Modify: `apps/web/src/pages/sales/SalesDetailPage.tsx` (payment dl section — find `ส่วนลดเงินดาวน์` and append after that entry)

- [ ] **Step 1: Add fields to the web service interfaces**

In `apps/web/src/services/sales.service.ts`, in **all three** of: the `Sale` interface (next to `freebiesSnapshot?: string;` ~line 61), `CreateSaleData` (after `downPaymentDiscount?: number;` ~line 139), and `UpdateSaleData` (after `downPaymentDiscount?: number;` ~line 166), add:
```ts
  insuranceFee?: number;
  compulsoryInsuranceFee?: number;
  registrationFee?: number;
  salesCommission?: number;
  salesExpense?: number;
  financeCommission?: number;
```
(In the `Sale` interface use `?: number | null;` for the six.)

- [ ] **Step 2: Extend FormData + state init + fetchSale**

In `SalesFormPage.tsx` — `interface FormData` (after `downPaymentDiscount: number;`):
```ts
  insuranceFee: number;
  compulsoryInsuranceFee: number;
  registrationFee: number;
  salesCommission: number;
  salesExpense: number;
  financeCommission: number;
```
`useState<FormData>` initializer (after `downPaymentDiscount: 0,`):
```ts
    insuranceFee: 0,
    compulsoryInsuranceFee: 0,
    registrationFee: 0,
    salesCommission: 0,
    salesExpense: 0,
    financeCommission: 0,
```
`fetchSale` `setFormData` (after `downPaymentDiscount: Number(sale.downPaymentDiscount) || 0,`):
```ts
          insuranceFee: Number(sale.insuranceFee) || 0,
          compulsoryInsuranceFee: Number(sale.compulsoryInsuranceFee) || 0,
          registrationFee: Number(sale.registrationFee) || 0,
          salesCommission: Number(sale.salesCommission) || 0,
          salesExpense: Number(sale.salesExpense) || 0,
          financeCommission: Number(sale.financeCommission) || 0,
```

- [ ] **Step 3: Send the fields in the submit payload**

In `handleSubmit` (after `downPaymentDiscount: formData.downPaymentDiscount || undefined,`):
```ts
      insuranceFee: formData.insuranceFee || undefined,
      compulsoryInsuranceFee: formData.compulsoryInsuranceFee || undefined,
      registrationFee: formData.registrationFee || undefined,
      salesCommission: formData.salesCommission || undefined,
      salesExpense: formData.salesExpense || undefined,
      financeCommission: formData.financeCommission || undefined,
```

- [ ] **Step 4: Add the two form sections**

In the JSX, immediately **after** the closing `)}` of the `{canDiscount && (...)}` discount block (~line 644), insert:

```tsx
            {/* Buyer-charged fees — add to outstanding balance */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 bg-blue-50 border border-blue-200 rounded-lg mt-4">
              <div className="md:col-span-3">
                <p className="text-xs font-medium text-blue-700 mb-2">
                  ค่าใช้จ่ายเรียกเก็บจากลูกค้า (รวมเข้ายอดค้างชำระ)
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-black mb-1">ค่าประกันชั้น 1 (บาท)</label>
                <input
                  type="number"
                  value={formData.insuranceFee}
                  onChange={(e) => setFormData(prev => ({ ...prev, insuranceFee: parseFloat(e.target.value) || 0 }))}
                  min="0"
                  step="0.01"
                  className="w-full px-4 py-2 bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-black mb-1">ค่าพรบ. (บาท)</label>
                <input
                  type="number"
                  value={formData.compulsoryInsuranceFee}
                  onChange={(e) => setFormData(prev => ({ ...prev, compulsoryInsuranceFee: parseFloat(e.target.value) || 0 }))}
                  min="0"
                  step="0.01"
                  className="w-full px-4 py-2 bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-black mb-1">ค่าจดทะเบียน (บาท)</label>
                <input
                  type="number"
                  value={formData.registrationFee}
                  onChange={(e) => setFormData(prev => ({ ...prev, registrationFee: parseFloat(e.target.value) || 0 }))}
                  min="0"
                  step="0.01"
                  className="w-full px-4 py-2 bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900"
                />
              </div>
              <div className="md:col-span-3 text-right text-sm font-medium text-blue-800">
                รวมค่าใช้จ่าย:{' '}
                {(formData.insuranceFee + formData.compulsoryInsuranceFee + formData.registrationFee).toLocaleString('th-TH', { minimumFractionDigits: 2 })}{' '}บาท
              </div>
            </div>

            {/* Dealer-side amounts — report profit only */}
            {canDiscount && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg mt-4">
                <div className="md:col-span-3">
                  <p className="text-xs font-medium text-yellow-700 mb-2">
                    ค่าใช้จ่าย/รายรับฝั่งบริษัท (สำหรับบัญชี/กรรมการ — ใช้ในรายงานกำไร)
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-black mb-1">คอมฯ พนักงานขาย (บาท)</label>
                  <input
                    type="number"
                    value={formData.salesCommission}
                    onChange={(e) => setFormData(prev => ({ ...prev, salesCommission: parseFloat(e.target.value) || 0 }))}
                    min="0"
                    step="0.01"
                    className="w-full px-4 py-2 bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-black mb-1">ค่าใช้จ่ายในการขาย (บาท)</label>
                  <input
                    type="number"
                    value={formData.salesExpense}
                    onChange={(e) => setFormData(prev => ({ ...prev, salesExpense: parseFloat(e.target.value) || 0 }))}
                    min="0"
                    step="0.01"
                    className="w-full px-4 py-2 bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-black mb-1">ค่าตอบไฟแนนซ์ (บาท)</label>
                  <input
                    type="number"
                    value={formData.financeCommission}
                    onChange={(e) => setFormData(prev => ({ ...prev, financeCommission: parseFloat(e.target.value) || 0 }))}
                    min="0"
                    step="0.01"
                    className="w-full px-4 py-2 bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900"
                  />
                  <p className="text-xs text-gray-500 mt-1">รายรับจากบริษัทไฟแนนซ์ (บวกเข้ากำไร)</p>
                </div>
              </div>
            )}
```

- [ ] **Step 5: Show the values on SalesDetailPage**

In `SalesDetailPage.tsx`, locate the payment-info `<dl>` (search for the existing `ส่วนลดเงินดาวน์` entry) and append after it:

```tsx
            {(Number(sale.insuranceFee) || Number(sale.compulsoryInsuranceFee) || Number(sale.registrationFee)) > 0 && (
              <>
                <div className="flex justify-between">
                  <dt className="text-sm text-gray-700">ค่าประกันชั้น 1</dt>
                  <dd className="text-sm font-medium">{formatCurrency(Number(sale.insuranceFee) || 0)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-sm text-gray-700">ค่าพรบ.</dt>
                  <dd className="text-sm font-medium">{formatCurrency(Number(sale.compulsoryInsuranceFee) || 0)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-sm text-gray-700">ค่าจดทะเบียน</dt>
                  <dd className="text-sm font-medium">{formatCurrency(Number(sale.registrationFee) || 0)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-sm text-gray-700">รวมค่าใช้จ่าย</dt>
                  <dd className="text-sm font-semibold text-blue-700">
                    {formatCurrency((Number(sale.insuranceFee) || 0) + (Number(sale.compulsoryInsuranceFee) || 0) + (Number(sale.registrationFee) || 0))}
                  </dd>
                </div>
              </>
            )}
```
Match the surrounding `<dt>`/`<dd>` markup style of that `<dl>` — if entries there are not `flex justify-between`, copy the local pattern instead.

- [ ] **Step 6: Typecheck + lint + commit**

Run: `bun run typecheck` → PASS; `bun run lint` → PASS
```bash
git add apps/web/src/services/sales.service.ts apps/web/src/pages/sales/SalesFormPage.tsx apps/web/src/pages/sales/SalesDetailPage.tsx
git commit -m "feat(web): sale expense fields in form, detail page, and API types"
```

---

## Task 7: Sales-record PDF (ใบบันทึกการขาย) — real fees + gifts

**Files:**
- Modify: `apps/api/src/modules/pdf/pdf.controller.ts` (sales-record block ~lines 438–461; thank-you-letter block ~lines 298–318)

> ⚠ `pdf.controller.ts` has uncommitted changes from earlier work — add to them, don't revert.

- [ ] **Step 1: Add a shared gifts parser near the top of the controller**

After the existing imports/helpers in `pdf.controller.ts` (next to `transformCar`/`transformCustomer`), add:

```ts
/**
 * freebiesSnapshot stores one gift per line (newline-separated). Legacy rows
 * may be comma-separated free text — split on both so old sales still render.
 */
function parseFreebies(snapshot: string | null | undefined): { name: string }[] {
  if (!snapshot) return [];
  return snapshot
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((name) => ({ name }));
}
```

- [ ] **Step 2: Wire real values into the sales-record pricing block**

In the `/sales-record/:saleId` handler, replace (~lines 442–461):
```ts
        pricing: {
          sellingPrice: sale.totalAmount?.toString() || '0',
          remaining: sale.remainingAmount?.toString() || '0',
          downPayment: sale.downPayment?.toString() || sale.depositAmount?.toString() || '0',
          downPaymentDiscount: '0',
          insurance: '0', // Not in schema
          actInsurance: '0', // Not in schema
          registrationFee: '0', // Not in schema
          totalDelivery: sale.paidAmount?.toString() || '0',
          financeAmount: sale.financeAmount?.toString() || '0',
          deductDeposit: sale.paidAmount?.toString() || '0',
          deliveryAmount: sale.paidAmount?.toString() || '0',
          outstandingBalance: sale.remainingAmount?.toString() || '0',
          paymentDueDate: sale.expirationDate ? formatThaiDate(sale.expirationDate, 'short') : '-',
          financeCompany: sale.financeProvider || '-',
          interestRate: '0', // Not in Sale schema
          installmentMonths: '0', // Not in schema
          monthlyPayment: '0', // Not in schema
        },
        gifts: [], // TODO: Parse from freebiesSnapshot if available
```
with:
```ts
        pricing: (() => {
          const downPayment = Number(sale.downPayment ?? sale.depositAmount ?? 0);
          const downPaymentDiscount = Number(sale.downPaymentDiscount ?? 0);
          const insurance = Number(sale.insuranceFee ?? 0);
          const actInsurance = Number(sale.compulsoryInsuranceFee ?? 0);
          const registrationFee = Number(sale.registrationFee ?? 0);
          // รวมเงินออกรถ = sum of the delivery-day column on the paper form:
          // เงินดาวน์ − ส่วนลดดาวน์ + ประกันชั้น 1 + พรบ. + จดทะเบียน
          const totalDelivery =
            downPayment - downPaymentDiscount + insurance + actInsurance + registrationFee;
          return {
            sellingPrice: sale.totalAmount?.toString() || '0',
            remaining: sale.remainingAmount?.toString() || '0',
            downPayment: downPayment.toString(),
            downPaymentDiscount: downPaymentDiscount.toString(),
            insurance: insurance.toString(),
            actInsurance: actInsurance.toString(),
            registrationFee: registrationFee.toString(),
            totalDelivery: totalDelivery.toString(),
            financeAmount: sale.financeAmount?.toString() || '0',
            deductDeposit: sale.paidAmount?.toString() || '0',
            deliveryAmount: sale.paidAmount?.toString() || '0',
            outstandingBalance: sale.remainingAmount?.toString() || '0',
            paymentDueDate: sale.expirationDate ? formatThaiDate(sale.expirationDate, 'short') : '-',
            financeCompany: sale.financeProvider || '-',
            interestRate: sale.interestRate?.toString() || '0',
            installmentMonths: sale.numberOfTerms?.toString() || '0',
            monthlyPayment: sale.monthlyInstallment?.toString() || '0',
          };
        })(),
        gifts: parseFreebies(sale.freebiesSnapshot),
```

- [ ] **Step 3: Same wiring for the thank-you letter block**

In the thank-you-letter handler, replace (~lines 309–317):
```ts
          insurance: '0', // Not in schema - to be added if needed
          actInsurance: '0', // Not in schema - to be added if needed
          registrationFee: '0', // Not in schema - to be added if needed
          totalDelivery: sale.paidAmount?.toString() || '0',
          financeAmount: sale.financeAmount?.toString() || '0',
          interestRate: '0', // Not in schema - to be added if needed
          installmentMonths: '0', // Not in schema - to be added if needed
          monthlyPayment: '0', // Not in schema - to be added if needed
          gifts: [], // TODO: Parse from freebiesSnapshot if available
```
with:
```ts
          insurance: sale.insuranceFee?.toString() || '0',
          actInsurance: sale.compulsoryInsuranceFee?.toString() || '0',
          registrationFee: sale.registrationFee?.toString() || '0',
          totalDelivery: sale.paidAmount?.toString() || '0',
          financeAmount: sale.financeAmount?.toString() || '0',
          interestRate: sale.interestRate?.toString() || '0',
          installmentMonths: sale.numberOfTerms?.toString() || '0',
          monthlyPayment: sale.monthlyInstallment?.toString() || '0',
          gifts: parseFreebies(sale.freebiesSnapshot),
```
Also replace the `downPaymentDiscount: '0',` line just above (~line 308) with:
```ts
          downPaymentDiscount: sale.downPaymentDiscount?.toString() || '0',
```

- [ ] **Step 4: Typecheck + tests + commit**

Run: `bun run typecheck` → PASS; `cd apps/api && bun test` → PASS
```bash
git add apps/api/src/modules/pdf/pdf.controller.ts
git commit -m "feat(api): sales-record and thank-you PDFs use real expense fields and gifts"
```

---

## Task 8: Freebies editing in the sales form

**Files:**
- Modify: `apps/web/src/pages/sales/SalesFormPage.tsx` (FormData, init, fetchSale, payload, JSX)
- Modify: `apps/web/src/pages/sales/SalesDetailPage.tsx` (~lines 938–953)

> Spec deviation note: the spec said "pre-fill gifts from campaign", but exploration showed the Campaign model has **no freebies data** (only formulas) — there is nothing to pre-fill from. The textarea is simply editable; `freebiesSnapshot` remains whatever was stored.

- [ ] **Step 1: Add freebies to form state and payload**

In `SalesFormPage.tsx`:
- `interface FormData`: add `freebiesSnapshot: string;`
- `useState` initializer: add `freebiesSnapshot: '',`
- `fetchSale` `setFormData`: add `freebiesSnapshot: sale.freebiesSnapshot || '',`
- `handleSubmit` data object: add `freebiesSnapshot: formData.freebiesSnapshot || undefined,`

- [ ] **Step 2: Add the gifts textarea to the form**

Inside the Notes card (`<h2 ...>หมายเหตุ</h2>` section, ~line 667), insert **before** the existing notes textarea:

```tsx
            <div className="mb-4">
              <label className="block text-sm font-medium text-black mb-1">รายการของแถม</label>
              <textarea
                value={formData.freebiesSnapshot}
                onChange={(e) => setFormData(prev => ({ ...prev, freebiesSnapshot: e.target.value }))}
                rows={4}
                placeholder={'พิมพ์ของแถมบรรทัดละ 1 รายการ เช่น\nฟิล์มกรองแสง\nพรมปูพื้น'}
                className="w-full px-4 py-2 bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900"
              />
              <p className="text-xs text-gray-500 mt-1">แสดงในใบบันทึกการขาย (บรรทัดละ 1 รายการ)</p>
            </div>
```

- [ ] **Step 3: Show gifts as a list on SalesDetailPage, independent of campaign**

In `SalesDetailPage.tsx` the freebies line (~949–951) is nested inside `{sale.campaign && (...)}` so gifts without a campaign never show. Restructure the "Campaign & Notes" block (~lines 938–961): change the outer condition and move freebies out of the campaign branch:

```tsx
      {(sale.campaign || sale.notes || sale.freebiesSnapshot) && (
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold mb-4">ข้อมูลเพิ่มเติม</h3>
          {sale.campaign && (
            <div className="mb-4">
              <p className="text-sm text-gray-700">แคมเปญ</p>
              <p className="text-sm font-medium">{sale.campaign.name}</p>
              {sale.discountSnapshot && (
                <p className="text-sm text-green-600">ส่วนลด: {formatCurrency(sale.discountSnapshot)}</p>
              )}
            </div>
          )}
          {sale.freebiesSnapshot && (
            <div className="mb-4">
              <p className="text-sm text-gray-700">รายการของแถม</p>
              <ul className="text-sm text-blue-600 list-disc list-inside">
                {sale.freebiesSnapshot.split(/[\n,]/).map((g) => g.trim()).filter(Boolean).map((gift) => (
                  <li key={gift}>{gift}</li>
                ))}
              </ul>
            </div>
          )}
          {sale.notes && (
            <div>
              <p className="text-sm text-gray-700">หมายเหตุ</p>
              <p className="text-sm text-gray-700 whitespace-pre-wrap">{sale.notes}</p>
            </div>
          )}
        </div>
      )}
```

- [ ] **Step 4: Typecheck + lint + commit**

Run: `bun run typecheck` → PASS; `bun run lint` → PASS
```bash
git add apps/web/src/pages/sales/SalesFormPage.tsx apps/web/src/pages/sales/SalesDetailPage.tsx
git commit -m "feat(web): editable gift list on sale form, shown on detail page"
```

---

## Task 9: Full verification

- [ ] **Step 1: Run the complete check suite**

```bash
bun run typecheck && bun run lint && cd apps/api && bun test && cd ../..
```
Expected: all PASS. Fix anything that fails before proceeding.

- [ ] **Step 2: Visual check of both PDFs against the customer sample**

With dev servers running (`bun run dev`) and seeded data (`bun run db:seed` if needed), log in as `admin/admin123`:
1. Create/edit a sale filling every new field (e.g. ประกัน 25,000 / พรบ 600 / จดทะเบียน 2,400 / คอม 5,000 / ค่าใช้จ่ายขาย 3,000 / ค่าตอบไฟแนนซ์ 15,000, ของแถม 2 บรรทัด).
2. Verify the detail page shows the fees and รวมค่าใช้จ่าย = 28,000, and remaining = total + 28,000 − paid.
3. Download `/api/reports/sales-summary/pdf` — check: ส่วนลดดาวน์ column, ค่าตอบ = 15,000, ทะเบียน/พรบ = 3,000, ค่าเบี้ย = 25,000, กำไรสุทธิ reflects +15,000 −5,000 −3,000, VAT footer, signature lines, A4 landscape.
4. Download the sales-record PDF — fee rows populated, รวมเงินออกรถ = ดาวน์ − ส่วนลดดาวน์ + 28,000, gifts render bullet-per-line.
Compare layout against `/Users/marwinropmuang/Downloads/ตัวอย่างหนังสือและรายงาน.xlsx - รายงานขาย.csv`.

- [ ] **Step 3: Confirm pass-through profit decision with the customer** (open item from spec §2 — flag to the user, not codeable).
