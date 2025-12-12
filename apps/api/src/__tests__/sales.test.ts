import { describe, it, expect } from 'bun:test';

/**
 * Tests for sales status transition logic
 * These validate the business rules for sale status changes
 */

// ===============================================
// Types
// ===============================================

type SaleStatus = 'RESERVED' | 'PREPARING' | 'DELIVERED' | 'COMPLETED' | 'CANCELLED';
type StockStatus = 'AVAILABLE' | 'RESERVED' | 'PREPARING' | 'SOLD';

interface Sale {
  id: string;
  status: SaleStatus;
  stockId: string | null;
}

interface StatusTransitionResult {
  allowed: boolean;
  error?: string;
  newStockStatus?: StockStatus;
}

// ===============================================
// Helper functions extracted for testing
// ===============================================

/**
 * Valid status transitions for sales
 */
const VALID_TRANSITIONS: Record<SaleStatus, SaleStatus[]> = {
  RESERVED: ['PREPARING', 'CANCELLED'],
  PREPARING: ['DELIVERED', 'CANCELLED'],
  DELIVERED: ['COMPLETED', 'CANCELLED'],
  COMPLETED: [],  // Terminal state
  CANCELLED: [],  // Terminal state
};

/**
 * Check if a status transition is valid
 */
function isValidTransition(fromStatus: SaleStatus, toStatus: SaleStatus): boolean {
  return VALID_TRANSITIONS[fromStatus]?.includes(toStatus) ?? false;
}

/**
 * Check if a sale can be delivered (must have stock assigned)
 */
function canDeliverSale(sale: Sale): { canDeliver: boolean; error?: string } {
  if (sale.status !== 'PREPARING') {
    return {
      canDeliver: false,
      error: `Cannot deliver sale in ${sale.status} status`,
    };
  }
  
  if (!sale.stockId) {
    return {
      canDeliver: false,
      error: 'Cannot deliver sale without assigned stock car. Please assign a stock vehicle before marking as delivered.',
    };
  }
  
  return { canDeliver: true };
}

/**
 * Validate a status transition and return result
 */
function validateStatusTransition(
  sale: Sale,
  newStatus: SaleStatus
): StatusTransitionResult {
  // Cannot change status of cancelled sale
  if (sale.status === 'CANCELLED') {
    return {
      allowed: false,
      error: 'Cannot change status of cancelled sale',
    };
  }

  // Cannot change status of completed sale (except potentially to CANCELLED in some systems)
  if (sale.status === 'COMPLETED') {
    return {
      allowed: false,
      error: 'Cannot change status of completed sale',
    };
  }

  // Check if transition is valid
  if (!isValidTransition(sale.status, newStatus)) {
    return {
      allowed: false,
      error: `Invalid status transition from ${sale.status} to ${newStatus}`,
    };
  }

  // Special check for DELIVERED - must have stock
  if (newStatus === 'DELIVERED') {
    const deliveryCheck = canDeliverSale(sale);
    if (!deliveryCheck.canDeliver) {
      return {
        allowed: false,
        error: deliveryCheck.error,
      };
    }
  }

  return { allowed: true };
}

/**
 * Get the new stock status based on sale status change
 */
function getStockStatusForSaleTransition(
  saleStatus: SaleStatus,
  hasStock: boolean
): StockStatus | null {
  if (!hasStock) return null;

  switch (saleStatus) {
    case 'RESERVED':
      return 'RESERVED';
    case 'PREPARING':
      return 'PREPARING';
    case 'DELIVERED':
    case 'COMPLETED':
      return 'SOLD';
    case 'CANCELLED':
      return 'AVAILABLE';
    default:
      return null;
  }
}

// ===============================================
// Tests
// ===============================================

describe('Sales Status Transitions - isValidTransition', () => {
  describe('from RESERVED', () => {
    it('should allow transition to PREPARING', () => {
      expect(isValidTransition('RESERVED', 'PREPARING')).toBe(true);
    });

    it('should allow transition to CANCELLED', () => {
      expect(isValidTransition('RESERVED', 'CANCELLED')).toBe(true);
    });

    it('should NOT allow direct transition to DELIVERED', () => {
      expect(isValidTransition('RESERVED', 'DELIVERED')).toBe(false);
    });

    it('should NOT allow direct transition to COMPLETED', () => {
      expect(isValidTransition('RESERVED', 'COMPLETED')).toBe(false);
    });
  });

  describe('from PREPARING', () => {
    it('should allow transition to DELIVERED', () => {
      expect(isValidTransition('PREPARING', 'DELIVERED')).toBe(true);
    });

    it('should allow transition to CANCELLED', () => {
      expect(isValidTransition('PREPARING', 'CANCELLED')).toBe(true);
    });

    it('should NOT allow transition back to RESERVED', () => {
      expect(isValidTransition('PREPARING', 'RESERVED')).toBe(false);
    });
  });

  describe('from DELIVERED', () => {
    it('should allow transition to COMPLETED', () => {
      expect(isValidTransition('DELIVERED', 'COMPLETED')).toBe(true);
    });

    it('should allow transition to CANCELLED', () => {
      expect(isValidTransition('DELIVERED', 'CANCELLED')).toBe(true);
    });

    it('should NOT allow transition back to PREPARING', () => {
      expect(isValidTransition('DELIVERED', 'PREPARING')).toBe(false);
    });
  });

  describe('from terminal states', () => {
    it('should NOT allow any transition from COMPLETED', () => {
      expect(isValidTransition('COMPLETED', 'RESERVED')).toBe(false);
      expect(isValidTransition('COMPLETED', 'PREPARING')).toBe(false);
      expect(isValidTransition('COMPLETED', 'DELIVERED')).toBe(false);
      expect(isValidTransition('COMPLETED', 'CANCELLED')).toBe(false);
    });

    it('should NOT allow any transition from CANCELLED', () => {
      expect(isValidTransition('CANCELLED', 'RESERVED')).toBe(false);
      expect(isValidTransition('CANCELLED', 'PREPARING')).toBe(false);
      expect(isValidTransition('CANCELLED', 'DELIVERED')).toBe(false);
      expect(isValidTransition('CANCELLED', 'COMPLETED')).toBe(false);
    });
  });
});

