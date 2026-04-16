import { db } from '../../lib/db';
import { CreateSaleSchema, UpdateSaleSchema, SaleFilterSchema } from '@car-stock/shared/schemas';
import { NUMBER_PREFIXES } from '@car-stock/shared/constants';
import { authService } from '../auth/auth.service';
import { Decimal } from '@prisma/client/runtime/library';
import { NotFoundError, ForbiddenError, BadRequestError, ConflictError } from '../../lib/errors';

const toNumber = (val: Decimal | number | null | undefined): number => {
  if (val === null || val === undefined) return 0;
  if (typeof val === 'number') return val;
  return Number(val);
};

const toNumberOrNull = (val: Decimal | number | null | undefined): number | null => {
  if (val === null || val === undefined) return null;
  if (typeof val === 'number') return val;
  return Number(val);
};

/**
 * Convert Prisma Decimal fields to plain numbers for JSON serialization
 */
function serializeSale(sale: any): any {
  return {
    ...sale,
    totalAmount: toNumber(sale.totalAmount),
    depositAmount: toNumber(sale.depositAmount),
    paidAmount: toNumber(sale.paidAmount),
    remainingAmount: toNumber(sale.remainingAmount),
    downPayment: toNumberOrNull(sale.downPayment),
    financeAmount: toNumberOrNull(sale.financeAmount),
    carDiscount: toNumberOrNull(sale.carDiscount),
    downPaymentDiscount: toNumberOrNull(sale.downPaymentDiscount),
    interestRate: toNumberOrNull(sale.interestRate),
    monthlyInstallment: toNumberOrNull(sale.monthlyInstallment),
    discountSnapshot: toNumberOrNull(sale.discountSnapshot),
    refundAmount: toNumberOrNull(sale.refundAmount),
    ...(sale.stock?.vehicleModel?.price != null && {
      stock: {
        ...sale.stock,
        vehicleModel: {
          ...sale.stock.vehicleModel,
          price: toNumber(sale.stock.vehicleModel.price),
        },
      },
    }),
    ...(sale.payments && {
      payments: sale.payments.map((p: any) => ({
        ...p,
        amount: toNumber(p.amount),
      })),
    }),
    ...(sale.quotation && {
      quotation: {
        ...sale.quotation,
        quotedPrice: toNumber(sale.quotation.quotedPrice),
        finalPrice: toNumber(sale.quotation.finalPrice),
        discountAmount: toNumberOrNull(sale.quotation.discountAmount),
      },
    }),
  };
}

export class SalesService {
  /**
   * Generate sale number
   */
  private async generateSaleNumber(): Promise<string> {
    const currentYear = new Date().getFullYear();
    const prefix = NUMBER_PREFIXES.SALE;

    // Atomic read-modify-write inside a serializable transaction prevents the
    // concurrent-find-then-update race that produces duplicate sale numbers.
    // We can't use Prisma's compound-key upsert here because the existing year-
    // only sequences have `month: null`, which isn't addressable via the
    // `prefix_year_month` unique selector.
    const nextNumber = await db.$transaction(
      async (tx) => {
        const updated = await tx.numberSequence.updateMany({
          where: { prefix, year: currentYear, month: null },
          data: { lastNumber: { increment: 1 } },
        });

        if (updated.count > 0) {
          const sequence = await tx.numberSequence.findFirst({
            where: { prefix, year: currentYear, month: null },
            select: { lastNumber: true },
          });
          return sequence!.lastNumber;
        }

        const created = await tx.numberSequence.create({
          data: { prefix, year: currentYear, lastNumber: 1 },
          select: { lastNumber: true },
        });
        return created.lastNumber;
      },
      { isolationLevel: 'Serializable' }
    );

    // Format: SL-YYYY-XXXX
    return `${prefix}-${currentYear}-${nextNumber.toString().padStart(4, '0')}`;
  }

