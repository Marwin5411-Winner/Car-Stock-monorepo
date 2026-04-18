# PDF Receipt Generation

## Files
- **Template**: `apps/api/src/modules/pdf/templates/temporary-receipt.hbs` — ใบรับเงินชั่วคราว
- **Template (BG)**: `apps/api/src/modules/pdf/templates/temporary-receipt-bg.hbs` — ใบรับเงินชั่วคราว (มี background)
- **Template**: `apps/api/src/modules/pdf/templates/payment-receipt.hbs` — ใบเสร็จรับเงิน
- **Template**: `apps/api/src/modules/pdf/templates/deposit-receipt.hbs` — ใบรับเงินมัดจำ
- **Controller**: `apps/api/src/modules/pdf/pdf.controller.ts` — API endpoints + data transformation
- **Service**: `apps/api/src/modules/pdf/pdf.service.ts` — Puppeteer HTML→PDF conversion
- **Types**: `apps/api/src/modules/pdf/types.ts` — TypeScript interfaces

## Key Data Flow
1. Controller fetches payment from DB with `include: { customer, sale: { stock: { vehicleModel } } }`
2. Builds `paymentMethodData` (isCash/isTransfer/isCheque flags) + `paymentMethodLabel` (Thai text)
3. Builds `items[]` from `payment.description` (fallback: `PAYMENT_TYPE_LABELS[paymentType]`)
4. Passes data to Handlebars template → Puppeteer renders HTML → PDF buffer

## Payment Method Label
```typescript
import { PAYMENT_METHOD_LABELS } from '@car-stock/shared/constants';
paymentMethodLabel: PAYMENT_METHOD_LABELS[payment.paymentMethod] || ''
// เงินสด, โอนเงิน, เช็ค, บัตรเครดิต
```

## Items (รายการ)
```typescript
import { PAYMENT_TYPE_LABELS } from '@car-stock/shared/constants';
const typeLabel = PAYMENT_TYPE_LABELS[payment.paymentType] || 'ค่าชำระเงิน';
const itemDescription = payment.description || `${typeLabel} ${carName}`.trim();
```

## issuedBy (ออกโดย)
- Saved as snapshot in `payments.service.ts` during creation
- Queries user from DB: `[user.firstName, user.lastName].filter(Boolean).join(' ') || username`
- Editable via `PaymentEditPage.tsx` using `SearchSelect` component with staff list
- Schema: `UpdatePaymentSchema` (Zod) + Elysia body schema both include `issuedBy`

## 3 Endpoints for Temporary Receipt
- `/api/pdf/deposit-receipt/:paymentId` — ใบรับเงินมัดจำ
- `/api/pdf/temporary-receipt/:paymentId` — ใบรับเงินชั่วคราว
- `/api/pdf/temporary-receipt-bg/:paymentId` — ใบรับเงินชั่วคราว (BG)