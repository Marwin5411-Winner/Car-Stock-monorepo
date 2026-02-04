import { db } from '../../lib/db';
import { CreateStockSchema, UpdateStockSchema, StockFilterSchema } from '@car-stock/shared/schemas';
import { authService } from '../auth/auth.service';
import { Decimal } from '@prisma/client/runtime/library';

export class StockService {
  /**
   * Calculate days in stock
   */
  private calculateDaysInStock(arrivalDate: Date): number {
    const today = new Date();
    const diffTime = Math.abs(today.getTime() - arrivalDate.getTime());
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }

  /**
   * Calculate accumulated interest
   */
  private calculateAccumulatedInterest(
    baseCost: number,
    transportCost: number,
    accessoryCost: number,
    otherCosts: number,
    interestRate: number,
    arrivalDate: Date,
    orderDate: Date | null,
    interestPrincipalBase: string,
    stopInterestCalc: boolean,
    interestStoppedAt: Date | null,
    debtStatus: string,
    soldDate?: Date | null,
    interestPeriods?: Array<{
      startDate: Date;
      endDate: Date | null;
      annualRate: number;
      principalAmount: number;
      calculatedInterest: number;
    }>
  ): number {
    const totalCost = baseCost + transportCost + accessoryCost + otherCosts;
    const principalAmount = interestPrincipalBase === 'BASE_COST_ONLY' ? baseCost : totalCost;
    const today = new Date();
    const activeEndDate = soldDate || today;
    const interestStartDate = orderDate || arrivalDate;
    const hasStopDate = stopInterestCalc && interestStoppedAt;
    const endDate = hasStopDate
      ? new Date(Math.min(activeEndDate.getTime(), interestStoppedAt!.getTime()))
      : activeEndDate;
    const canAccrueActiveInterest = debtStatus !== 'PAID_OFF' && !stopInterestCalc;

    if (interestPeriods && interestPeriods.length > 0) {
      let totalAccumulatedInterest = 0;

      interestPeriods.forEach((period) => {
        if (period.endDate) {
          totalAccumulatedInterest += Number(period.calculatedInterest);
          return;
        }

        if (!canAccrueActiveInterest) {
          return;
        }

        const days = Math.ceil(
          Math.abs(activeEndDate.getTime() - period.startDate.getTime()) / (1000 * 60 * 60 * 24)
        );
        const dailyRate = Number(period.annualRate) / 100 / 365;
        totalAccumulatedInterest += Number(period.principalAmount) * dailyRate * days;
      });

      return totalAccumulatedInterest;
    }

    const canAccrueInterest = debtStatus !== 'PAID_OFF' || hasStopDate;

    if (!canAccrueInterest) {
      return 0;
    }

    const days = Math.ceil(Math.abs(endDate.getTime() - interestStartDate.getTime()) / (1000 * 60 * 60 * 24));

    // Annual rate to daily rate (interestRate is decimal, e.g., 0.05 for 5%)
    const dailyRate = interestRate / 365;
    return principalAmount * dailyRate * days;
  }

