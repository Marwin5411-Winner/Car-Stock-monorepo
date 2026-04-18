# Number Sequence Pattern

## DB Model (NumberSequence)
Unique constraint: `(prefix, year, month)`

## Prefixes (`packages/shared/src/constants/index.ts`)
- `CUST` — Customer (CUST-2026-0077)
- `SL` — Sale (SL-2026-0001)
- `QTN` — Quotation
- `RSV` — Reservation
- `RCPT` — Receipt (RCPT-2603-0066)
- `STK` — Stock (STK0325690001)

## Monthly Reset (Receipt, Stock, Contract)
```typescript
db.numberSequence.upsert({
  where: { prefix_year_month: { prefix, year, month } },
  create: { prefix, year, month, lastNumber: 1 },
  update: { lastNumber: { increment: 1 } },
});
```

## Annual Reset (Sale, Customer)
Uses `month: 0` or `findFirst` by prefix+year.

## Key Files
- `apps/api/src/lib/contractNumber.ts` — Contract numbers (Buddhist year)
- `apps/api/src/modules/payments/payments.service.ts` — Receipt numbers
- `apps/api/src/modules/sales/sales.service.ts` — Sale numbers
- `apps/api/src/modules/stock/stock.service.ts` — Stock numbers