# Stock Number Auto-Generation

## Format
`STK` + `MM` (เดือน) + `YYYY` (ปีพ.ศ.) + `XXXX` (running number)
Example: `STK0325690001` = มี.ค. 2569, ลำดับที่ 1

## DB Field
`stocks.stock_number` — nullable, unique
Prisma: `stockNumber String? @unique @map("stock_number")`

## Generation Logic (`apps/api/src/modules/stock/stock.service.ts`)
```typescript
private async generateStockNumber(arrivalDate?: Date | null): Promise<string> {
  const date = arrivalDate ? new Date(arrivalDate) : new Date();
  const month = date.getMonth() + 1;
  const buddhistYear = date.getFullYear() + 543;
  const prefix = NUMBER_PREFIXES.STOCK; // 'STK'
  const mm = month.toString().padStart(2, '0');
  const sequence = await db.numberSequence.upsert({
    where: { prefix_year_month: { prefix, year: buddhistYear, month } },
    create: { prefix, year: buddhistYear, month, lastNumber: 1 },
    update: { lastNumber: { increment: 1 } },
  });
  return `${prefix}${mm}${buddhistYear}${sequence.lastNumber.toString().padStart(4, '0')}`;
}
```

- Called in `createStock()` with `validated.arrivalDate`
- Falls back to current date if arrivalDate is null
- Running number resets per month-year
- Prefix: `packages/shared/src/constants/index.ts` → `NUMBER_PREFIXES.STOCK = 'STK'`