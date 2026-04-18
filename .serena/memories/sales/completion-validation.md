# Sale Completion Payment Validation

## Rule
Sale cannot be marked COMPLETED if `remainingAmount > 0`.

## Implementation (`apps/api/src/modules/sales/sales.service.ts`)
```typescript
if (status === 'COMPLETED') {
  const remaining = Number(existingSale.remainingAmount);
  if (remaining > 0) {
    throw new BadRequestError(
      `ไม่สามารถปิดการขายได้ ยังมียอดค้างชำระ ${remaining.toLocaleString()} บาท`
    );
  }
}
```

## Sale Status Flow
RESERVED → PREPARING → DELIVERED → COMPLETED
Each state can also → CANCELLED

## Validations
- DELIVERED requires `stockId` assigned
- CANCELLED requires `SALE_CANCEL` permission (ADMIN only)
- COMPLETED/CANCELLED are terminal states