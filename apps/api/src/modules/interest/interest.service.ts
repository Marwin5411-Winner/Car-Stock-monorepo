import { db } from '../../lib/db';
import { Decimal } from '@prisma/client/runtime/library';
import { InterestBase, StockStatus } from '@prisma/client';

interface InterestSummary {
  stockId: string;
  vin: string;
  vehicleModel: {
    brand: string;
    model: string;
    variant: string | null;
    year: number;
  };
  exteriorColor: string;
  status: StockStatus;
  orderDate: Date | null;
  arrivalDate: Date;
  interestStartDate: Date; // วันที่เริ่มคิดดอกเบี้ย (orderDate หรือ arrivalDate)
  daysCount: number; // จำนวนวันที่คิดดอกเบี้ย
  currentRate: number;
  totalAccumulatedInterest: number;
  isCalculating: boolean;
  principalBase: InterestBase;
  principalAmount: number;
}

interface InterestPeriodDetail {
  id: string;
  startDate: Date;
  endDate: Date | null;
  annualRate: number;
  principalBase: InterestBase;
  principalAmount: number;
  calculatedInterest: number;
  daysCount: number;
  notes: string | null;
  createdAt: Date;
  createdById: string | null;
}

interface UpdateInterestRateInput {
  annualRate: number;
  principalBase?: InterestBase;
  effectiveDate?: Date;
  notes?: string;
}

export class InterestService {
  /**
   * Calculate days between two dates
   */
  private calculateDays(startDate: Date, endDate: Date): number {
    const diffTime = Math.abs(endDate.getTime() - startDate.getTime());
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }

  /**
   * Calculate interest for a period
   */
  private calculateInterestForPeriod(
    principalAmount: number,
    annualRate: number,
    days: number
  ): number {
    // Daily Interest = Principal × (Annual Rate / 365)
    const dailyRate = annualRate / 100 / 365;
    return principalAmount * dailyRate * days;
  }

  /**
   * Get principal amount based on stock and principal base
   */
  private getPrincipalAmount(stock: any, principalBase: InterestBase): number {
    const baseCost = Number(stock.baseCost);
    
    if (principalBase === 'BASE_COST_ONLY') {
      return baseCost;
    }
    
    // TOTAL_COST
    const transportCost = Number(stock.transportCost);
    const accessoryCost = Number(stock.accessoryCost);
    const otherCosts = Number(stock.otherCosts);
    
    return baseCost + transportCost + accessoryCost + otherCosts;
  }