  /**
   * Get all sales with pagination and filters
   */
  async getAllSales(params: any, currentUser: any) {
    // Check permission
    if (!authService.hasPermission(currentUser.role, 'SALE_VIEW')) {
      throw new ForbiddenError();
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
      data: sales.map(serializeSale),
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
    if (!authService.hasPermission(currentUser.role, 'SALE_VIEW')) {
      throw new ForbiddenError();
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
      throw new NotFoundError('Sale');
    }

    return serializeSale(sale);
  }

  /**
   * Create new sale
   */
  async createSale(data: any, currentUser: any) {
    // Check permission
    if (!authService.hasPermission(currentUser.role, 'SALE_CREATE')) {
      throw new ForbiddenError();
    }

    const validated = CreateSaleSchema.parse(data);

    // Check if customer exists
    const customer = await db.customer.findUnique({
      where: { id: validated.customerId },
      select: { id: true },
    });

    if (!customer) {
      throw new NotFoundError('Customer');
    }

    // Check if stock exists (if provided) — filter soft-deleted
    if (validated.stockId) {
      const stock = await db.stock.findFirst({
        where: { id: validated.stockId, deletedAt: null },
        select: { id: true, status: true },
      });

      if (!stock) {
        throw new NotFoundError('Stock');
      }

      if (stock.status === 'DEMO') {
        throw new BadRequestError('รถ Demo ไม่สามารถขายได้');
      }
      if (stock.status !== 'AVAILABLE') {
        throw new BadRequestError('Stock is not available');
      }
    }

    // Check if vehicle model exists (if provided)
    if (validated.vehicleModelId) {
      const vehicleModel = await db.vehicleModel.findUnique({
        where: { id: validated.vehicleModelId },
        select: { id: true },
      });

      if (!vehicleModel) {
        throw new NotFoundError('Vehicle model');
      }
    }

    // Check if campaign exists (if provided)
    if (validated.campaignId) {
      const campaign = await db.campaign.findUnique({
        where: { id: validated.campaignId },
        select: { id: true, status: true },
      });

      if (!campaign) {
        throw new NotFoundError('Campaign');
      }

      if (campaign.status !== 'ACTIVE') {
        throw new BadRequestError('Campaign is not active');
      }
    }

    // Generate sale number
    const saleNumber = await this.generateSaleNumber();

    // Calculate remaining amount
    const remainingAmount = validated.totalAmount - (validated.depositAmount || 0);

    // Create sale + reserve stock + history + activity log in transaction
    const sale = await db.$transaction(async (tx) => {
      const created = await tx.sale.create({
        data: {
          ...validated,
          saleNumber,
          remainingAmount,
          createdById: currentUser.id,
        },
      });

      // If stock is provided, reserve it
      if (validated.stockId) {
        await tx.stock.update({
          where: { id: validated.stockId },
          data: { status: 'RESERVED' },
        });
      }

      await tx.saleHistory.create({
        data: {
          saleId: created.id,
          action: 'CREATE_SALE',
          fromStatus: null,
          toStatus: created.status,
          notes: 'Sale created',
          createdById: currentUser.id,
        },
      });

      await tx.activityLog.create({
        data: {
          userId: currentUser.id,
          action: 'CREATE_SALE',
          entity: 'SALE',
          entityId: created.id,
          details: {
            saleNumber: created.saleNumber,
            customerId: created.customerId,
            totalAmount: created.totalAmount,
          },
        },
      });

      return created;
    });

    return sale;
  }

  /**
   * Update sale
   */
  async updateSale(id: string, data: any, currentUser: any) {
    // Check permission
    if (!authService.hasPermission(currentUser.role, 'SALE_UPDATE')) {
      throw new ForbiddenError();
    }

    const validated = UpdateSaleSchema.parse(data);

    // Check if sale exists
    const existingSale = await db.sale.findUnique({
      where: { id },
      select: { id: true, status: true, stockId: true },
    });

    if (!existingSale) {
      throw new NotFoundError('Sale');
    }

    // Cannot update cancelled sale
    if (existingSale.status === 'CANCELLED') {
      throw new BadRequestError('Cannot update cancelled sale');
    }

    // Only ADMIN and ACCOUNTANT can update completed sale
    if (existingSale.status === 'COMPLETED' && !['ADMIN', 'ACCOUNTANT'].includes(currentUser.role)) {
      throw new BadRequestError('Cannot update completed sale');
    }

    // ACCOUNTANT can only edit financial fields on completed sales
    if (existingSale.status === 'COMPLETED' && currentUser.role === 'ACCOUNTANT') {
      const allowedFields = [
        'totalAmount', 'depositAmount', 'paymentMode', 'downPayment',
        'financeAmount', 'financeProvider', 'carDiscount', 'downPaymentDiscount',
        'discountSnapshot', 'freebiesSnapshot',
        'interestRate', 'numberOfTerms', 'monthlyInstallment', 'notes',
      ];
      const disallowed = Object.keys(validated).filter(k => !allowedFields.includes(k));
      if (disallowed.length > 0) {
        throw new BadRequestError(
          `Cannot modify these fields on a completed sale: ${disallowed.join(', ')}`
        );
      }
    }

    // Recalculate remaining amount if total or deposit changed.
    //
    // Invariant: `remainingAmount = totalAmount - max(depositAmount, paidAmount)`.
    // This matches both call sites without double-counting:
    //  - At creation (sales create): no payments yet → remaining = total - deposit
    //  - At payment (createPayment): once a deposit payment is recorded
    //    paidAmount >= depositAmount, so remaining = total - paid
    // Subtracting deposit AND paid (the previous formula) double-counted the
    // deposit whenever it had been recorded as a DEPOSIT-type payment.
    if (validated.totalAmount !== undefined || validated.depositAmount !== undefined) {
      const currentSale = await db.sale.findUnique({
        where: { id },
        select: { totalAmount: true, depositAmount: true, paidAmount: true },
      });

      const newTotal = validated.totalAmount !== undefined ? validated.totalAmount : toNumber(currentSale!.totalAmount);
      const newDeposit = validated.depositAmount !== undefined ? validated.depositAmount : toNumber(currentSale!.depositAmount);
      const paid = toNumber(currentSale!.paidAmount);

      if (newDeposit > newTotal) {
        throw new BadRequestError('Deposit amount cannot exceed total amount');
      }

      const settled = Math.max(newDeposit, paid);
      const newRemaining = newTotal - settled;
      if (newRemaining < 0) {
        throw new BadRequestError(
          `ยอดค้างชำระติดลบ — ไม่สามารถลดยอดได้ (ชำระแล้ว ${paid.toLocaleString()} บาท)`
        );
      }

      validated.remainingAmount = newRemaining;
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
  async updateSaleStatus(id: string, status: string, notes: string | undefined, currentUser: any) {
    // Check permission - use SALE_STATUS_UPDATE for general status changes
    if (!authService.hasPermission(currentUser.role, 'SALE_STATUS_UPDATE')) {
      throw new ForbiddenError();
    }

    // Cancellation requires SALE_CANCEL permission (ADMIN only)
    if (status === 'CANCELLED') {
      if (!authService.hasPermission(currentUser.role, 'SALE_CANCEL')) {
        throw new ForbiddenError('Only admin can cancel sales');
      }
    }

    // Check if sale exists
    const existingSale = await db.sale.findUnique({
      where: { id },
      select: { id: true, status: true, stockId: true, remainingAmount: true, reservedDate: true },
    });

    if (!existingSale) {
      throw new NotFoundError('Sale');
    }

    // Cannot change status of cancelled or completed sale
    if (existingSale.status === 'CANCELLED') {
      throw new BadRequestError('Cannot change status of cancelled sale');
    }
    if (existingSale.status === 'COMPLETED') {
      throw new BadRequestError('Cannot change status of completed sale');
    }

    // Validate full payment before marking as COMPLETED
    if (status === 'COMPLETED') {
      const remaining = Number(existingSale.remainingAmount);
      if (remaining > 0) {
        throw new BadRequestError(
          `ไม่สามารถปิดการขายได้ ยังมียอดค้างชำระ ${remaining.toLocaleString()} บาท`
        );
      }
    }

    // Enforce valid status transitions
    const validTransitions: Record<string, string[]> = {
      RESERVED: ['PREPARING', 'CANCELLED'],
      PREPARING: ['DELIVERED', 'CANCELLED'],
      DELIVERED: ['COMPLETED', 'CANCELLED'],
      COMPLETED: [],
      CANCELLED: [],
    };

    const allowed = validTransitions[existingSale.status] || [];
    if (!allowed.includes(status)) {
      throw new BadRequestError(
        `ไม่สามารถเปลี่ยนสถานะจาก ${existingSale.status} เป็น ${status} ได้`
      );
    }

    // Validate stock assignment when moving to DELIVERED
    if (status === 'DELIVERED') {
      if (!existingSale.stockId) {
        throw new BadRequestError('Cannot deliver sale without assigned stock car. Please assign a stock vehicle before marking as delivered.');
      }
    }

    // Build update data
    const updateData: any = {
      status,
      notes: notes || undefined,
    };

    if (status === 'RESERVED' && !existingSale.reservedDate) {
      updateData.reservedDate = new Date();
    }
    if (status === 'DELIVERED') {
      updateData.deliveryDate = new Date();
    }
    if (status === 'COMPLETED') {
      updateData.completedDate = new Date();
    }

    // All mutations in a single transaction
    const sale = await db.$transaction(async (tx) => {
      const updated = await tx.sale.update({
        where: { id },
        data: updateData,
      });

      // Handle stock status changes
      if (existingSale.stockId) {
        if (status === 'PREPARING') {
          await tx.stock.update({
            where: { id: existingSale.stockId },
            data: { status: 'PREPARING' },
          });
        } else if (status === 'DELIVERED') {
          // Mark SOLD with the actual delivery date as soldDate.
          await tx.stock.update({
            where: { id: existingSale.stockId },
            data: {
              status: 'SOLD',
              soldDate: new Date(),
              actualSalePrice: updated.totalAmount,
            },
          });
        } else if (status === 'COMPLETED') {
          // Confirm SOLD but preserve soldDate (set at DELIVERED). Only set it
          // if delivery was skipped or soldDate was never recorded.
          const stockSnapshot = await tx.stock.findUnique({
            where: { id: existingSale.stockId },
            select: { soldDate: true },
          });
          await tx.stock.update({
            where: { id: existingSale.stockId },
            data: {
              status: 'SOLD',
              ...(stockSnapshot?.soldDate ? {} : { soldDate: new Date() }),
              actualSalePrice: updated.totalAmount,
            },
          });
        } else if (status === 'CANCELLED') {
          await tx.stock.update({
            where: { id: existingSale.stockId },
            data: { status: 'AVAILABLE' },
          });
          await tx.sale.update({
            where: { id },
            data: { stockId: null },
          });
        }
      }

      await tx.saleHistory.create({
        data: {
          saleId: updated.id,
          action: 'UPDATE_STATUS',
          fromStatus: existingSale.status,
          toStatus: status,
          notes,
          createdById: currentUser.id,
        },
      });

      await tx.activityLog.create({
        data: {
          userId: currentUser.id,
          action: 'UPDATE_SALE_STATUS',
          entity: 'SALE',
          entityId: updated.id,
          details: {
            saleNumber: updated.saleNumber,
            fromStatus: existingSale.status,
            toStatus: status,
            notes,
          },
        },
      });

      return updated;
    });

    return sale;
  }

  /**
   * Delete sale
   */
  async deleteSale(id: string, currentUser: any) {
    // Check permission
    if (!authService.hasPermission(currentUser.role, 'SALE_DELETE')) {
      throw new ForbiddenError();
    }

    // Check if sale exists
    const existingSale = await db.sale.findUnique({
      where: { id },
      select: { id: true, status: true, stockId: true },
    });

    if (!existingSale) {
      throw new NotFoundError('Sale');
    }

    // Cannot delete completed or cancelled sale
    if (existingSale.status === 'COMPLETED' || existingSale.status === 'CANCELLED') {
      throw new BadRequestError(`Cannot delete ${existingSale.status.toLowerCase()} sale`);
    }

    // Get sale for logging
    const sale = await db.sale.findUnique({
      where: { id },
      select: { saleNumber: true },
    });

    // Release stock + delete sale + log activity atomically — partial failures
    // here would leave stock released but the sale still referencing it.
    await db.$transaction(async (tx) => {
      if (existingSale.stockId) {
        await tx.stock.update({
          where: { id: existingSale.stockId },
          data: {
            status: 'AVAILABLE',
          },
        });
      }

      await tx.sale.delete({
        where: { id },
      });

      await tx.activityLog.create({
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
    });

    return { success: true, message: 'Sale deleted successfully' };
  }

  /**
   * Assign or change stock for a sale
   */
  async assignStock(saleId: string, stockId: string, currentUser: any) {
    // Check permission
    if (!authService.hasPermission(currentUser.role, 'SALE_ASSIGN_STOCK')) {
      throw new ForbiddenError();
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
      throw new NotFoundError('Sale');
    }

    // Cannot assign stock to delivered, completed or cancelled sale
    if (['DELIVERED', 'COMPLETED', 'CANCELLED'].includes(existingSale.status)) {
      throw new BadRequestError(`Cannot assign stock to ${existingSale.status.toLowerCase()} sale`);
    }

    // Check if new stock exists and is available (exclude soft-deleted)
    const newStock = await db.stock.findFirst({
      where: { id: stockId, deletedAt: null },
      select: { id: true, status: true, vehicleModelId: true },
    });

    if (!newStock) {
      throw new NotFoundError('Stock');
    }

    if (newStock.status === 'DEMO') {
      throw new BadRequestError('รถ Demo ไม่สามารถขายได้');
    }
    if (newStock.status !== 'AVAILABLE') {
      throw new BadRequestError('Stock is not available');
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
    if (!authService.hasPermission(currentUser.role, 'SALE_VIEW')) {
      throw new ForbiddenError();
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
