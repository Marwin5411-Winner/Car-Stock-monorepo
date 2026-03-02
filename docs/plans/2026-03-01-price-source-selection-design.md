# Price Source Selection Modal — Design Document

## Problem

Price master data exists in both VehicleModel (`price`) and Stock (`expectedSalePrice`). Currently, forms auto-fill prices from one source without letting the user choose. Users need to see both options and pick which price to use.

## Solution

A reusable Side-by-Side Comparison Modal that opens after selecting a vehicle, showing VehicleModel vs Stock prices with brief vehicle info. User clicks "เลือก" on the preferred source to fill the form.

## Form Behavior

| Form | Selects | Modal opens when | Auto-fill when |
|------|---------|-------------------|----------------|
| SalesFormPage | Stock | Always (Stock has related vehicleModel) | — |
| QuotationFormPage | VehicleModel | Never (no Stock selected) | Uses VehicleModel.price |
| StockFormPage (create) | VehicleModel | Never (no Stock yet) | Uses VehicleModel.price/standardCost |
| StockFormPage (edit) | Changes VehicleModel | Opens (existing Stock data available) | — |

Rule: Modal opens only when **both** VehicleModel and Stock price data are available. Otherwise auto-fill from the single available source.

Even when prices are equal, the Modal still opens.

## Modal Layout

### Desktop (Side-by-Side)

Two columns comparing VehicleModel (left) and Stock (right).

**VehicleModel column shows:**
- Brand + Model + Year
- Price (`VehicleModel.price`)

**Stock column shows:**
- Brand + Model + Year
- Color, Chassis Number
- Expected Sale Price (`Stock.expectedSalePrice`)

Each column has a "เลือก" button.

### Mobile

Same content stacked vertically (VehicleModel card on top, Stock card below).

## After Selection

Data from chosen source fills into the form:
- **SalesFormPage**: fills `totalAmount`
- **StockFormPage (edit)**: fills `expectedSalePrice` and `baseCost`

## Component Design

### `PriceSourceModal`

Reusable component in `apps/web/src/components/`.

**Props:**
- `open: boolean` — controls visibility
- `onClose: () => void` — close handler
- `vehicleModel: { brand, model, year, price }` — VehicleModel data
- `stock: { color, chassisNumber, expectedSalePrice }` — Stock data
- `onSelect: (source: 'model' | 'stock') => void` — selection callback

**Implementation:**
- Uses existing Radix UI Dialog component
- Responsive: `grid-cols-2` on desktop, `grid-cols-1` on mobile
- Each source displayed as a card with vehicle info and prominent price
- "เลือก" button on each card

## Files to Create/Modify

### New
- `apps/web/src/components/PriceSourceModal.tsx` — the modal component

### Modify
- `apps/web/src/pages/sales/SalesFormPage.tsx` — integrate modal after Stock selection
- `apps/web/src/pages/stock/StockFormPage.tsx` — integrate modal when editing and changing VehicleModel