  /**
   * Get all stock with interest summary
   */
  async getAllStockInterest(params: {
    page?: number;
    limit?: number;
    search?: string;
    status?: StockStatus;
    isCalculating?: boolean;
  }): Promise<{ data: InterestSummary[]; meta: any }> {
    const page = params.page || 1;
    const limit = params.limit || 20;
    const skip = (page - 1) * limit;

    const where: any = {};

    if (params.search) {
      where.OR = [
        { vin: { contains: params.search, mode: 'insensitive' } },
        { vehicleModel: { brand: { contains: params.search, mode: 'insensitive' } } },
        { vehicleModel: { model: { contains: params.search, mode: 'insensitive' } } },
      ];
    }

    if (params.status) {
      where.status = params.status;
    }

    // Filter by isCalculating
    if (params.isCalculating === true) {
      where.stopInterestCalc = false;
      where.status = { in: ['AVAILABLE', 'RESERVED', 'PREPARING'] };
    } else if (params.isCalculating === false) {
      where.OR = [
        { stopInterestCalc: true },
        { status: 'SOLD' },
      ];
    }

    const [stocks, total] = await Promise.all([
      db.stock.findMany({
        where,
        include: {
          vehicleModel: {
            select: {
              brand: true,
              model: true,
              variant: true,
              year: true,
            },
          },
          interestPeriods: {
            orderBy: { startDate: 'desc' },
          },
        },
        skip,
        take: limit,
        orderBy: { arrivalDate: 'desc' },
      }),
      db.stock.count({ where }),
    ]);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const data: InterestSummary[] = stocks.map((stock) => {
      // ใช้ orderDate ถ้ามี ถ้าไม่มีใช้ arrivalDate
      const interestStartDate = stock.orderDate || stock.arrivalDate;
      const daysCount = this.calculateDays(interestStartDate, today);
      
      // Calculate total accumulated interest from all periods
      let totalAccumulatedInterest = 0;
      let currentRate = 0;
      let principalBase = stock.interestPrincipalBase;
      let principalAmount = this.getPrincipalAmount(stock, principalBase);

      // Get the active period (no endDate)
      const activePeriod = stock.interestPeriods.find(p => !p.endDate);
      
      if (activePeriod) {
        currentRate = Number(activePeriod.annualRate);
        principalBase = activePeriod.principalBase;
        principalAmount = Number(activePeriod.principalAmount);
        
        // Calculate interest for active period up to today
        const periodDays = this.calculateDays(activePeriod.startDate, today);
        const activeInterest = this.calculateInterestForPeriod(
          principalAmount,
          currentRate,
          periodDays
        );
        totalAccumulatedInterest += activeInterest;
      } else if (stock.interestPeriods.length === 0 && !stock.stopInterestCalc && stock.status !== 'SOLD') {
        // No periods yet, use stock's default rate
        currentRate = Number(stock.interestRate) * 100; // Convert from decimal to percentage
        principalAmount = this.getPrincipalAmount(stock, stock.interestPrincipalBase);
        
        const interest = this.calculateInterestForPeriod(
          principalAmount,
          currentRate,
          daysCount
        );
        totalAccumulatedInterest += interest;
      }

      // Add closed periods' interest
      stock.interestPeriods
        .filter(p => p.endDate)
        .forEach(p => {
          totalAccumulatedInterest += Number(p.calculatedInterest);
        });

      const isCalculating = !stock.stopInterestCalc && stock.status !== 'SOLD';

      return {
        stockId: stock.id,
        vin: stock.vin,
        vehicleModel: stock.vehicleModel,
        exteriorColor: stock.exteriorColor,
        status: stock.status,
        orderDate: stock.orderDate,
        arrivalDate: stock.arrivalDate,
        interestStartDate,
        daysCount,
        currentRate,
        totalAccumulatedInterest: Math.round(totalAccumulatedInterest * 100) / 100,
        isCalculating,
        principalBase,
        principalAmount,
      };
    });

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        hasNextPage: page < Math.ceil(total / limit),
        hasPrevPage: page > 1,
      },
    };
  }

  /**
   * Get interest detail for a specific stock
   */
  async getStockInterestDetail(stockId: string): Promise<{
    stock: any;
    summary: {
      totalAccumulatedInterest: number;
      totalDays: number;
      periodCount: number;
      currentRate: number;
      isCalculating: boolean;
    };
    periods: InterestPeriodDetail[];
  }> {
    const stock = await db.stock.findUnique({
      where: { id: stockId },
      include: {
        vehicleModel: {
          select: {
            id: true,
            brand: true,
            model: true,
            variant: true,
            year: true,
            type: true,
          },
        },
        interestPeriods: {
          orderBy: { startDate: 'asc' },
        },
      },
    });

    if (!stock) {
      throw new Error('Stock not found');
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let totalAccumulatedInterest = 0;
    let totalDays = 0;
    let currentRate = Number(stock.interestRate) * 100;

    const periods: InterestPeriodDetail[] = stock.interestPeriods.map((period) => {
      const endDate = period.endDate || today;
      const days = this.calculateDays(period.startDate, endDate);
      
      let calculatedInterest = Number(period.calculatedInterest);
      
      // If active period, calculate current interest
      if (!period.endDate) {
        calculatedInterest = this.calculateInterestForPeriod(
          Number(period.principalAmount),
          Number(period.annualRate),
          days
        );
        currentRate = Number(period.annualRate);
      }
      
      totalAccumulatedInterest += calculatedInterest;
      totalDays += days;

      return {
        id: period.id,
        startDate: period.startDate,
        endDate: period.endDate,
        annualRate: Number(period.annualRate),
        principalBase: period.principalBase,
        principalAmount: Number(period.principalAmount),
        calculatedInterest: Math.round(calculatedInterest * 100) / 100,
        daysCount: days,
        notes: period.notes,
        createdAt: period.createdAt,
        createdById: period.createdById,
      };
    });

    // If no periods, calculate from orderDate (or arrivalDate if orderDate is null)
    if (periods.length === 0 && !stock.stopInterestCalc && stock.status !== 'SOLD') {
      const interestStartDate = stock.orderDate || stock.arrivalDate;
      const daysCount = this.calculateDays(interestStartDate, today);
      const principalAmount = this.getPrincipalAmount(stock, stock.interestPrincipalBase);
      
      totalAccumulatedInterest = this.calculateInterestForPeriod(
        principalAmount,
        currentRate,
        daysCount
      );
      totalDays = daysCount;
    }

    const isCalculating = !stock.stopInterestCalc && stock.status !== 'SOLD';

    // วันที่เริ่มคิดดอกเบี้ย
    const interestStartDate = stock.orderDate || stock.arrivalDate;

    return {
      stock: {
        id: stock.id,
        vin: stock.vin,
        vehicleModel: stock.vehicleModel,
        exteriorColor: stock.exteriorColor,
        interiorColor: stock.interiorColor,
        orderDate: stock.orderDate,
        arrivalDate: stock.arrivalDate,
        interestStartDate,
        status: stock.status,
        baseCost: Number(stock.baseCost),
        transportCost: Number(stock.transportCost),
        accessoryCost: Number(stock.accessoryCost),
        otherCosts: Number(stock.otherCosts),
        totalCost: Number(stock.baseCost) + Number(stock.transportCost) + Number(stock.accessoryCost) + Number(stock.otherCosts),
        interestPrincipalBase: stock.interestPrincipalBase,
        financeProvider: stock.financeProvider,
        stopInterestCalc: stock.stopInterestCalc,
        interestStoppedAt: stock.interestStoppedAt,
      },
      summary: {
        totalAccumulatedInterest: Math.round(totalAccumulatedInterest * 100) / 100,
        totalDays,
        periodCount: periods.length,
        currentRate,
        isCalculating,
      },
      periods,
    };
  }

  /**
   * Update interest rate for a stock (creates new period)
   */
  async updateInterestRate(
    stockId: string,
    input: UpdateInterestRateInput,
    userId: string
  ): Promise<InterestPeriodDetail> {
    const stock = await db.stock.findUnique({
      where: { id: stockId },
      include: {
        interestPeriods: {
          where: { endDate: null },
          orderBy: { startDate: 'desc' },
          take: 1,
        },
      },
    });

    if (!stock) {
      throw new Error('Stock not found');
    }

    if (stock.stopInterestCalc) {
      throw new Error('Interest calculation has been stopped for this stock');
    }

    if (stock.status === 'SOLD') {
      throw new Error('Cannot update interest for sold stock');
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const effectiveDate = input.effectiveDate || today;
    const principalBase = input.principalBase || stock.interestPrincipalBase;
    const principalAmount = this.getPrincipalAmount(stock, principalBase);

    // Close the current active period if exists
    const activePeriod = stock.interestPeriods[0];
    
    if (activePeriod) {
      // Calculate and close the previous period
      const periodEndDate = new Date(effectiveDate);
      periodEndDate.setDate(periodEndDate.getDate() - 1);
      
      const days = this.calculateDays(activePeriod.startDate, periodEndDate);
      const calculatedInterest = this.calculateInterestForPeriod(
        Number(activePeriod.principalAmount),
        Number(activePeriod.annualRate),
        days
      );

      await db.interestPeriod.update({
        where: { id: activePeriod.id },
        data: {
          endDate: periodEndDate,
          calculatedInterest: new Decimal(calculatedInterest),
          daysCount: days,
        },
      });
    }

    // Create new period
    const newPeriod = await db.interestPeriod.create({
      data: {
        stockId,
        startDate: effectiveDate,
        endDate: null,
        annualRate: new Decimal(input.annualRate),
        principalBase,
        principalAmount: new Decimal(principalAmount),
        calculatedInterest: new Decimal(0),
        daysCount: 0,
        createdById: userId,
        notes: input.notes,
      },
    });

    // Update stock's current interest rate
    await db.stock.update({
      where: { id: stockId },
      data: {
        interestRate: new Decimal(input.annualRate / 100),
        interestPrincipalBase: principalBase,
      },
    });

    return {
      id: newPeriod.id,
      startDate: newPeriod.startDate,
      endDate: newPeriod.endDate,
      annualRate: Number(newPeriod.annualRate),
      principalBase: newPeriod.principalBase,
      principalAmount: Number(newPeriod.principalAmount),
      calculatedInterest: 0,
      daysCount: 0,
      notes: newPeriod.notes,
      createdAt: newPeriod.createdAt,
      createdById: newPeriod.createdById,
    };
  }

  /**
   * Stop interest calculation for a stock
   */
  async stopInterestCalculation(
    stockId: string,
    userId: string,
    notes?: string
  ): Promise<void> {
    const stock = await db.stock.findUnique({
      where: { id: stockId },
      include: {
        interestPeriods: {
          where: { endDate: null },
          orderBy: { startDate: 'desc' },
          take: 1,
        },
      },
    });

    if (!stock) {
      throw new Error('Stock not found');
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Close active period if exists
    const activePeriod = stock.interestPeriods[0];
    if (activePeriod) {
      const days = this.calculateDays(activePeriod.startDate, today);
      const calculatedInterest = this.calculateInterestForPeriod(
        Number(activePeriod.principalAmount),
        Number(activePeriod.annualRate),
        days
      );

      await db.interestPeriod.update({
        where: { id: activePeriod.id },
        data: {
          endDate: today,
          calculatedInterest: new Decimal(calculatedInterest),
          daysCount: days,
          notes: notes ? `${activePeriod.notes || ''}\n[Stopped] ${notes}`.trim() : activePeriod.notes,
        },
      });
    }

    // Update stock to stop interest calculation
    await db.stock.update({
      where: { id: stockId },
      data: {
        stopInterestCalc: true,
        interestStoppedAt: today,
      },
    });
  }

  /**
   * Resume interest calculation for a stock
   */
  async resumeInterestCalculation(
    stockId: string,
    input: {
      annualRate: number;
      principalBase?: InterestBase;
      notes?: string;
    },
    userId: string
  ): Promise<InterestPeriodDetail> {
    const stock = await db.stock.findUnique({
      where: { id: stockId },
    });

    if (!stock) {
      throw new Error('Stock not found');
    }

    if (!stock.stopInterestCalc) {
      throw new Error('Interest calculation is not stopped');
    }

    if (stock.status === 'SOLD') {
      throw new Error('Cannot resume interest for sold stock');
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const principalBase = input.principalBase || stock.interestPrincipalBase;
    const principalAmount = this.getPrincipalAmount(stock, principalBase);

    // Create new period
    const newPeriod = await db.interestPeriod.create({
      data: {
        stockId,
        startDate: today,
        endDate: null,
        annualRate: new Decimal(input.annualRate),
        principalBase,
        principalAmount: new Decimal(principalAmount),
        calculatedInterest: new Decimal(0),
        daysCount: 0,
        createdById: userId,
        notes: input.notes,
      },
    });

    // Update stock to resume interest calculation
    await db.stock.update({
      where: { id: stockId },
      data: {
        stopInterestCalc: false,
        interestStoppedAt: null,
        interestRate: new Decimal(input.annualRate / 100),
        interestPrincipalBase: principalBase,
      },
    });

    return {
      id: newPeriod.id,
      startDate: newPeriod.startDate,
      endDate: newPeriod.endDate,
      annualRate: Number(newPeriod.annualRate),
      principalBase: newPeriod.principalBase,
      principalAmount: Number(newPeriod.principalAmount),
      calculatedInterest: 0,
      daysCount: 0,
      notes: newPeriod.notes,
      createdAt: newPeriod.createdAt,
      createdById: newPeriod.createdById,
    };
  }

  /**
   * Initialize interest period for a stock (for existing stocks without periods)
   */
  async initializeInterestPeriod(
    stockId: string,
    input: {
      annualRate: number;
      principalBase?: InterestBase;
      startDate?: Date;
      notes?: string;
    },
    userId: string
  ): Promise<InterestPeriodDetail> {
    const stock = await db.stock.findUnique({
      where: { id: stockId },
      include: {
        interestPeriods: true,
      },
    });

    if (!stock) {
      throw new Error('Stock not found');
    }

    if (stock.interestPeriods.length > 0) {
      throw new Error('Stock already has interest periods. Use update instead.');
    }

    // ใช้ orderDate เป็น default ถ้ามี ไม่งั้นใช้ arrivalDate
    const startDate = input.startDate || stock.orderDate || stock.arrivalDate;
    const principalBase = input.principalBase || stock.interestPrincipalBase;
    const principalAmount = this.getPrincipalAmount(stock, principalBase);

    const newPeriod = await db.interestPeriod.create({
      data: {
        stockId,
        startDate,
        endDate: null,
        annualRate: new Decimal(input.annualRate),
        principalBase,
        principalAmount: new Decimal(principalAmount),
        calculatedInterest: new Decimal(0),
        daysCount: 0,
        createdById: userId,
        notes: input.notes || 'Initial interest period',
      },
    });

    // Update stock's interest rate
    await db.stock.update({
      where: { id: stockId },
      data: {
        interestRate: new Decimal(input.annualRate / 100),
        interestPrincipalBase: principalBase,
      },
    });

    return {
      id: newPeriod.id,
      startDate: newPeriod.startDate,
      endDate: newPeriod.endDate,
      annualRate: Number(newPeriod.annualRate),
      principalBase: newPeriod.principalBase,
      principalAmount: Number(newPeriod.principalAmount),
      calculatedInterest: 0,
      daysCount: 0,
      notes: newPeriod.notes,
      createdAt: newPeriod.createdAt,
      createdById: newPeriod.createdById,
    };
  }

  /**
   * Get interest statistics
   */
  async getInterestStats(): Promise<{
    totalStocksWithInterest: number;
    activeCalculations: number;
    stoppedCalculations: number;
    totalAccumulatedInterest: number;
    averageRate: number;
  }> {
    const [totalStocks, activeStocks, allPeriods] = await Promise.all([
      db.stock.count({
        where: {
          status: { in: ['AVAILABLE', 'RESERVED', 'PREPARING'] },
        },
      }),
      db.stock.count({
        where: {
          stopInterestCalc: false,
          status: { in: ['AVAILABLE', 'RESERVED', 'PREPARING'] },
        },
      }),
      db.interestPeriod.findMany({
        include: {
          stock: {
            select: { status: true, stopInterestCalc: true },
          },
        },
      }),
    ]);

    const today = new Date();
    let totalInterest = 0;
    let totalRate = 0;
    let rateCount = 0;

    for (const period of allPeriods) {
      if (period.endDate) {
        totalInterest += Number(period.calculatedInterest);
      } else {
        // Active period
        const days = this.calculateDays(period.startDate, today);
        const interest = this.calculateInterestForPeriod(
          Number(period.principalAmount),
          Number(period.annualRate),
          days
        );
        totalInterest += interest;
        totalRate += Number(period.annualRate);
        rateCount++;
      }
    }

    return {
      totalStocksWithInterest: totalStocks,
      activeCalculations: activeStocks,
      stoppedCalculations: totalStocks - activeStocks,
      totalAccumulatedInterest: Math.round(totalInterest * 100) / 100,
      averageRate: rateCount > 0 ? Math.round((totalRate / rateCount) * 100) / 100 : 0,
    };
  }
}

export const interestService = new InterestService();