describe('Sales Status Transitions - canDeliverSale', () => {
  it('should allow delivery when sale is PREPARING with stock', () => {
    const sale: Sale = { id: '1', status: 'PREPARING', stockId: 'stock-123' };
    const result = canDeliverSale(sale);
    expect(result.canDeliver).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it('should NOT allow delivery when sale has no stock', () => {
    const sale: Sale = { id: '1', status: 'PREPARING', stockId: null };
    const result = canDeliverSale(sale);
    expect(result.canDeliver).toBe(false);
    expect(result.error).toContain('without assigned stock');
  });

  it('should NOT allow delivery when status is not PREPARING', () => {
    const sale: Sale = { id: '1', status: 'RESERVED', stockId: 'stock-123' };
    const result = canDeliverSale(sale);
    expect(result.canDeliver).toBe(false);
    expect(result.error).toContain('RESERVED status');
  });
});

describe('Sales Status Transitions - validateStatusTransition', () => {
  it('should allow valid transition with stock', () => {
    const sale: Sale = { id: '1', status: 'PREPARING', stockId: 'stock-123' };
    const result = validateStatusTransition(sale, 'DELIVERED');
    expect(result.allowed).toBe(true);
  });

  it('should NOT allow any transition from CANCELLED', () => {
    const sale: Sale = { id: '1', status: 'CANCELLED', stockId: 'stock-123' };
    const result = validateStatusTransition(sale, 'RESERVED');
    expect(result.allowed).toBe(false);
    expect(result.error).toBe('Cannot change status of cancelled sale');
  });

  it('should NOT allow any transition from COMPLETED', () => {
    const sale: Sale = { id: '1', status: 'COMPLETED', stockId: 'stock-123' };
    const result = validateStatusTransition(sale, 'CANCELLED');
    expect(result.allowed).toBe(false);
    expect(result.error).toBe('Cannot change status of completed sale');
  });

  it('should NOT allow delivery without stock', () => {
    const sale: Sale = { id: '1', status: 'PREPARING', stockId: null };
    const result = validateStatusTransition(sale, 'DELIVERED');
    expect(result.allowed).toBe(false);
    expect(result.error).toContain('without assigned stock');
  });

  it('should NOT allow invalid transitions', () => {
    const sale: Sale = { id: '1', status: 'RESERVED', stockId: null };
    const result = validateStatusTransition(sale, 'COMPLETED');
    expect(result.allowed).toBe(false);
    expect(result.error).toContain('Invalid status transition');
  });
});

describe('Sales Status Transitions - Stock Status Sync', () => {
  it('should return RESERVED when sale is RESERVED', () => {
    expect(getStockStatusForSaleTransition('RESERVED', true)).toBe('RESERVED');
  });

  it('should return PREPARING when sale is PREPARING', () => {
    expect(getStockStatusForSaleTransition('PREPARING', true)).toBe('PREPARING');
  });

  it('should return SOLD when sale is DELIVERED', () => {
    expect(getStockStatusForSaleTransition('DELIVERED', true)).toBe('SOLD');
  });

  it('should return SOLD when sale is COMPLETED', () => {
    expect(getStockStatusForSaleTransition('COMPLETED', true)).toBe('SOLD');
  });

  it('should return AVAILABLE when sale is CANCELLED', () => {
    expect(getStockStatusForSaleTransition('CANCELLED', true)).toBe('AVAILABLE');
  });

  it('should return null when no stock is assigned', () => {
    expect(getStockStatusForSaleTransition('RESERVED', false)).toBe(null);
    expect(getStockStatusForSaleTransition('DELIVERED', false)).toBe(null);
  });
});

describe('Sales Status Transitions - Full Scenario', () => {
  it('should follow complete happy path: RESERVED → PREPARING → DELIVERED → COMPLETED', () => {
    let sale: Sale = { id: '1', status: 'RESERVED', stockId: 'stock-123' };
    
    // Step 1: RESERVED → PREPARING
    let result = validateStatusTransition(sale, 'PREPARING');
    expect(result.allowed).toBe(true);
    sale.status = 'PREPARING';
    
    // Step 2: PREPARING → DELIVERED
    result = validateStatusTransition(sale, 'DELIVERED');
    expect(result.allowed).toBe(true);
    sale.status = 'DELIVERED';
    
    // Step 3: DELIVERED → COMPLETED
    result = validateStatusTransition(sale, 'COMPLETED');
    expect(result.allowed).toBe(true);
    sale.status = 'COMPLETED';
    
    // Cannot transition from COMPLETED
    result = validateStatusTransition(sale, 'RESERVED');
    expect(result.allowed).toBe(false);
  });

  it('should allow cancellation at any non-terminal stage', () => {
    // RESERVED → CANCELLED
    let sale: Sale = { id: '1', status: 'RESERVED', stockId: null };
    expect(validateStatusTransition(sale, 'CANCELLED').allowed).toBe(true);
    
    // PREPARING → CANCELLED
    sale.status = 'PREPARING';
    expect(validateStatusTransition(sale, 'CANCELLED').allowed).toBe(true);
    
    // DELIVERED → CANCELLED
    sale.status = 'DELIVERED';
    expect(validateStatusTransition(sale, 'CANCELLED').allowed).toBe(true);
  });
});