  /**
   * Get all stock with pagination and filters
   */
  async getAllStock(params: any, currentUser: any) {
    // Check permission
    if (!authService.hasPermission(currentUser.role, 'STOCK_VIEW' as any)) {
      throw new Error('Insufficient permissions');
    }

    const validated = StockFilterSchema.parse(params);
    const skip = (validated.page - 1) * validated.limit;

    const where: any = {
      deletedAt: null, // Exclude soft deleted records
    };

    if (validated.search) {
      where.OR = [
        { vin: { contains: validated.search, mode: 'insensitive' } },
        { vehicleModel: { brand: { contains: validated.search, mode: 'insensitive' } } },
        { vehicleModel: { model: { contains: validated.search, mode: 'insensitive' } } },
        { exteriorColor: { contains: validated.search, mode: 'insensitive' } },
      ];
    }

    if (validated.status) {
      where.status = validated.status;
    }

    if (validated.vehicleModelId) {
      where.vehicleModelId = validated.vehicleModelId;
    }

    const [stocks, total] = await Promise.all([
      db.stock.findMany({
        where,
        select: {
          id: true,
          vin: true,
          engineNumber: true,
          vehicleModel: {
            select: {
              id: true,
              brand: true,
              model: true,
              variant: true,
              year: true,
            },
          },
          exteriorColor: true,
          interiorColor: true,
          status: true,
          parkingSlot: true,
          baseCost: true,
          transportCost: true,
          accessoryCost: true,
          otherCosts: true,
          interestRate: true,
          interestPrincipalBase: true,
          orderDate: true,
          stopInterestCalc: true,
          interestStoppedAt: true,
          debtStatus: true,
          soldDate: true,
          interestPeriods: {
            select: {
              startDate: true,
              endDate: true,
              annualRate: true,
              principalAmount: true,
              calculatedInterest: true,
            },
          },
          accumulatedInterest: true,
          expectedSalePrice: true,
          actualSalePrice: true,
          arrivalDate: true,
          createdAt: true,
        },
        skip,
        take: validated.limit,
        orderBy: { arrivalDate: 'desc' },
      }),
      db.stock.count({ where }),
    ]);

    const data = stocks.map((stock: any) => {
      const { interestPeriods, ...stockData } = stock;

      return {
        ...stockData,
        calculatedInterest: this.calculateAccumulatedInterest(
          Number(stock.baseCost),
          Number(stock.transportCost),
          Number(stock.accessoryCost),
          Number(stock.otherCosts),
          Number(stock.interestRate),
          stock.arrivalDate,
          stock.orderDate,
          stock.interestPrincipalBase,
          stock.stopInterestCalc,
          stock.interestStoppedAt,
          stock.debtStatus,
          stock.soldDate,
          interestPeriods
        ),
      };
    });

    return {
      data,
      meta: {
        total,
        page: validated.page,
        limit: validated.limit,
        totalPages: Math.ceil(total / validated.limit),
        hasNextPage: validated.page < Math.ceil(total / validated.limit),
        hasPrevPage: validated.page > 1,
      },
    };
  }

  /**
   * Get stock by ID
   */
  async getStockById(id: string, currentUser: any) {
    // Check permission
    if (!authService.hasPermission(currentUser.role, 'STOCK_VIEW' as any)) {
      throw new Error('Insufficient permissions');
    }

    const stock = await db.stock.findUnique({
      where: { id },
      select: {
        id: true,
        vin: true,
        engineNumber: true,
        motorNumber1: true,
        motorNumber2: true,
        vehicleModelId: true,
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
        exteriorColor: true,
        interiorColor: true,
        arrivalDate: true,
        orderDate: true,
        status: true,
        parkingSlot: true,
        baseCost: true,
        transportCost: true,
        accessoryCost: true,
        otherCosts: true,
        financeProvider: true,
        interestRate: true,
        interestPrincipalBase: true,
        accumulatedInterest: true,
        financePaymentDate: true,
        stopInterestCalc: true,
        interestStoppedAt: true,
        expectedSalePrice: true,
        actualSalePrice: true,
        soldDate: true,
        deliveryNotes: true,
        notes: true,
        createdAt: true,
        updatedAt: true,
        interestPeriods: {
          select: {
            startDate: true,
            endDate: true,
            annualRate: true,
            principalAmount: true,
            calculatedInterest: true,
          },
        },
        sale: {
          select: {
            id: true,
            saleNumber: true,
            customer: {
              select: {
                id: true,
                code: true,
                name: true,
              },
            },
            totalAmount: true,
            status: true,
            deliveryDate: true,
          },
        },
      },
    });

    if (!stock) {
      throw new Error('Stock not found');
    }

    // Calculate days in stock
    const daysInStock = this.calculateDaysInStock(stock.arrivalDate);

    // Recalculate accumulated interest
    const accumulatedInterest = this.calculateAccumulatedInterest(
      Number(stock.baseCost),
      Number(stock.transportCost),
      Number(stock.accessoryCost),
      Number(stock.otherCosts),
      Number(stock.interestRate),
      stock.arrivalDate,
      stock.orderDate,
      stock.interestPrincipalBase,
      stock.stopInterestCalc,
      stock.interestStoppedAt,
      stock.debtStatus,
      stock.soldDate,
      stock.interestPeriods
    );

    return {
      ...(() => {
        const { interestPeriods, ...rest } = stock;
        return rest;
      })(),
      daysInStock,
      calculatedInterest: accumulatedInterest,
    };
  }

