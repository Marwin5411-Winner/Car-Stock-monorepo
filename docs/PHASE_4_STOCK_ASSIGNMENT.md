# Phase 4: Stock Assignment Actions - Completion Report

## Overview

Phase 4 implements stock assignment functionality, allowing sales staff to assign or change vehicle stock on sales records. This phase enables better inventory management by linking specific vehicles to sales before delivery.

## Completed Tasks

### Task 4.1: Add "Assign Stock" Button on Sale Detail Page ✅

**Implementation:**
- Added stock assignment modal in `SalesDetailPage.tsx`
- Modal displays available stocks for the same vehicle model
- Radio button selection for choosing stock
- "กำหนด Stock" (Assign Stock) button visible when:
  - Sale has a vehicle model but no stock assigned
  - Sale status is RESERVED or PREPARING

### Task 4.2: Allow Changing Stock Assignment Before DELIVERED ✅

**Implementation:**
- "เปลี่ยน Stock" (Change Stock) button visible when:
  - Sale has stock assigned
  - Sale status is RESERVED or PREPARING (before DELIVERED)
- Same modal used for both assign and change operations
- Old stock is released back to AVAILABLE status
- New stock is set to RESERVED status

### Task 4.3: Auto-change Stock Status When Assigned to Sale ✅

**Implementation:**
- Stock status automatically synced with sale lifecycle:
  - **Assignment**: Stock → RESERVED
  - **PREPARING status**: Stock → PREPARING  
  - **DELIVERED/COMPLETED**: Stock → SOLD
  - **CANCELLED**: Stock → AVAILABLE (released)

## Technical Changes

### Backend Changes

#### `apps/api/src/modules/sales/sales.service.ts`

Added `assignStock` method:
```typescript
async assignStock(saleId: string, stockId: string, currentUser: User) {
  // Validates sale exists and status allows assignment
  // Releases old stock if exists (sets to AVAILABLE)
  // Reserves new stock (sets to RESERVED)
  // Updates sale with new stockId
  // Creates SaleHistory record
  // Creates ActivityLog entry
}
```

Updated `updateSaleStatus` method:
- Added PREPARING status sync: Updates stock to PREPARING
- Stock status automatically changes with sale status transitions

#### `apps/api/src/modules/sales/sales.controller.ts`

Added endpoint:
```typescript
PATCH /api/sales/:id/assign-stock
Body: { stockId: string }
Response: { success: true, data: Sale }
```

### Frontend Changes

#### `apps/web/src/services/sales.service.ts`

- Added `ApiResponse<T>` interface for proper typing
- Added `assignStock(id, stockId)` method
- Fixed all API calls to use proper generic types

#### `apps/web/src/pages/sales/SalesDetailPage.tsx`

Added:
- State variables for modal management:
  - `showStockModal`, `availableStocks`, `loadingStocks`
  - `assigningStock`, `selectedStockId`
- `openStockModal()` - Fetches available stocks and opens modal
- `closeStockModal()` - Resets modal state
- `handleAssignStock()` - Calls API to assign stock
- `canChangeStock()` - Checks if stock can be modified
- Stock Assignment Modal component with:
  - Available stocks list with radio selection
  - VIN and color information displayed
  - Save/Cancel buttons
- "กำหนด Stock" button in Vehicle Info section (when no stock)
- "เปลี่ยน Stock" button in Vehicle Info section (when stock exists)

## UI/UX Flow

### Assigning Stock (No Current Stock)
1. User views sale detail page
2. Vehicle Info section shows "ยังไม่ได้เลือก Stock" badge
3. "กำหนด Stock" button appears (if status allows)
4. User clicks button → Modal opens
5. Modal displays available stocks for the vehicle model
6. User selects stock and clicks "บันทึก"
7. Stock assigned, page refreshes

### Changing Stock (Has Current Stock)
1. User views sale detail page with assigned stock
2. Vehicle Info section shows stock details
3. "เปลี่ยน Stock" button appears (if status is RESERVED or PREPARING)
4. User clicks button → Modal opens
5. Current stock pre-selected, user can choose different stock
6. User saves → Old stock released, new stock assigned

## Stock Status Lifecycle

```
AVAILABLE ──[Assigned to Sale]──> RESERVED
RESERVED  ──[Sale → PREPARING]──> PREPARING
PREPARING ──[Sale → DELIVERED]──> SOLD
PREPARING ──[Sale → COMPLETED]──> SOLD
RESERVED  ──[Sale → CANCELLED]──> AVAILABLE
PREPARING ──[Sale → CANCELLED]──> AVAILABLE
```

## Permissions Required

- `SALE_UPDATE` - Required for stock assignment operations

## Files Modified

| File | Changes |
|------|---------|
| `apps/api/src/modules/sales/sales.service.ts` | Added `assignStock` method, updated `updateSaleStatus` for PREPARING sync |
| `apps/api/src/modules/sales/sales.controller.ts` | Added `PATCH /:id/assign-stock` endpoint |
| `apps/web/src/services/sales.service.ts` | Added `assignStock` method, fixed API response types |
| `apps/web/src/pages/sales/SalesDetailPage.tsx` | Added modal, buttons, and stock assignment logic |

## Testing Checklist

- [ ] Create RESERVATION_SALE without stock
- [ ] Verify "กำหนด Stock" button appears
- [ ] Assign stock and verify stock status changes to RESERVED
- [ ] Verify "เปลี่ยน Stock" button appears after assignment
- [ ] Change stock and verify old stock returns to AVAILABLE
- [ ] Update sale to PREPARING and verify stock status changes
- [ ] Update sale to DELIVERED and verify stock status changes to SOLD
- [ ] Cancel sale and verify stock returns to AVAILABLE
- [ ] Create DIRECT_SALE (should not show assign button if stock already selected)

## Next Phase

**Phase 5: Enhance Quotation Module**
- Add quotation-to-sale conversion
- Link quotation data to new sales
- Display quotation history on sale detail

## Completion Date

{{ Current Date }}
