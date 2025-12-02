import { db } from '../../lib/db';
import { CreateSaleSchema, UpdateSaleSchema, SaleFilterSchema } from '@car-stock/shared/schemas';
import { NUMBER_PREFIXES } from '@car-stock/shared/constants';
import { authService } from '../auth/auth.service';
import { Decimal } from '@prisma/client/runtime/library';

export class SalesService {
  /**
   * Generate sale number
   */
  private async generateSaleNumber(): Promise<string> {
    const currentYear = new Date().getFullYear();
    const prefix = NUMBER_PREFIXES.SALE;

    // Get or create number sequence
    let sequence = await db.numberSequence.findFirst({
      where: {
        prefix: prefix,
        year: currentYear,
      },
    });

    if (!sequence) {
      sequence = await db.numberSequence.create({
        data: {
          prefix: prefix,
          year: currentYear,
          lastNumber: 0,
        },
      });
    }

    // Increment and get next number
    const nextNumber = sequence.lastNumber + 1;
    await db.numberSequence.update({
      where: { id: sequence.id },
      data: { lastNumber: nextNumber },
    });

    // Format: SL-YYYY-XXXX
    return `${prefix}-${currentYear}-${nextNumber.toString().padStart(4, '0')}`;
  }

  /**
   * Get all sales with pagination and filters
   */
  async getAllSales(params: any, currentUser: any) {
    // Check permission
    if (!authService.hasPermission(currentUser.role, 'SALE_VIEW' as any)) {
      throw new Error('Insufficient permissions');
    }

    const validated = SaleFilterSchema.parse(params);
    const skip = (validated.page - 1) * validated.limit;

    const where: any = {};

    if (validated.search) {
      where.OR = [
        { saleNumber: { contains: validated.search, mode: 'insensitive' } },
        { customer: { name: { contains: validated.search, mode: 'insensitive' } } },
        { customer: { code: { contains: validated.search, mode: 'insensitive' } } },
      ];
    }

    if (validated.status) {
      where.status = validated.status;
    }

    if (validated.type) {
      where.type = validated.type;
    }

    if (validated.customerId) {
      where.customerId = validated.customerId;
    }

    if (validated.createdById) {
      where.createdById = validated.createdById;
    }

    const [sales, total] = await Promise.all([
      db.sale.findMany({
        where,
        select: {
          id: true,
          saleNumber: true,
          type: true,
          status: true,
          totalAmount: true,
          depositAmount: true,
          paidAmount: true,
          remainingAmount: true,
          reservedDate: true,
          deliveryDate: true,
          customer: {
            select: {
              id: true,
              code: true,
              name: true,
              type: true,
            },
          },
          stock: {
            select: {
              id: true,
              vin: true,
              vehicleModel: {
                select: {
                  brand: true,
                  model: true,
                  variant: true,
                },
              },
            },
          },
          vehicleModel: {
            select: {
              brand: true,
              model: true,
              variant: true,
            },
          },
          createdAt: true,
        },
        skip,
        take: validated.limit,
        orderBy: { createdAt: 'desc' },
      }),
      db.sale.count({ where }),
    ]);

    return {
      data: sales,
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
   * Get sale by ID
   */
  async getSaleById(id: string, currentUser: any) {
    // Check permission
    if (!authService.hasPermission(currentUser.role, 'SALE_VIEW' as any)) {
      throw new Error('Insufficient permissions');
    }

    const sale = await db.sale.findUnique({
      where: { id },
      include: {
        customer: true,
        stock: {
          include: {
            vehicleModel: true,
          },
        },
        vehicleModel: true,
        campaign: {
          select: {
            id: true,
            name: true,
            description: true,
          },
        },
        createdBy: {
          select: {
            id: true,
            username: true,
            firstName: true,
            lastName: true,
          },
        },
        payments: {
          select: {
            id: true,
            receiptNumber: true,
            amount: true,
            paymentDate: true,
            paymentType: true,
            paymentMethod: true,
            status: true,
          },
          orderBy: { paymentDate: 'desc' },
        },
        quotation: {
          select: {
            id: true,
            quotationNumber: true,
            version: true,
            quotedPrice: true,
            status: true,
            validUntil: true,
            createdAt: true,
          },
        },
        history: {
          select: {
            id: true,
            action: true,
            fromStatus: true,
            toStatus: true,
            notes: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!sale) {
      throw new Error('Sale not found');
    }

    return sale;
  }

  /**
   * Create new sale
   */
  async createSale(data: any, currentUser: any) {
    // Check permission
    if (!authService.hasPermission(currentUser.role, 'SALE_CREATE' as any)) {
      throw new Error('Insufficient permissions');
    }

    const validated = CreateSaleSchema.parse(data);

    // Check if customer exists
    const customer = await db.customer.findUnique({
      where: { id: validated.customerId },
      select: { id: true },
    });

    if (!customer) {
      throw new Error('Customer not found');
    }

    // Check if stock exists (if provided)
    if (validated.stockId) {
      const stock = await db.stock.findUnique({
        where: { id: validated.stockId },
        select: { id: true, status: true },
      });

      if (!stock) {
        throw new Error('Stock not found');
      }

      if (stock.status !== 'AVAILABLE') {
        throw new Error('Stock is not available');
      }
    }

    // Check if vehicle model exists (if provided)
    if (validated.vehicleModelId) {
      const vehicleModel = await db.vehicleModel.findUnique({
        where: { id: validated.vehicleModelId },
        select: { id: true },
      });

      if (!vehicleModel) {
        throw new Error('Vehicle model not found');
      }
    }

    // Check if campaign exists (if provided)
    if (validated.campaignId) {
      const campaign = await db.campaign.findUnique({
        where: { id: validated.campaignId },
        select: { id: true, status: true },
      });

      if (!campaign) {
        throw new Error('Campaign not found');
      }

      if (campaign.status !== 'ACTIVE') {
        throw new Error('Campaign is not active');
      }
    }

    // Generate sale number
    const saleNumber = await this.generateSaleNumber();

    // Calculate remaining amount
    const remainingAmount = validated.totalAmount - (validated.depositAmount || 0);

    // Create sale
    const sale = await db.sale.create({
      data: {
        ...validated,
        saleNumber,
        remainingAmount,
        createdById: currentUser.id,
      },
    });

    // If stock is provided, reserve it
    if (validated.stockId) {
      await db.stock.update({
        where: { id: validated.stockId },
        data: {
          status: 'RESERVED',
          reservedDate: new Date(),
        },
      });
    }

    // Create history record
    await db.saleHistory.create({
      data: {
        saleId: sale.id,
        action: 'CREATE_SALE',
        fromStatus: null,
        toStatus: sale.status,
        notes: 'Sale created',
        createdById: currentUser.id,
      },
    });

    // Log activity
    await db.activityLog.create({
      data: {
        userId: currentUser.id,
        action: 'CREATE_SALE',
        entity: 'SALE',
        entityId: sale.id,
        details: {
          saleNumber: sale.saleNumber,
          customerId: sale.customerId,
          totalAmount: sale.totalAmount,
        },
      },
    });

    return sale;
  }

  /**
   * Update sale
   */
  async updateSale(id: string, data: any, currentUser: any) {
    // Check permission
    if (!authService.hasPermission(currentUser.role, 'SALE_UPDATE' as any)) {
      throw new Error('Insufficient permissions');
    }

    const validated = UpdateSaleSchema.parse(data);

    // Check if sale exists
    const existingSale = await db.sale.findUnique({
      where: { id },
      select: { id: true, status: true, stockId: true },
    });

    if (!existingSale) {
      throw new Error('Sale not found');
    }

    // Cannot update completed or cancelled sale
    if (existingSale.status === 'COMPLETED' || existingSale.status === 'CANCELLED') {
      throw new Error(`Cannot update ${existingSale.status.toLowerCase()} sale`);
    }

    // Recalculate remaining amount if total or deposit changed
    if (validated.totalAmount !== undefined || validated.depositAmount !== undefined) {
      const currentSale = await db.sale.findUnique({
        where: { id },
        select: { totalAmount: true, depositAmount: true },
      });

      const newTotal = validated.totalAmount !== undefined ? validated.totalAmount : currentSale!.totalAmount;
      const newDeposit = validated.depositAmount !== undefined ? validated.depositAmount : currentSale!.depositAmount;

      validated.remainingAmount = newTotal - newDeposit;
    }

    // Update sale
    const sale = await db.sale.update({
      where: { id },
      data: validated,
    });

    // Log activity
    await db.activityLog.create({
      data: {
        userId: currentUser.id,
        action: 'UPDATE_SALE',
        entity: 'SALE',
        entityId: sale.id,
        details: {
          saleNumber: sale.saleNumber,
          changes: validated,
        },
      },
    });

    return sale;
  }

  /**
   * Update sale status
   */
  async updateSaleStatus(id: string, status: any, notes: string | undefined, currentUser: any) {
    // Check permission
    if (!authService.hasPermission(currentUser.role, 'SALE_UPDATE' as any)) {
      throw new Error('Insufficient permissions');
    }

    // Check if sale exists
    const existingSale = await db.sale.findUnique({
      where: { id },
      select: { id: true, status: true, stockId: true },
    });

    if (!existingSale) {
      throw new Error('Sale not found');
    }

    // Cannot change status of cancelled sale
    if (existingSale.status === 'CANCELLED') {
      throw new Error('Cannot change status of cancelled sale');
    }

    // Handle status transitions
    const updateData: any = {
      status,
      notes: notes || undefined,
    };

    // Set specific dates based on status
    if (status === 'RESERVED' && !existingSale.reservedDate) {
      updateData.reservedDate = new Date();
    }

    if (status === 'DELIVERED') {
      updateData.deliveryDate = new Date();
    }

    if (status === 'COMPLETED') {
      updateData.completedDate = new Date();
    }

    // Update sale
    const sale = await db.sale.update({
      where: { id },
      data: updateData,
    });

    // Handle stock status changes
    if (existingSale.stockId) {
      if (status === 'PREPARING') {
        await db.stock.update({
          where: { id: existingSale.stockId },
          data: {
            status: 'PREPARING',
          },
        });
      } else if (status === 'DELIVERED' || status === 'COMPLETED') {
        await db.stock.update({
          where: { id: existingSale.stockId },
          data: {
            status: 'SOLD',
            soldDate: new Date(),
            actualSalePrice: sale.totalAmount,
          },
        });
      } else if (status === 'CANCELLED') {
        await db.stock.update({
          where: { id: existingSale.stockId },
          data: {
            status: 'AVAILABLE',
          },
        });
      }
    }

    // Create history record
    await db.saleHistory.create({
      data: {
        saleId: sale.id,
        action: 'UPDATE_STATUS',
        fromStatus: existingSale.status,
        toStatus: status,
        notes: notes,
        createdById: currentUser.id,
      },
    });

    // Log activity
    await db.activityLog.create({
      data: {
        userId: currentUser.id,
        action: 'UPDATE_SALE_STATUS',
        entity: 'SALE',
        entityId: sale.id,
        details: {
          saleNumber: sale.saleNumber,
          fromStatus: existingSale.status,
          toStatus: status,
          notes,
        },
      },
    });

    return sale;
  }

  /**
   * Delete sale
   */
  async deleteSale(id: string, currentUser: any) {
    // Check permission
    if (!authService.hasPermission(currentUser.role, 'SALE_DELETE' as any)) {
      throw new Error('Insufficient permissions');
    }

    // Check if sale exists
    const existingSale = await db.sale.findUnique({
      where: { id },
      select: { id: true, status: true, stockId: true },
    });

    if (!existingSale) {
      throw new Error('Sale not found');
    }

    // Cannot delete completed or cancelled sale
    if (existingSale.status === 'COMPLETED' || existingSale.status === 'CANCELLED') {
      throw new Error(`Cannot delete ${existingSale.status.toLowerCase()} sale`);
    }

    // Get sale for logging
    const sale = await db.sale.findUnique({
      where: { id },
      select: { saleNumber: true },
    });

    // Release stock if reserved
    if (existingSale.stockId) {
      await db.stock.update({
        where: { id: existingSale.stockId },
        data: {
          status: 'AVAILABLE',
        },
      });
    }

    // Delete sale
    await db.sale.delete({
      where: { id },
    });

    // Log activity
    await db.activityLog.create({
      data: {
        userId: currentUser.id,
        action: 'DELETE_SALE',
        entity: 'SALE',
        entityId: id,
        details: {
          saleNumber: sale?.saleNumber,
        },
      },
    });

    return { success: true, message: 'Sale deleted successfully' };
  }

  /**
   * Assign or change stock for a sale
   */
  async assignStock(saleId: string, stockId: string, currentUser: any) {
    // Check permission
    if (!authService.hasPermission(currentUser.role, 'SALE_UPDATE' as any)) {
      throw new Error('Insufficient permissions');
    }

    // Check if sale exists
    const existingSale = await db.sale.findUnique({
      where: { id: saleId },
      select: { 
        id: true, 
        saleNumber: true,
        status: true, 
        stockId: true,
        vehicleModelId: true,
      },
    });

    if (!existingSale) {
      throw new Error('Sale not found');
    }

    // Cannot assign stock to delivered, completed or cancelled sale
    if (['DELIVERED', 'COMPLETED', 'CANCELLED'].includes(existingSale.status)) {
      throw new Error(`Cannot assign stock to ${existingSale.status.toLowerCase()} sale`);
    }

    // Check if new stock exists and is available
    const newStock = await db.stock.findUnique({
      where: { id: stockId },
      select: { id: true, status: true, vehicleModelId: true },
    });

    if (!newStock) {
      throw new Error('Stock not found');
    }

    if (newStock.status !== 'AVAILABLE') {
      throw new Error('Stock is not available');
    }

    // Optionally validate that stock matches the vehicle model preference
    if (existingSale.vehicleModelId && newStock.vehicleModelId !== existingSale.vehicleModelId) {
      // This is a warning, not an error - allow assignment but log it
      console.warn(`Stock vehicle model (${newStock.vehicleModelId}) does not match sale preference (${existingSale.vehicleModelId})`);
    }

    // Determine stock status based on sale status
    const stockStatus = existingSale.status === 'PREPARING' ? 'PREPARING' : 'RESERVED';

    // Use transaction to ensure atomicity
    const result = await db.$transaction(async (tx) => {
      // Release old stock if exists
      if (existingSale.stockId && existingSale.stockId !== stockId) {
        await tx.stock.update({
          where: { id: existingSale.stockId },
          data: {
            status: 'AVAILABLE',
          },
        });
      }

      // Assign new stock to sale
      const sale = await tx.sale.update({
        where: { id: saleId },
        data: {
          stockId: stockId,
        },
      });

      // Update new stock status
      await tx.stock.update({
        where: { id: stockId },
        data: {
          status: stockStatus,
        },
      });

      // Create history record
      await tx.saleHistory.create({
        data: {
          saleId: sale.id,
          action: existingSale.stockId ? 'CHANGE_STOCK' : 'ASSIGN_STOCK',
          fromStatus: existingSale.status,
          toStatus: existingSale.status,
          notes: existingSale.stockId 
            ? `Changed stock from ${existingSale.stockId} to ${stockId}` 
            : `Assigned stock ${stockId}`,
          createdById: currentUser.id,
        },
      });

      return sale;
    });

    // Log activity
    await db.activityLog.create({
      data: {
        userId: currentUser.id,
        action: existingSale.stockId ? 'CHANGE_STOCK' : 'ASSIGN_STOCK',
        entity: 'SALE',
        entityId: saleId,
        details: {
          saleNumber: existingSale.saleNumber,
          oldStockId: existingSale.stockId,
          newStockId: stockId,
        },
      },
    });

    // Return full sale with stock info
    return await this.getSaleById(saleId, currentUser);
  }

  /**
   * Get sales statistics
   */
  async getSalesStats(currentUser: any) {
    // Check permission
    if (!authService.hasPermission(currentUser.role, 'SALE_VIEW' as any)) {
      throw new Error('Insufficient permissions');
    }

    // Updated: Removed INQUIRY and QUOTED counts - now handled by Quotation module
    const [totalSales, reservedSales, preparingSales, deliveredSales, completedSales, cancelledSales] = await Promise.all([
      db.sale.count(),
      db.sale.count({ where: { status: 'RESERVED' } }),
      db.sale.count({ where: { status: 'PREPARING' } }),
      db.sale.count({ where: { status: 'DELIVERED' } }),
      db.sale.count({ where: { status: 'COMPLETED' } }),
      db.sale.count({ where: { status: 'CANCELLED' } }),
    ]);

    // Calculate revenue (total amount of completed sales)
    const revenueResult = await db.sale.aggregate({
      where: { status: 'COMPLETED' },
      _sum: {
        totalAmount: true,
      },
    });

    // Calculate total paid amount
    const paidResult = await db.sale.aggregate({
      _sum: {
        paidAmount: true,
      },
    });

    // Calculate remaining amount
    const remainingResult = await db.sale.aggregate({
      where: {
        status: {
          notIn: ['COMPLETED', 'CANCELLED'],
        },
      },
      _sum: {
        remainingAmount: true,
      },
    });

    const totalRevenue = Number(revenueResult._sum.totalAmount || 0);
    const totalPaid = Number(paidResult._sum.paidAmount || 0);
    const totalRemaining = Number(remainingResult._sum.remainingAmount || 0);

    return {
      totalSales,
      reservedSales,
      preparingSales,
      deliveredSales,
      completedSales,
      cancelledSales,
      totalRevenue,
      totalPaid,
      totalRemaining,
    };
  }
}

export const salesService = new SalesService();