  /**
   * Create new stock
   */
  async createStock(data: any, currentUser: any) {
    // Check permission
    if (!authService.hasPermission(currentUser.role, 'STOCK_CREATE' as any)) {
      throw new Error('Insufficient permissions');
    }

    const validated = CreateStockSchema.parse(data);

    // Check if VIN exists
    const existingStock = await db.stock.findUnique({
      where: { vin: validated.vin },
    });

    // Check if Engine Number exists
    const existingEngineNumber = await db.stock.findUnique({
      where: { engineNumber: validated.engineNumber },
    });

    if (existingEngineNumber) {
      throw new Error('Engine Number already exists');
    }

    if (existingStock) {
      throw new Error('VIN already exists');
    }

    // Check if vehicle model exists
    const vehicleModel = await db.vehicleModel.findUnique({
      where: { id: validated.vehicleModelId },
      select: { id: true },
    });

    if (!vehicleModel) {
      throw new Error('Vehicle model not found');
    }

    // Create stock - sanitize empty strings to null for unique optional fields
    const stockData = {
      ...validated,
      // Convert empty strings to null for unique fields to avoid constraint violations
      engineNumber: validated.engineNumber?.trim() || null,
      motorNumber1: validated.motorNumber1?.trim() || null,
      motorNumber2: validated.motorNumber2?.trim() || null,
    };

    const stock = await db.stock.create({
      data: stockData,
    });

    // Log activity
    await db.activityLog.create({
      data: {
        userId: currentUser.id,
        action: 'CREATE_STOCK',
        entity: 'STOCK',
        entityId: stock.id,
        details: {
          vin: stock.vin,
          vehicleModel: validated.vehicleModelId,
        },
      },
    });

    return stock;
  }

  /**
   * Update stock
   */
  async updateStock(id: string, data: any, currentUser: any) {
    // Check permission
    if (!authService.hasPermission(currentUser.role, 'STOCK_UPDATE' as any)) {
      throw new Error('Insufficient permissions');
    }

    const validated = UpdateStockSchema.parse(data);

    // Check if stock exists
    const existingStock = await db.stock.findUnique({
      where: { id },
      select: { id: true, status: true },
    });

    if (!existingStock) {
      throw new Error('Stock not found');
    }

    // Cannot update sold stock
    if (existingStock.status === 'SOLD') {
      throw new Error('Cannot update sold stock');
    }

    // Sanitize empty strings to null for unique optional fields
    const updateData = {
      ...validated,
      // Only sanitize if the field is being updated
      ...(validated.engineNumber !== undefined && { engineNumber: validated.engineNumber?.trim() || null }),
      ...(validated.motorNumber1 !== undefined && { motorNumber1: validated.motorNumber1?.trim() || null }),
      ...(validated.motorNumber2 !== undefined && { motorNumber2: validated.motorNumber2?.trim() || null }),
    };

    // Update stock
    const stock = await db.stock.update({
      where: { id },
      data: updateData,
    });

    // Log activity
    await db.activityLog.create({
      data: {
        userId: currentUser.id,
        action: 'UPDATE_STOCK',
        entity: 'STOCK',
        entityId: stock.id,
        details: {
          vin: stock.vin,
          changes: validated,
        },
      },
    });

    return stock;
  }

