import { describe, it, expect } from 'bun:test';

/**
 * Pure function tests for interest calculation logic
 * These test the mathematical calculations without database dependencies
 */

// ===============================================
// Helper functions extracted for testing
// ===============================================

/**
 * Calculate days between two dates
 */
function calculateDays(startDate: Date, endDate: Date): number {
  const diffTime = Math.abs(endDate.getTime() - startDate.getTime());
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

/**
 * Calculate interest for a period
 * Daily Interest = Principal × (Annual Rate / 365)
 */
function calculateInterestForPeriod(
  principalAmount: number,
  annualRate: number,
  days: number
): number {
  const dailyRate = annualRate / 100 / 365;
  return principalAmount * dailyRate * days;
}

type InterestBase = 'BASE_COST_ONLY' | 'TOTAL_COST';

interface StockCosts {
  baseCost: number;
  transportCost: number;
  accessoryCost: number;
  otherCosts: number;
}

/**
 * Get principal amount based on stock and principal base
 */
function getPrincipalAmount(stock: StockCosts, principalBase: InterestBase): number {
  const baseCost = stock.baseCost;
  
  if (principalBase === 'BASE_COST_ONLY') {
    return baseCost;
  }
  
  // TOTAL_COST
  return baseCost + stock.transportCost + stock.accessoryCost + stock.otherCosts;
}

/**
 * Interest-First Allocation: Pay interest first, remaining reduces principal
 */
function allocatePayment(
  paymentAmount: number,
  accruedInterest: number
): { interestPaid: number; principalPaid: number } {
  if (paymentAmount >= accruedInterest) {
    return {
      interestPaid: accruedInterest,
      principalPaid: paymentAmount - accruedInterest,
    };
  } else {
    return {
      interestPaid: paymentAmount,
      principalPaid: 0,
    };
  }
}

// ===============================================
// Tests
// ===============================================

describe('Interest Calculation - calculateDays', () => {
  it('should calculate 0 days for same date', () => {
    const date = new Date('2024-01-15');
    expect(calculateDays(date, date)).toBe(0);
  });

  it('should calculate 1 day difference', () => {
    const start = new Date('2024-01-15');
    const end = new Date('2024-01-16');
    expect(calculateDays(start, end)).toBe(1);
  });

  it('should calculate 30 days for a month period', () => {
    const start = new Date('2024-01-01');
    const end = new Date('2024-01-31');
    expect(calculateDays(start, end)).toBe(30);
  });

  it('should calculate 365 days for a full year', () => {
    const start = new Date('2024-01-01');
    const end = new Date('2025-01-01');
    expect(calculateDays(start, end)).toBe(366); // 2024 is a leap year
  });

  it('should work regardless of date order', () => {
    const date1 = new Date('2024-01-15');
    const date2 = new Date('2024-01-25');
    expect(calculateDays(date1, date2)).toBe(calculateDays(date2, date1));
  });
});

describe('Interest Calculation - calculateInterestForPeriod', () => {
  it('should calculate zero interest for zero days', () => {
    const result = calculateInterestForPeriod(1000000, 5, 0);
    expect(result).toBe(0);
  });

  it('should calculate zero interest for zero principal', () => {
    const result = calculateInterestForPeriod(0, 5, 30);
    expect(result).toBe(0);
  });

  it('should calculate zero interest for zero rate', () => {
    const result = calculateInterestForPeriod(1000000, 0, 30);
    expect(result).toBe(0);
  });

  it('should calculate correct daily interest for 1 day at 5% annual rate', () => {
    const principal = 1000000; // 1 million baht
    const annualRate = 5; // 5%
    const days = 1;
    
    const result = calculateInterestForPeriod(principal, annualRate, days);
    // Expected: 1,000,000 × (5/100/365) × 1 = 136.99 (approximately)
    expect(result).toBeCloseTo(136.99, 0);
  });

  it('should calculate correct interest for 30 days at 5% annual rate', () => {
    const principal = 1000000;
    const annualRate = 5;
    const days = 30;
    
    const result = calculateInterestForPeriod(principal, annualRate, days);
    // Expected: 1,000,000 × (5/100/365) × 30 = 4,109.59 (approximately)
    expect(result).toBeCloseTo(4109.59, 0);
  });

  it('should calculate correct interest for 365 days at 5% annual rate', () => {
    const principal = 1000000;
    const annualRate = 5;
    const days = 365;
    
    const result = calculateInterestForPeriod(principal, annualRate, days);
    // Expected: 1,000,000 × 5% = 50,000
    expect(result).toBeCloseTo(50000, 0);
  });

  it('should handle fractional rates correctly', () => {
    const principal = 500000;
    const annualRate = 3.75; // 3.75%
    const days = 60;
    
    const result = calculateInterestForPeriod(principal, annualRate, days);
    // Expected: 500,000 × (3.75/100/365) × 60 = 3,082.19
    expect(result).toBeCloseTo(3082.19, 0);
  });
});

describe('Interest Calculation - getPrincipalAmount', () => {
  const stock: StockCosts = {
    baseCost: 800000,
    transportCost: 50000,
    accessoryCost: 30000,
    otherCosts: 20000,
  };

  it('should return base cost only when BASE_COST_ONLY', () => {
    const result = getPrincipalAmount(stock, 'BASE_COST_ONLY');
    expect(result).toBe(800000);
  });

  it('should return total cost when TOTAL_COST', () => {
    const result = getPrincipalAmount(stock, 'TOTAL_COST');
    expect(result).toBe(900000); // 800000 + 50000 + 30000 + 20000
  });

  it('should handle zero additional costs', () => {
    const simpleStock: StockCosts = {
      baseCost: 500000,
      transportCost: 0,
      accessoryCost: 0,
      otherCosts: 0,
    };
    
    expect(getPrincipalAmount(simpleStock, 'BASE_COST_ONLY')).toBe(500000);
    expect(getPrincipalAmount(simpleStock, 'TOTAL_COST')).toBe(500000);
  });
});

describe('Interest Calculation - allocatePayment (Interest-First)', () => {
  it('should pay only interest when payment is less than accrued interest', () => {
    const result = allocatePayment(1000, 2000);
    expect(result.interestPaid).toBe(1000);
    expect(result.principalPaid).toBe(0);
  });

  it('should pay all interest and remaining to principal when payment exceeds interest', () => {
    const result = allocatePayment(5000, 2000);
    expect(result.interestPaid).toBe(2000);
    expect(result.principalPaid).toBe(3000);
  });

  it('should pay exactly interest amount when payment equals accrued interest', () => {
    const result = allocatePayment(2000, 2000);
    expect(result.interestPaid).toBe(2000);
    expect(result.principalPaid).toBe(0);
  });

  it('should handle zero accrued interest', () => {
    const result = allocatePayment(5000, 0);
    expect(result.interestPaid).toBe(0);
    expect(result.principalPaid).toBe(5000);
  });

  it('should handle zero payment', () => {
    const result = allocatePayment(0, 2000);
    expect(result.interestPaid).toBe(0);
    expect(result.principalPaid).toBe(0);
  });
});

describe('Interest Calculation - Full Scenario', () => {
  it('should calculate total payoff correctly', () => {
    const stock: StockCosts = {
      baseCost: 1000000,
      transportCost: 50000,
      accessoryCost: 30000,
      otherCosts: 20000,
    };
    
    const principal = getPrincipalAmount(stock, 'TOTAL_COST'); // 1,100,000
    const daysHeld = 90;
    const annualRate = 5;
    
    const accruedInterest = calculateInterestForPeriod(principal, annualRate, daysHeld);
    // Expected: 1,100,000 × (5/100/365) × 90 = 13,561.64
    
    const totalPayoff = principal + accruedInterest;
    
    expect(accruedInterest).toBeCloseTo(13561.64, 0);
    expect(totalPayoff).toBeCloseTo(1113561.64, 0);
  });

  it('should correctly allocate a partial payment', () => {
    const remainingDebt = 500000;
    const accruedInterest = 5000;
    const paymentAmount = 50000;
    
    const allocation = allocatePayment(paymentAmount, accruedInterest);
    
    expect(allocation.interestPaid).toBe(5000);
    expect(allocation.principalPaid).toBe(45000);
    
    const newRemainingDebt = remainingDebt - allocation.principalPaid;
    expect(newRemainingDebt).toBe(455000);
  });
});
