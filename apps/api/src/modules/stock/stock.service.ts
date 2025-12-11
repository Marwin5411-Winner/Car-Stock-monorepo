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
    stopInterestCalc: boolean,
    interestStoppedAt: Date | null
  ): number {
    const totalCost = baseCost + transportCost + accessoryCost + otherCosts;
    const today = new Date();
    const endDate = stopInterestCalc && interestStoppedAt ? interestStoppedAt : today;
    const days = Math.abs(endDate.getTime() - arrivalDate.getTime()) / (1000 * 60 * 60 * 24);

    // Annual rate to daily rate (interestRate is decimal, e.g., 0.05 for 5%)
    const dailyRate = interestRate / 365;
    return totalCost * dailyRate * days;
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

    const where: any = {};

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

    return {
      data: stocks,
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
      stock.stopInterestCalc,
      stock.interestStoppedAt
    );

    return {
      ...stock,
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

    // Create stock
    const stock = await db.stock.create({
      data: {
        ...validated,
      },
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

    // Update stock
    const stock = await db.stock.update({
      where: { id },
      data: validated,
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
      stock.stopInterestCalc,
      stock.interestStoppedAt
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

    // Delete stock
    await db.stock.delete({
      where: { id },
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

    const [totalStock, availableStock, reservedStock, preparingStock, soldStock] = await Promise.all([
      db.stock.count(),
      db.stock.count({ where: { status: 'AVAILABLE' } }),
      db.stock.count({ where: { status: 'RESERVED' } }),
      db.stock.count({ where: { status: 'PREPARING' } }),
      db.stock.count({ where: { status: 'SOLD' } }),
    ]);

    // Calculate total stock value (for available stock only)
    const stockValue = await db.stock.aggregate({
      where: { status: 'AVAILABLE' },
      _sum: {
        baseCost: true,
        transportCost: true,
        accessoryCost: true,
        otherCosts: true,
        accumulatedInterest: true,
      },
    });

    const totalValue = Number(stockValue._sum.baseCost || 0) +
      Number(stockValue._sum.transportCost || 0) +
      Number(stockValue._sum.accessoryCost || 0) +
      Number(stockValue._sum.otherCosts || 0) +
      Number(stockValue._sum.accumulatedInterest || 0);

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