  /**
   * Update stock status
   */
  async updateStockStatus(id: string, status: any, notes: string | undefined, currentUser: any) {
    // Check permission
    if (!authService.hasPermission(currentUser.role, 'STOCK_UPDATE' as any)) {
      throw new Error('Insufficient permissions');
    }

    // Check if stock exists
    const existingStock = await db.stock.findUnique({
      where: { id },
      select: { id: true, status: true },
    });

    if (!existingStock) {
      throw new Error('Stock not found');
    }

    // Update status
    const stock = await db.stock.update({
      where: { id },
      data: {
        status,
        notes: notes || undefined,
      },
    });

    // Log activity
    await db.activityLog.create({
      data: {
        userId: currentUser.id,
        action: 'UPDATE_STOCK_STATUS',
        entity: 'STOCK',
        entityId: stock.id,
        details: {
          vin: stock.vin,
          fromStatus: existingStock.status,
          toStatus: status,
          notes,
        },
      },
    });

    return stock;
  }

  /**
   * Recalculate interest for a stock item
   */
  async recalculateInterest(id: string, currentUser: any) {
    // Check permission
    if (!authService.hasPermission(currentUser.role, 'STOCK_UPDATE' as any)) {
      throw new Error('Insufficient permissions');
    }

    const stock = await db.stock.findUnique({
      where: { id },
      include: {
        interestPeriods: {
          select: {
            startDate: true,
            endDate: true,
            annualRate: true,
            principalAmount: true,
            calculatedInterest: true,
          },
        },
      },
    });

    if (!stock) {
      throw new Error('Stock not found');
    }

    // Calculate accumulated interest
    const accumulatedInterest = this.calculateAccumulatedInterest(
      Number(stock.baseCost),
      Number(stock.transportCost),
      Number(stock.accessoryCost),
      Number(stock.otherCosts),
      Number(stock.interestRate),
      stock.arrivalDate,
      stock.orderDate,
      stock.interestPrincipalBase,
      stock.stopInterestCalc,
      stock.interestStoppedAt,
      stock.debtStatus,
      stock.soldDate,
      stock.interestPeriods
    );

    // Update accumulated interest
    const updatedStock = await db.stock.update({
      where: { id },
      data: {
        accumulatedInterest: new Decimal(accumulatedInterest),
      },
    });

    // Log activity
    await db.activityLog.create({
      data: {
        userId: currentUser.id,
        action: 'RECALCULATE_INTEREST',
        entity: 'STOCK',
        entityId: stock.id,
        details: {
          vin: stock.vin,
          accumulatedInterest,
        },
      },
    });

    return updatedStock;
  }

  /**
   * Delete stock
   */
  async deleteStock(id: string, currentUser: any) {
    // Check permission
    if (!authService.hasPermission(currentUser.role, 'STOCK_DELETE' as any)) {
      throw new Error('Insufficient permissions');
    }

    // Check if stock exists
    const existingStock = await db.stock.findUnique({
      where: { id },
      select: { id: true, status: true },
    });

    if (!existingStock) {
      throw new Error('Stock not found');
    }

    // Cannot delete sold stock
    if (existingStock.status === 'SOLD') {
      throw new Error('Cannot delete sold stock');
    }

    // Get stock for logging
    const stock = await db.stock.findUnique({
      where: { id },
      select: { vin: true },
    });

    // Soft delete stock (set deletedAt)
    await db.stock.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    // Log activity
    await db.activityLog.create({
      data: {
        userId: currentUser.id,
        action: 'DELETE_STOCK',
        entity: 'STOCK',
        entityId: id,
        details: {
          vin: stock?.vin,
        },
      },
    });

    return { success: true, message: 'Stock deleted successfully' };
  }

  /**
   * Get available stock for sales
   */
  async getAvailableStock() {
    const stocks = await db.stock.findMany({
      where: {
        status: 'AVAILABLE',
        deletedAt: null, // Exclude soft deleted records
      },
      select: {
        id: true,
        vin: true,
        exteriorColor: true,
        interiorColor: true,
        arrivalDate: true,
        expectedSalePrice: true,
        vehicleModel: {
          select: {
            id: true,
            brand: true,
            model: true,
            variant: true,
            year: true,
            type: true,
            price: true,
          },
        },
      },
      orderBy: { arrivalDate: 'desc' },
    });

    return stocks;
  }

