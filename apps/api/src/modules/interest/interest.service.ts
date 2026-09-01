import { db } from '../../lib/db';
import { Decimal } from '@prisma/client/runtime/library';
import { InterestBase, StockStatus, DebtStatus, PaymentMethod, Prisma } from '@prisma/client';
import { NotFoundError, BadRequestError } from '../../lib/errors';
import {
  buildImplicitClosedPeriod,
  canAccrueWithoutPeriods,
  dayBefore,
  dayKey,
  daysBetween,
  implicitAccrualEndDate,
  isValidResumeStartDate,
  isValidStopDate,
} from './interest.dates';
import { resolveStopPeriodSource } from './interest.stop';
import {
  type BulkInterestResult,
  type BulkPrincipalChoice,
  type BulkStockRef,
  type InterestListFilters,
  assertBulkStockCount,
  buildInterestListWhere,
  classifyForApplyRate,
  classifyForStop,
  emptyBulkResult,
  pushBulkItem,
  resolveBulkPrincipalBase,
  resolveBulkRate,
} from './interest.bulk';

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
   * Calculate exclusive calendar days between two dates (same day = 0).
   */
  private calculateDays(startDate: Date, endDate: Date): number {
    return daysBetween(startDate, endDate);
  }

  private implicitClosedPeriodData(
    stock: {
      id: string;
      orderDate: Date | null;
      arrivalDate: Date | null;
      interestRate: Decimal | number;
      interestPrincipalBase: InterestBase;
      baseCost: Decimal | number;
      transportCost: Decimal | number;
      accessoryCost: Decimal | number;
      otherCosts: Decimal | number;
    },
    endDate: Date,
    userId: string,
    notes?: string
  ) {
    const principalAmount = this.getPrincipalAmount(stock, stock.interestPrincipalBase);
    const annualRatePercent = Number(stock.interestRate) * 100;
    const built = buildImplicitClosedPeriod({
      startDate: stock.orderDate || stock.arrivalDate,
      endDate,
      annualRatePercent,
      principalAmount,
    });
    if (!built) return null;
    return {
      stockId: stock.id,
      startDate: built.startDate,
      endDate: built.endDate,
      annualRate: new Decimal(annualRatePercent),
      principalBase: stock.interestPrincipalBase,
      principalAmount: new Decimal(principalAmount),
      calculatedInterest: new Decimal(built.calculatedInterest),
      daysCount: built.daysCount,
      createdById: userId,
      notes: notes ?? null,
    };
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

    const where = buildInterestListWhere({
      search: params.search,
      status: params.status,
      isCalculating: params.isCalculating,
    });

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
      const interestStartDate = stock.orderDate || stock.arrivalDate || today;
      const accrualEnd = implicitAccrualEndDate({
        stopInterestCalc: stock.stopInterestCalc,
        interestStoppedAt: stock.interestStoppedAt,
        soldDate: stock.soldDate,
        today,
      });
      const daysCount = interestStartDate ? this.calculateDays(interestStartDate, accrualEnd) : 0;
      
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
      } else if (
        stock.interestPeriods.length === 0 &&
        canAccrueWithoutPeriods(stock)
      ) {
        // No periods yet, use stock's default rate through stop date when stopped
        currentRate = Number(stock.interestRate) * 100; // Convert from decimal to percentage
        principalAmount = this.getPrincipalAmount(stock, stock.interestPrincipalBase);
        
        const interest = this.calculateInterestForPeriod(
          principalAmount,
          currentRate,
          daysCount
        );
        totalAccumulatedInterest += interest;
      } else if (stock.interestPeriods.length > 0) {
        const latest = stock.interestPeriods[0];
        currentRate = Number(latest.annualRate);
        principalBase = latest.principalBase;
        principalAmount = Number(latest.principalAmount);
      } else {
        currentRate = Number(stock.interestRate) * 100;
      }

      // Add closed periods' interest
      stock.interestPeriods
        .filter(p => p.endDate)
        .forEach(p => {
          totalAccumulatedInterest += Number(p.calculatedInterest);
        });

      const isCalculating = !stock.stopInterestCalc && stock.debtStatus !== 'PAID_OFF';

      return {
        stockId: stock.id,
        vin: stock.vin,
        vehicleModel: stock.vehicleModel,
        exteriorColor: stock.exteriorColor,
        status: stock.status,
        orderDate: stock.orderDate,
        arrivalDate: stock.arrivalDate ?? today,
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
      throw new NotFoundError('Stock');
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
    // including stocks already stopped so history-less rows still show accrued totals.
    if (periods.length === 0 && canAccrueWithoutPeriods(stock)) {
      const interestStartDate = stock.orderDate || stock.arrivalDate;
      if (interestStartDate) {
        const endDate = implicitAccrualEndDate({
          stopInterestCalc: stock.stopInterestCalc,
          interestStoppedAt: stock.interestStoppedAt,
          soldDate: stock.soldDate,
          today,
        });
        const daysCount = this.calculateDays(interestStartDate, endDate);
        const principalAmount = this.getPrincipalAmount(stock, stock.interestPrincipalBase);

        totalAccumulatedInterest = this.calculateInterestForPeriod(
          principalAmount,
          currentRate,
          daysCount
        );
        totalDays = daysCount;
      }
    }

    const isCalculating = !stock.stopInterestCalc && stock.debtStatus !== 'PAID_OFF';

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
          orderBy: { startDate: 'desc' },
        },
      },
    });

    if (!stock) {
      throw new NotFoundError('Stock');
    }

    if (stock.stopInterestCalc) {
      throw new BadRequestError('Interest calculation has been stopped for this stock');
    }

    if (stock.debtStatus === 'PAID_OFF') {
      throw new BadRequestError('Cannot update interest for stock with paid off debt');
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const effectiveDate = input.effectiveDate || today;
    const principalBase = input.principalBase || stock.interestPrincipalBase;
    const principalAmount = this.getPrincipalAmount(stock, principalBase);

    const activePeriod = stock.interestPeriods.find((p) => !p.endDate);

    // Atomic: closing the previous period, creating the new one, and updating
    // the stock's rate must succeed or fail together — a partial apply leaves
    // the interest history in an inconsistent state.
    const newPeriod = await db.$transaction(async (tx) => {
      if (activePeriod) {
        const periodEndDate = dayBefore(effectiveDate);

        const days = this.calculateDays(activePeriod.startDate, periodEndDate);
        const calculatedInterest = this.calculateInterestForPeriod(
          Number(activePeriod.principalAmount),
          Number(activePeriod.annualRate),
          days
        );

        await tx.interestPeriod.update({
          where: { id: activePeriod.id },
          data: {
            endDate: periodEndDate,
            calculatedInterest: new Decimal(calculatedInterest),
            daysCount: days,
          },
        });
      } else if (stock.interestPeriods.length === 0) {
        const implicit = this.implicitClosedPeriodData(
          stock,
          dayBefore(effectiveDate),
          userId,
          input.notes
            ? `[Closed implicit period before rate change] ${input.notes}`
            : 'Closed implicit period before rate change'
        );
        if (implicit) {
          await tx.interestPeriod.create({ data: implicit });
        }
      }

      const created = await tx.interestPeriod.create({
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

      await tx.stock.update({
        where: { id: stockId },
        data: {
          interestRate: new Decimal(input.annualRate / 100),
          interestPrincipalBase: principalBase,
        },
      });

      return created;
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
    notes?: string,
    stopDate?: Date
  ): Promise<void> {
    const stock = await db.stock.findUnique({
      where: { id: stockId },
      include: {
        interestPeriods: {
          orderBy: { startDate: 'desc' },
        },
        _count: { select: { interestPeriods: true } },
      },
    });

    if (!stock) {
      throw new NotFoundError('Stock');
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const effectiveStopDate = stopDate || today;

    const activePeriod = stock.interestPeriods.find((p) => !p.endDate);
    // Falls back to the implicit period (stock rate since orderDate/arrivalDate)
    // for stock that was never initialized — see interest.stop.ts.
    const source = resolveStopPeriodSource({
      activePeriod: activePeriod
        ? {
            id: activePeriod.id,
            startDate: activePeriod.startDate,
            annualRate: Number(activePeriod.annualRate),
            principalBase: activePeriod.principalBase,
            principalAmount: Number(activePeriod.principalAmount),
            notes: activePeriod.notes,
          }
        : null,
      periodCount: stock._count.interestPeriods,
      debtStatus: stock.debtStatus,
      interestStartDate: stock.orderDate || stock.arrivalDate,
      stockAnnualRate: Number(stock.interestRate) * 100,
      stockPrincipalBase: stock.interestPrincipalBase,
      stockPrincipalAmount: this.getPrincipalAmount(stock, stock.interestPrincipalBase),
    });

    // Validate a caller-supplied back-date: must be within [period start, today].
    if (stopDate) {
      const ok = isValidStopDate(
        dayKey(effectiveStopDate),
        source ? dayKey(source.startDate) : null,
        dayKey(today),
      );
      if (!ok) {
        throw new BadRequestError(
          'วันที่หยุดต้องไม่เกินวันนี้ และไม่ก่อนวันเริ่มคิดดอกเบี้ยของงวดปัจจุบัน',
        );
      }
    }

    await db.$transaction(async (tx) => {
      if (source) {
        const days = this.calculateDays(source.startDate, effectiveStopDate);
        const calculatedInterest = this.calculateInterestForPeriod(
          source.principalAmount,
          source.annualRate,
          days
        );
        const stoppedNotes = notes
          ? `${source.notes || ''}\n[Stopped] ${notes}`.trim()
          : source.notes;

        if (source.existingPeriodId) {
          await tx.interestPeriod.update({
            where: { id: source.existingPeriodId },
            data: {
              endDate: effectiveStopDate,
              calculatedInterest: new Decimal(calculatedInterest),
              daysCount: days,
              notes: stoppedNotes,
            },
          });
        } else {
          await tx.interestPeriod.create({
            data: {
              stockId,
              startDate: source.startDate,
              endDate: effectiveStopDate,
              annualRate: new Decimal(source.annualRate),
              principalBase: source.principalBase,
              principalAmount: new Decimal(source.principalAmount),
              calculatedInterest: new Decimal(calculatedInterest),
              daysCount: days,
              createdById: userId,
              notes: stoppedNotes,
            },
          });
        }
      }

      await tx.stock.update({
        where: { id: stockId },
        data: {
          stopInterestCalc: true,
          interestStoppedAt: effectiveStopDate,
        },
      });
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
      startDate?: Date;
    },
    userId: string
  ): Promise<InterestPeriodDetail> {
    const stock = await db.stock.findUnique({
      where: { id: stockId },
      include: { interestPeriods: true },
    });

    if (!stock) {
      throw new NotFoundError('Stock');
    }

    if (!stock.stopInterestCalc) {
      throw new BadRequestError('Interest calculation is not stopped');
    }

    if (stock.debtStatus === 'PAID_OFF') {
      throw new BadRequestError('Cannot resume interest for stock with paid off debt');
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const effectiveStartDate = input.startDate || today;

    // Validate a caller-supplied back-date: it may be any day, the only rule is no future date.
    if (input.startDate) {
      const ok = isValidResumeStartDate(dayKey(effectiveStartDate), null, dayKey(today));
      if (!ok) {
        throw new BadRequestError('วันที่เริ่มคิดดอกเบี้ยใหม่ต้องไม่เกินวันนี้');
      }
    }

    const principalBase = input.principalBase || stock.interestPrincipalBase;
    const principalAmount = this.getPrincipalAmount(stock, principalBase);

    const newPeriod = await db.$transaction(async (tx) => {
      if (stock.interestPeriods.length === 0) {
        const closeEnd = stock.interestStoppedAt || dayBefore(effectiveStartDate);
        const implicit = this.implicitClosedPeriodData(
          stock,
          closeEnd,
          userId,
          'Closed implicit period before resume'
        );
        if (implicit) {
          await tx.interestPeriod.create({ data: implicit });
        }
      }

      const created = await tx.interestPeriod.create({
        data: {
          stockId,
          startDate: effectiveStartDate,
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

      await tx.stock.update({
        where: { id: stockId },
        data: {
          stopInterestCalc: false,
          interestStoppedAt: null,
          interestRate: new Decimal(input.annualRate / 100),
          interestPrincipalBase: principalBase,
        },
      });

      return created;
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
      throw new NotFoundError('Stock');
    }

    if (stock.interestPeriods.length > 0) {
      throw new BadRequestError('Stock already has interest periods. Use update instead.');
    }

    // ใช้ orderDate เป็น default ถ้ามี ไม่งั้นใช้ arrivalDate
    const startDate = input.startDate || stock.orderDate || stock.arrivalDate;
    if (!startDate) {
      throw new BadRequestError('Stock has no order date or arrival date to start interest');
    }
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
    // Get all stocks with their interest periods (exclude soft-deleted)
    const allStocks = await db.stock.findMany({
      where: { deletedAt: null },
      include: {
        interestPeriods: {
          orderBy: { startDate: 'desc' },
        },
      },
    });

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let totalInterest = 0;
    let totalRate = 0;
    let stocksWithInterest = 0;
    let activeCalculations = 0;
    let stoppedCalculations = 0;

    for (const stock of allStocks) {
      // Skip stocks with no interest history
      if (stock.interestPeriods.length === 0 && stock.debtStatus === 'PAID_OFF') {
        continue;
      }

      stocksWithInterest++;

      // Check if actively calculating
      const isCalculating = !stock.stopInterestCalc && stock.debtStatus !== 'PAID_OFF';
      if (isCalculating) {
        activeCalculations++;
      } else {
        stoppedCalculations++;
      }

      // Calculate accumulated interest for this stock
      let stockInterest = 0;

      // Get active period
      const activePeriod = stock.interestPeriods.find((p) => !p.endDate);

      if (activePeriod) {
        // Calculate interest for active period
        const periodDays = this.calculateDays(activePeriod.startDate, today);
        const activeInterest = this.calculateInterestForPeriod(
          Number(activePeriod.principalAmount),
          Number(activePeriod.annualRate),
          periodDays
        );
        stockInterest += activeInterest;
        totalRate += Number(activePeriod.annualRate);
      } else if (stock.interestPeriods.length === 0 && canAccrueWithoutPeriods(stock)) {
        // No periods yet, use stock's default rate through stop date when stopped
        const baseCost = Number(stock.baseCost);
        const totalCost = baseCost + Number(stock.transportCost) + Number(stock.accessoryCost) + Number(stock.otherCosts);
        const principalAmount = stock.interestPrincipalBase === 'BASE_COST_ONLY' ? baseCost : totalCost;
        const interestStartDate = stock.orderDate || stock.arrivalDate;
        if (interestStartDate) {
          const endDate = implicitAccrualEndDate({
            stopInterestCalc: stock.stopInterestCalc,
            interestStoppedAt: stock.interestStoppedAt,
            soldDate: stock.soldDate,
            today,
          });
          const days = this.calculateDays(interestStartDate, endDate);

          stockInterest = this.calculateInterestForPeriod(
            principalAmount,
            Number(stock.interestRate) * 100,
            days
          );
        }
        totalRate += Number(stock.interestRate) * 100;
      }

      // Add closed periods' interest
      stock.interestPeriods
        .filter((p) => p.endDate)
        .forEach((p) => {
          stockInterest += Number(p.calculatedInterest);
        });

      totalInterest += stockInterest;
    }

    return {
      totalStocksWithInterest: stocksWithInterest,
      activeCalculations,
      stoppedCalculations,
      totalAccumulatedInterest: Math.round(totalInterest * 100) / 100,
      averageRate: stocksWithInterest > 0 ? Math.round((totalRate / stocksWithInterest) * 100) / 100 : 0,
    };
  }

  // ============================================
  // Debt Payment Management
  // ============================================

  /**
   * Initialize debt for a stock (เริ่มต้นหนี้รถเมื่อรถเข้าสต็อก)
   */
  async initializeDebt(
    stockId: string,
    debtAmount: number,
    userId: string
  ): Promise<void> {
    const stock = await db.stock.findUnique({
      where: { id: stockId },
    });

    if (!stock) {
      throw new NotFoundError('Stock');
    }

    if (stock.debtStatus !== 'NO_DEBT' && Number(stock.debtAmount) > 0) {
      throw new BadRequestError('Stock already has debt initialized');
    }

    await db.stock.update({
      where: { id: stockId },
      data: {
        debtAmount: new Decimal(debtAmount),
        paidDebtAmount: new Decimal(0),
        remainingDebt: new Decimal(debtAmount),
        debtStatus: 'ACTIVE',
      },
    });
  }

  /**
   * Record a debt payment (บันทึกการจ่ายหนี้รถ)
   * paymentType:
   * - AUTO: ใช้หลัก Interest-First Allocation: จ่ายดอกเบี้ยก่อน ส่วนเหลือลดเงินต้น
   * - PRINCIPAL_ONLY: จ่ายเฉพาะเงินต้น (ไม่ลดดอกเบี้ยค้าง)
   * - INTEREST_ONLY: จ่ายเฉพาะดอกเบี้ย (ไม่ลดเงินต้น)
   */
  async recordDebtPayment(
    stockId: string,
    input: {
      amount: number;
      paymentMethod: PaymentMethod;
      paymentType?: 'AUTO' | 'PRINCIPAL_ONLY' | 'INTEREST_ONLY';
      paymentDate?: Date;
      referenceNumber?: string;
      notes?: string;
    },
    userId: string
  ): Promise<{
    payment: any;
    stock: any;
    interestAdjusted: boolean;
    debtPaidOff: boolean;
    allocation: {
      interestPaid: number;
      principalPaid: number;
      accruedInterestAtPayment: number;
    };
  }> {
    const stock = await db.stock.findUnique({
      where: { id: stockId },
      select: {
        id: true,
        debtAmount: true,
        paidDebtAmount: true,
        paidInterestAmount: true,
        remainingDebt: true,
        debtStatus: true,
        financeProvider: true,
        baseCost: true,
        transportCost: true,
        accessoryCost: true,
        otherCosts: true,
        interestPrincipalBase: true,
        interestRate: true,
        stopInterestCalc: true,
        status: true,
        orderDate: true,
        arrivalDate: true,
        interestPeriods: {
          orderBy: { startDate: 'desc' },
        },
      },
    });

    if (!stock) {
      throw new NotFoundError('Stock');
    }

    if (stock.debtStatus === 'PAID_OFF') {
      throw new BadRequestError('Stock debt is already paid off');
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const paymentDate = input.paymentDate || today;
    const paymentType = input.paymentType || 'AUTO';

    // Auto-initialize debt ถ้ายังไม่มี แต่มี financeProvider
    let currentDebtAmount = Number(stock.debtAmount);
    let currentRemainingDebt = Number(stock.remainingDebt);
    
    let needsDebtInit = false;
    if (stock.debtStatus === 'NO_DEBT' && stock.financeProvider) {
      const baseCost = Number(stock.baseCost);
      const totalCost = baseCost + Number(stock.transportCost) + Number(stock.accessoryCost) + Number(stock.otherCosts);
      currentDebtAmount = stock.interestPrincipalBase === 'BASE_COST_ONLY' ? baseCost : totalCost;
      currentRemainingDebt = currentDebtAmount;
      needsDebtInit = true;
    } else if (stock.debtStatus === 'NO_DEBT' && !stock.financeProvider) {
      throw new BadRequestError('Stock has no debt to pay (no finance provider)');
    }

    // คำนวณดอกเบี้ยสะสม ณ วันจ่าย
    let accruedInterestAtPayment = 0;
    const activePeriod = stock.interestPeriods.find((p) => !p.endDate);
    let currentInterestRate = Number(stock.interestRate) * 100;
    
    // Since we've already checked that debtStatus is not PAID_OFF, we only need to check stopInterestCalc
    if (!stock.stopInterestCalc) {
      if (activePeriod) {
        currentInterestRate = Number(activePeriod.annualRate);
        const periodDays = this.calculateDays(activePeriod.startDate, paymentDate);
        accruedInterestAtPayment = this.calculateInterestForPeriod(
          Number(activePeriod.principalAmount),
          currentInterestRate,
          periodDays
        );
      } else if (stock.interestPeriods.length === 0) {
        const interestStartDate = stock.orderDate || stock.arrivalDate;
        if (interestStartDate) {
          const daysCount = this.calculateDays(interestStartDate, paymentDate);
          accruedInterestAtPayment = this.calculateInterestForPeriod(
            currentRemainingDebt,
            currentInterestRate,
            daysCount
          );
        }
      }
    }

    // Validate and calculate allocation based on paymentType
    let interestPaid = 0;
    let principalPaid = 0;

    if (paymentType === 'PRINCIPAL_ONLY') {
      // จ่ายเฉพาะเงินต้น
      if (input.amount > currentRemainingDebt) {
        throw new BadRequestError(`Payment amount (${input.amount.toLocaleString()}) exceeds remaining principal (${currentRemainingDebt.toLocaleString()})`);
      }
      interestPaid = 0;
      principalPaid = input.amount;
    } else if (paymentType === 'INTEREST_ONLY') {
      // จ่ายเฉพาะดอกเบี้ย
      if (input.amount > accruedInterestAtPayment) {
        throw new BadRequestError(`Payment amount (${input.amount.toLocaleString()}) exceeds accrued interest (${accruedInterestAtPayment.toLocaleString()})`);
      }
      interestPaid = input.amount;
      principalPaid = 0;
    } else {
      // AUTO: Interest-First Allocation
      const totalPayoff = currentRemainingDebt + accruedInterestAtPayment;
      if (input.amount > totalPayoff) {
        throw new BadRequestError(`Payment amount (${input.amount.toLocaleString()}) exceeds total payoff (${totalPayoff.toLocaleString()})`);
      }

      if (input.amount >= accruedInterestAtPayment) {
        // จ่ายพอครอบคลุมดอกเบี้ยทั้งหมด
        interestPaid = accruedInterestAtPayment;
        principalPaid = input.amount - accruedInterestAtPayment;
      } else {
        // จ่ายไม่พอดอกเบี้ย = จ่ายดอกเบี้ยบางส่วน (ไม่ลดเงินต้น)
        interestPaid = input.amount;
        principalPaid = 0;
      }
    }

    const principalBefore = currentRemainingDebt;
    const principalAfter = currentRemainingDebt - principalPaid;
    const newPaidPrincipal = Number(stock.paidDebtAmount) + principalPaid;
    const newPaidInterest = Number(stock.paidInterestAmount || 0) + interestPaid;
    const isFullPayment = principalAfter <= 0.01; // Allow for small rounding errors

    // All debt-payment mutations must commit together — a partial apply would
    // leave stock totals, the payment record, and interest periods out of sync.
    const { payment, interestAdjusted } = await db.$transaction(async (tx) => {
      // Initialize debt if needed (for NO_DEBT stocks with a finance provider)
      if (needsDebtInit) {
        await tx.stock.update({
          where: { id: stockId },
          data: {
            debtAmount: new Decimal(currentDebtAmount),
            remainingDebt: new Decimal(currentRemainingDebt),
            debtStatus: 'ACTIVE',
          },
        });
      }

      // Create debt payment record with interest tracking
      const created = await tx.stockDebtPayment.create({
        data: {
          stockId,
          paymentDate,
          amount: new Decimal(input.amount),
          paymentMethod: input.paymentMethod,
          referenceNumber: input.referenceNumber,
          principalBefore: new Decimal(principalBefore),
          principalAfter: new Decimal(Math.max(0, principalAfter)),
          accruedInterestAtPayment: new Decimal(accruedInterestAtPayment),
          interestPaid: new Decimal(interestPaid),
          principalPaid: new Decimal(principalPaid),
          notes: input.notes,
          createdById: userId,
        },
      });

      // Update stock debt tracking
      const stockUpdateData: any = {
        paidDebtAmount: new Decimal(newPaidPrincipal),
        paidInterestAmount: new Decimal(newPaidInterest),
        remainingDebt: new Decimal(Math.max(0, principalAfter)),
      };

      if (isFullPayment) {
        stockUpdateData.debtStatus = 'PAID_OFF';
        stockUpdateData.debtPaidOffDate = paymentDate;
      }

      await tx.stock.update({
        where: { id: stockId },
        data: stockUpdateData,
      });

      let adjusted = false;

      // ถ้าจ่ายบางส่วน (ลดเงินต้น) → ต้องปรับ InterestPeriod
      if (!isFullPayment && principalPaid > 0 && principalAfter > 0) {
        if (!stock.stopInterestCalc) {
          const nextDay = new Date(paymentDate);
          nextDay.setDate(nextDay.getDate() + 1);

          if (activePeriod) {
            const days = this.calculateDays(activePeriod.startDate, paymentDate);
            const calculatedInterest = this.calculateInterestForPeriod(
              Number(activePeriod.principalAmount),
              Number(activePeriod.annualRate),
              days
            );

            await tx.interestPeriod.update({
              where: { id: activePeriod.id },
              data: {
                endDate: paymentDate,
                calculatedInterest: new Decimal(calculatedInterest),
                daysCount: days,
                notes: `${activePeriod.notes || ''}\n[Debt Payment] Interest ${interestPaid.toLocaleString()}, Principal ${principalPaid.toLocaleString()} - Remaining ${principalAfter.toLocaleString()}`.trim(),
              },
            });

            await tx.interestPeriod.create({
              data: {
                stockId,
                startDate: nextDay,
                endDate: null,
                annualRate: activePeriod.annualRate,
                principalBase: activePeriod.principalBase,
                principalAmount: new Decimal(principalAfter),
                calculatedInterest: new Decimal(0),
                daysCount: 0,
                createdById: userId,
                notes: `Principal adjusted after debt payment (Interest: ${interestPaid.toLocaleString()}, Principal: ${principalPaid.toLocaleString()})`,
              },
            });
          } else {
            await tx.interestPeriod.create({
              data: {
                stockId,
                startDate: nextDay,
                endDate: null,
                annualRate: new Decimal(currentInterestRate),
                principalBase: stock.interestPrincipalBase,
                principalAmount: new Decimal(principalAfter),
                calculatedInterest: new Decimal(0),
                daysCount: 0,
                createdById: userId,
                notes: `Initial period created from debt payment (Interest: ${interestPaid.toLocaleString()}, Principal: ${principalPaid.toLocaleString()})`,
              },
            });
          }

          adjusted = true;
        }
      }

      // If full payment, stop interest calculation inline (mirrors stopInterestCalculation
      // but uses the current tx so the whole sequence stays atomic).
      if (isFullPayment) {
        const stopNotes = `Debt fully paid off on ${paymentDate.toISOString().split('T')[0]} (Total paid: ${input.amount.toLocaleString()}, Interest: ${interestPaid.toLocaleString()}, Principal: ${principalPaid.toLocaleString()})`;

        if (activePeriod) {
          const days = this.calculateDays(activePeriod.startDate, paymentDate);
          const calculatedInterest = this.calculateInterestForPeriod(
            Number(activePeriod.principalAmount),
            Number(activePeriod.annualRate),
            days
          );

          await tx.interestPeriod.update({
            where: { id: activePeriod.id },
            data: {
              endDate: paymentDate,
              calculatedInterest: new Decimal(calculatedInterest),
              daysCount: days,
              notes: `${activePeriod.notes || ''}\n[Stopped] ${stopNotes}`.trim(),
            },
          });
        } else if (stock.interestPeriods.length === 0) {
          const implicit = this.implicitClosedPeriodData(stock, paymentDate, userId, `[Stopped] ${stopNotes}`);
          if (implicit) {
            await tx.interestPeriod.create({ data: implicit });
          }
        }

        await tx.stock.update({
          where: { id: stockId },
          data: {
            stopInterestCalc: true,
            interestStoppedAt: paymentDate,
          },
        });
      }

      return { payment: created, interestAdjusted: adjusted };
    });

    // Get updated stock
    const updatedStock = await db.stock.findUnique({
      where: { id: stockId },
      include: {
        vehicleModel: {
          select: {
            brand: true,
            model: true,
            variant: true,
            year: true,
          },
        },
      },
    });

    return {
      payment,
      stock: updatedStock,
      interestAdjusted,
      debtPaidOff: isFullPayment,
      allocation: {
        interestPaid: Math.round(interestPaid * 100) / 100,
        principalPaid: Math.round(principalPaid * 100) / 100,
        accruedInterestAtPayment: Math.round(accruedInterestAtPayment * 100) / 100,
      },
    };
  }

  /**
   * Get debt payment history for a stock
   */
  async getDebtPayments(stockId: string): Promise<any[]> {
    const payments = await db.stockDebtPayment.findMany({
      where: { stockId },
      orderBy: { paymentDate: 'desc' },
    });

    return payments.map((p) => ({
      id: p.id,
      paymentDate: p.paymentDate,
      amount: Number(p.amount),
      paymentMethod: p.paymentMethod,
      referenceNumber: p.referenceNumber,
      principalBefore: Number(p.principalBefore),
      principalAfter: Number(p.principalAfter),
      accruedInterestAtPayment: Number(p.accruedInterestAtPayment || 0),
      interestPaid: Number(p.interestPaid || 0),
      principalPaid: Number(p.principalPaid || 0),
      notes: p.notes,
      createdById: p.createdById,
      createdAt: p.createdAt,
    }));
  }

  /**
   * Get debt summary for a stock
   * ถ้ายังไม่มี debtAmount แต่มี financeProvider จะใช้ baseCost เป็น default
   * รวมดอกเบี้ยสะสมและยอดปิดหนี้รวม
   */
  async getDebtSummary(stockId: string): Promise<{
    debtAmount: number;
    paidDebtAmount: number;
    paidInterestAmount: number;
    remainingDebt: number;
    totalAccruedInterest: number;  // ดอกเบี้ยสะสมรวมทั้งหมด (จากทุก periods)
    accruedInterest: number;       // ดอกเบี้ยค้างชำระ = totalAccruedInterest - paidInterestAmount
    totalPayoffAmount: number;
    debtStatus: DebtStatus;
    debtPaidOffDate: Date | null;
    paymentCount: number;
    lastPaymentDate: Date | null;
    hasFinanceProvider: boolean;
    baseCost: number;
    totalCost: number;
    currentInterestRate: number;
    interestPrincipalBase: string;
  }> {
    const stock = await db.stock.findUnique({
      where: { id: stockId },
      select: {
        debtAmount: true,
        paidDebtAmount: true,
        paidInterestAmount: true,
        remainingDebt: true,
        debtStatus: true,
        debtPaidOffDate: true,
        financeProvider: true,
        baseCost: true,
        transportCost: true,
        accessoryCost: true,
        otherCosts: true,
        interestPrincipalBase: true,
        interestRate: true,
        stopInterestCalc: true,
        interestStoppedAt: true,
        status: true,
        orderDate: true,
        arrivalDate: true,
        soldDate: true,
        interestPeriods: {
          orderBy: { startDate: 'desc' },
        },
      },
    });

    if (!stock) {
      throw new NotFoundError('Stock');
    }

    const paymentStats = await db.stockDebtPayment.aggregate({
      where: { stockId },
      _count: true,
      _max: { paymentDate: true },
    });

    const baseCost = Number(stock.baseCost);
    const totalCost = baseCost + Number(stock.transportCost) + Number(stock.accessoryCost) + Number(stock.otherCosts);
    const hasFinanceProvider = !!stock.financeProvider;
    
    // ถ้ามี financeProvider แต่ยังไม่มี debtAmount -> ใช้ baseCost/totalCost ตาม interestPrincipalBase
    let effectiveDebtAmount = Number(stock.debtAmount);
    let effectiveRemainingDebt = Number(stock.remainingDebt);
    let effectiveDebtStatus = stock.debtStatus;
    
    if (hasFinanceProvider && effectiveDebtAmount === 0 && effectiveDebtStatus === 'NO_DEBT') {
      // Auto-calculate จาก baseCost
      effectiveDebtAmount = stock.interestPrincipalBase === 'BASE_COST_ONLY' ? baseCost : totalCost;
      effectiveRemainingDebt = effectiveDebtAmount - Number(stock.paidDebtAmount);
      effectiveDebtStatus = 'ACTIVE';
    }

    // คำนวณดอกเบี้ยค้างชำระจาก periods (ยังไม่หัก paidInterestAmount)
    let accruedFromPeriods = 0;
    let currentInterestRate = Number(stock.interestRate) * 100;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    // 1. รวมดอกเบี้ยจาก closed periods
    for (const period of stock.interestPeriods.filter(p => p.endDate)) {
      accruedFromPeriods += Number(period.calculatedInterest);
    }
    
    // 2. คำนวณดอกเบี้ยจาก active period
    const activePeriod = stock.interestPeriods.find(p => !p.endDate);
    
    if (activePeriod) {
      currentInterestRate = Number(activePeriod.annualRate);
      const periodDays = this.calculateDays(activePeriod.startDate, today);
      const activeInterest = this.calculateInterestForPeriod(
        Number(activePeriod.principalAmount),
        currentInterestRate,
        periodDays
      );
      accruedFromPeriods += activeInterest;
    } else if (stock.interestPeriods.length === 0 && canAccrueWithoutPeriods(stock)) {
      // ไม่มี period, คำนวณจาก stock default ถึงวันหยุดถ้าหยุดแล้ว
      // ใช้ effectiveRemainingDebt แทน effectiveDebtAmount เพื่อให้ดอกเบี้ยถูกต้องหลังจ่ายหนี้บางส่วน
      const interestStartDate = stock.orderDate || stock.arrivalDate;
      if (interestStartDate) {
        const endDate = implicitAccrualEndDate({
          stopInterestCalc: stock.stopInterestCalc,
          interestStoppedAt: stock.interestStoppedAt,
          soldDate: stock.soldDate,
          today,
        });
        const daysCount = this.calculateDays(interestStartDate, endDate);
        accruedFromPeriods = this.calculateInterestForPeriod(
          effectiveRemainingDebt,
          currentInterestRate,
          daysCount
        );
      }
    }
    
    const paidInterestAmount = Number(stock.paidInterestAmount || 0);
    
    // ดอกเบี้ยค้างชำระ = ดอกเบี้ยจาก periods - ดอกเบี้ยที่จ่ายแล้ว (ต้องไม่ติดลบ)
    const accruedInterest = Math.max(0, accruedFromPeriods - paidInterestAmount);
    
    // ดอกเบี้ยสะสมรวม = ดอกเบี้ยที่จ่ายแล้ว + ดอกเบี้ยค้างชำระ
    // นี่คือสูตรที่ถูกต้อง: Total = Paid + Outstanding
    const totalAccruedInterest = paidInterestAmount + accruedInterest;
    
    // ยอดปิดหนี้รวม = เงินต้นคงเหลือ + ดอกเบี้ยค้างชำระ
    const totalPayoffAmount = Math.round((effectiveRemainingDebt + accruedInterest) * 100) / 100;

    return {
      debtAmount: effectiveDebtAmount,
      paidDebtAmount: Number(stock.paidDebtAmount),
      paidInterestAmount,
      remainingDebt: effectiveRemainingDebt,
      totalAccruedInterest: Math.round(totalAccruedInterest * 100) / 100,
      accruedInterest: Math.round(accruedInterest * 100) / 100,
      totalPayoffAmount,
      debtStatus: effectiveDebtStatus,
      debtPaidOffDate: stock.debtPaidOffDate,
      paymentCount: paymentStats._count,
      lastPaymentDate: paymentStats._max.paymentDate,
      hasFinanceProvider,
      baseCost,
      totalCost,
      currentInterestRate,
      interestPrincipalBase: stock.interestPrincipalBase,
    };
  }

  /**
   * Get all stocks with outstanding debt
   */
  async getOutstandingDebts(params: {
    page?: number;
    limit?: number;
    search?: string;
  }): Promise<{ data: any[]; meta: any }> {
    const page = params.page || 1;
    const limit = params.limit || 20;
    const skip = (page - 1) * limit;

    const where: any = {
      debtStatus: 'ACTIVE',
      remainingDebt: { gt: 0 },
    };

    if (params.search) {
      where.OR = [
        { vin: { contains: params.search, mode: 'insensitive' } },
        { vehicleModel: { brand: { contains: params.search, mode: 'insensitive' } } },
        { vehicleModel: { model: { contains: params.search, mode: 'insensitive' } } },
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
          debtPayments: {
            orderBy: { paymentDate: 'desc' },
            take: 1,
          },
        },
        skip,
        take: limit,
        orderBy: { remainingDebt: 'desc' },
      }),
      db.stock.count({ where }),
    ]);

    const data = stocks.map((stock) => ({
      stockId: stock.id,
      vin: stock.vin,
      vehicleModel: stock.vehicleModel,
      exteriorColor: stock.exteriorColor,
      status: stock.status,
      debtAmount: Number(stock.debtAmount),
      paidDebtAmount: Number(stock.paidDebtAmount),
      remainingDebt: Number(stock.remainingDebt),
      debtStatus: stock.debtStatus,
      financeProvider: stock.financeProvider,
      lastPaymentDate: stock.debtPayments[0]?.paymentDate || null,
    }));

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
   * Get debt statistics
   */
  async getDebtStats(): Promise<{
    totalStocksWithDebt: number;
    totalDebtAmount: number;
    totalPaidAmount: number;
    totalRemainingDebt: number;
    paidOffCount: number;
  }> {
    const [activeDebtStats, paidOffCount] = await Promise.all([
      db.stock.aggregate({
        where: { debtStatus: 'ACTIVE' },
        _count: true,
        _sum: {
          debtAmount: true,
          paidDebtAmount: true,
          remainingDebt: true,
        },
      }),
      db.stock.count({ where: { debtStatus: 'PAID_OFF' } }),
    ]);

    return {
      totalStocksWithDebt: activeDebtStats._count,
      totalDebtAmount: Number(activeDebtStats._sum.debtAmount || 0),
      totalPaidAmount: Number(activeDebtStats._sum.paidDebtAmount || 0),
      totalRemainingDebt: Number(activeDebtStats._sum.remainingDebt || 0),
      paidOffCount,
    };
  }

  private async resolveBulkStocks(input: {
    stockIds?: string[];
    matchFilters?: InterestListFilters;
    excludeStockIds?: string[];
  }): Promise<BulkStockRef[]> {
    const excluded = input.excludeStockIds ?? [];
    const excludedSet = new Set(excluded);

    if (input.stockIds?.length) {
      const ids = input.stockIds.filter((id) => !excludedSet.has(id));
      assertBulkStockCount(ids.length);
      const stocks = await db.stock.findMany({
        where: { id: { in: ids }, deletedAt: null },
        select: { id: true, vin: true, stopInterestCalc: true, debtStatus: true },
      });
      const byId = new Map(stocks.map((s) => [s.id, s]));
      return ids.map((id) => {
        const found = byId.get(id);
        return found ?? { id, vin: '', stopInterestCalc: false, debtStatus: 'NO_DEBT' as DebtStatus };
      });
    }

    if (!input.matchFilters) {
      throw new BadRequestError('เลือกอย่างน้อยหนึ่งคัน หรือใช้ผลลัพธ์ที่กรองอยู่');
    }

    const baseWhere = buildInterestListWhere(input.matchFilters);
    const where: Prisma.StockWhereInput = excluded.length
      ? { AND: [baseWhere, { id: { notIn: excluded } }] }
      : baseWhere;

    const count = await db.stock.count({ where });
    assertBulkStockCount(count);

    return db.stock.findMany({
      where,
      select: { id: true, vin: true, stopInterestCalc: true, debtStatus: true },
      orderBy: { arrivalDate: 'desc' },
    });
  }

  async bulkStopInterest(
    input: {
      stockIds?: string[];
      matchFilters?: InterestListFilters;
      excludeStockIds?: string[];
      notes?: string;
      stopDate?: Date;
    },
    userId: string
  ): Promise<BulkInterestResult> {
    const stocks = await this.resolveBulkStocks(input);
    const result = emptyBulkResult();

    for (const stock of stocks) {
      if (!stock.vin) {
        pushBulkItem(result, { stockId: stock.id, status: 'skipped', reason: 'ไม่พบรถ' });
        continue;
      }
      const cls = classifyForStop(stock);
      if (cls !== 'apply') {
        pushBulkItem(result, { stockId: stock.id, vin: stock.vin, status: 'skipped', reason: cls });
        continue;
      }
      try {
        await this.stopInterestCalculation(stock.id, userId, input.notes, input.stopDate);
        pushBulkItem(result, { stockId: stock.id, vin: stock.vin, status: 'applied' });
      } catch (err) {
        pushBulkItem(result, {
          stockId: stock.id,
          vin: stock.vin,
          status: 'error',
          reason: err instanceof Error ? err.message : 'ไม่สามารถหยุดดอกเบี้ยได้',
        });
      }
    }

    return result;
  }

  async bulkApplyRate(
    input: {
      stockIds?: string[];
      matchFilters?: InterestListFilters;
      excludeStockIds?: string[];
      annualRate?: number;
      principalBase?: BulkPrincipalChoice;
      items?: { stockId: string; annualRate: number; principalBase?: BulkPrincipalChoice }[];
      effectiveDate?: Date;
      notes?: string;
    },
    userId: string
  ): Promise<BulkInterestResult> {
    if (input.annualRate == null && !input.items?.length) {
      throw new BadRequestError('กรุณาระบุอัตราดอกเบี้ย');
    }

    const stocks = await this.resolveBulkStocks(input);
    const result = emptyBulkResult();

    for (const stock of stocks) {
      if (!stock.vin) {
        pushBulkItem(result, { stockId: stock.id, status: 'skipped', reason: 'ไม่พบรถ' });
        continue;
      }
      const cls = classifyForApplyRate(stock);
      if (cls !== 'update' && cls !== 'resume') {
        pushBulkItem(result, { stockId: stock.id, vin: stock.vin, status: 'skipped', reason: cls });
        continue;
      }
      try {
        const annualRate = resolveBulkRate(stock.id, input.annualRate, input.items);
        const principalBase = resolveBulkPrincipalBase(
          stock.id,
          input.principalBase,
          input.items
        );
        if (cls === 'resume') {
          await this.resumeInterestCalculation(
            stock.id,
            {
              annualRate,
              principalBase,
              notes: input.notes,
              startDate: input.effectiveDate,
            },
            userId
          );
        } else {
          await this.updateInterestRate(
            stock.id,
            {
              annualRate,
              principalBase,
              notes: input.notes,
              effectiveDate: input.effectiveDate,
            },
            userId
          );
        }
        pushBulkItem(result, { stockId: stock.id, vin: stock.vin, status: 'applied' });
      } catch (err) {
        pushBulkItem(result, {
          stockId: stock.id,
          vin: stock.vin,
          status: 'error',
          reason: err instanceof Error ? err.message : 'ไม่สามารถตั้งดอกเบี้ยใหม่ได้',
        });
      }
    }

    return result;
  }
}

export const interestService = new InterestService();
