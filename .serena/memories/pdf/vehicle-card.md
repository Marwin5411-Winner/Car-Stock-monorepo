# PDF Vehicle Card (การ์ดรายละเอียดรถยนต์)

## Files
- **Template**: `apps/api/src/modules/pdf/templates/vehicle-card.hbs` — การ์ดรถ (มีข้อมูล)
- **Template**: `apps/api/src/modules/pdf/templates/vehicle-card-template.hbs` — การ์ดรถเปล่า (แบบฟอร์ม)
- **Controller**: `apps/api/src/modules/pdf/pdf.controller.ts`
- **Types**: `apps/api/src/modules/pdf/types.ts` — `VehicleCardData`

## VAT Calculation (รายละเอียดต้นทุน section)
baseCost stores price WITH VAT included. Calculated backwards:
```typescript
const beforeVat = baseCost / 1.07;
const vatAmount = baseCost - beforeVat;
```

## Amount Split (Integer + Decimal)
ช่องจำนวนเงินแยก integer กับ decimal ใส่คนละ column:
```typescript
const splitAmount = (amount: number) => {
  const fixed = amount.toFixed(2);
  const [intPart, decPart] = fixed.split('.');
  return { int: Number(intPart).toLocaleString('en-US'), dec: decPart };
};
```
Template: `{{costs.beforeVatInt}}` | `{{costs.beforeVatDec}}`

## Cost Rows
- Row 1: ราคาก่อน VAT
- Row 2: VAT 7%
- Row 3-5: empty
- รวม: totalWithVat (= baseCost)

## Column Widths (colgroup)
5% | 19% | 12% | 3% | 8% | 19% | 12% | 11% | 11%