  /**
   * Get stock statistics
   */
  async getStockStats(currentUser: any) {
    // Check permission
    if (!authService.hasPermission(currentUser.role, 'STOCK_VIEW' as any)) {
      throw new Error('Insufficient permissions');
    }

<<<<<<< /Users/marwinropmuang/Documents/NexmindIT/Car-Stock-monorepo/apps/api/src/modules/stock/stock.service.ts
    const [totalStock, availableStock, reservedStock, preparingStock, soldStock] = await Promise.all([
      db.stock.count({ where: { deletedAt: null } }),
      db.stock.count({ where: { status: 'AVAILABLE', deletedAt: null } }),
      db.stock.count({ where: { status: 'RESERVED', deletedAt: null } }),
      db.stock.count({ where: { status: 'PREPARING', deletedAt: null } }),
      db.stock.count({ where: { status: 'SOLD', deletedAt: null } }),
    ]);

    // Calculate total stock value (for available stock only)
    const stockValue = await db.stock.aggregate({
      where: { status: 'AVAILABLE', deletedAt: null },
      _sum: {
        baseCost: true,
        transportCost: true,
        accessoryCost: true,
        otherCosts: true,
        accumulatedInterest: true,
=======
    const [
      totalStock,
      availableStock,
      reservedStock,
      preparingStock,
      soldStock,
      availableStocks,
    ] = await Promise.all([
      db.stock.count(),
      db.stock.count({ where: { status: 'AVAILABLE' } }),
      db.stock.count({ where: { status: 'RESERVED' } }),
      db.stock.count({ where: { status: 'PREPARING' } }),
      db.stock.count({ where: { status: 'SOLD' } }),
      db.stock.findMany({
        where: { status: 'AVAILABLE' },
        select: {
          baseCost: true,
          transportCost: true,
          accessoryCost: true,
          otherCosts: true,
          interestRate: true,
          arrivalDate: true,
          orderDate: true,
          interestPrincipalBase: true,
          stopInterestCalc: true,
          interestStoppedAt: true,
          debtStatus: true,
          soldDate: true,
          financeProvider: true,
          interestPeriods: {
            select: {
              startDate: true,
              endDate: true,
              annualRate: true,
              principalAmount: true,
              calculatedInterest: true,
            },
          },
        },
      }),
    ]);

    const totalValue = availableStocks.reduce(
      (sum: number, stock: (typeof availableStocks)[number]) => {
        const baseCost = Number(stock.baseCost || 0);
        const transportCost = Number(stock.transportCost || 0);
        const accessoryCost = Number(stock.accessoryCost || 0);
        const otherCosts = Number(stock.otherCosts || 0);
        const costWithoutInterest = baseCost + transportCost + accessoryCost + otherCosts;
        const accumulatedInterest = stock.financeProvider
          ? this.calculateAccumulatedInterest(
              baseCost,
              transportCost,
              accessoryCost,
              otherCosts,
              Number(stock.interestRate || 0),
              stock.arrivalDate,
              stock.orderDate,
              stock.interestPrincipalBase,
              stock.stopInterestCalc,
              stock.interestStoppedAt,
              stock.debtStatus,
              stock.soldDate,
              stock.interestPeriods
            )
          : 0;

        return sum + costWithoutInterest + accumulatedInterest;
>>>>>>> /Users/marwinropmuang/.windsurf/worktrees/Car-Stock-monorepo/Car-Stock-monorepo-865a4b20/apps/api/src/modules/stock/stock.service.ts
      },
      0
    );

    return {
      totalStock,
      availableStock,
      reservedStock,
      preparingStock,
      soldStock,
      totalValue,
    };
  }
}

export const stockService = new StockService();
