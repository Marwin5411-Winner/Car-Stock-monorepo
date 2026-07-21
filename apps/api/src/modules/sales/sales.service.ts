import { db } from '../../lib/db';
import { CreateSaleSchema, UpdateSaleSchema, SaleFilterSchema } from '@car-stock/shared/schemas';
import { NUMBER_PREFIXES } from '@car-stock/shared/constants';
import { authService } from '../auth/auth.service';
import { campaignFormulasService } from '../campaigns/campaign-formulas.service';
import { Decimal } from '@prisma/client/runtime/library';
import { NotFoundError, ForbiddenError, BadRequestError, ConflictError } from '../../lib/errors';
import {
  initialRemaining,
  recalcRemaining,
  shouldRecalcRemaining,
} from './sales-remaining';

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
    insuranceFee: toNumberOrNull(sale.insuranceFee),
    compulsoryInsuranceFee: toNumberOrNull(sale.compulsoryInsuranceFee),
    registrationFee: toNumberOrNull(sale.registrationFee),
    salesCommission: toNumberOrNull(sale.salesCommission),
    salesExpense: toNumberOrNull(sale.salesExpense),
    financeCommission: toNumberOrNull(sale.financeCommission),
    interestRate: toNumberOrNull(sale.interestRate),
    monthlyInstallment: toNumberOrNull(sale.monthlyInstallment),
    discountSnapshot: toNumberOrNull(sale.discountSnapshot),
    campaignSubsidySnapshot: toNumberOrNull(sale.campaignSubsidySnapshot),
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

    // Check if campaign exists and is currently within its rebate window.
    // Both the stored status and the date window must agree — a campaign with
    // status=ACTIVE but endDate in the past is effectively closed (the report
    // submission window is over) and must not accept new tagged sales.
    if (validated.campaignId) {
      const campaign = await db.campaign.findUnique({
        where: { id: validated.campaignId },
        select: { id: true, status: true, startDate: true, endDate: true },
      });

      if (!campaign) {
        throw new NotFoundError('Campaign');
      }

      if (campaign.status !== 'ACTIVE') {
        throw new BadRequestError('Campaign is not active');
      }

      const now = new Date();
      if (campaign.startDate > now) {
        throw new BadRequestError('Campaign has not started yet');
      }
      if (campaign.endDate < now) {
        throw new BadRequestError('Campaign has already ended');
      }
    }

    // Auto-tag Sale.campaignId when the user did not pick a campaign.
    // The supplier-rebate report needs every eligible sale linked to its
    // active campaign or the dealership cannot claim it. The no-overlap
    // rule on campaign create/update guarantees at most one match; we sort
    // by latest startDate as a tiebreaker in case legacy data still has
    // overlapping ACTIVE campaigns.
    if (!validated.campaignId) {
      let vehicleModelIdForCampaign: string | null = validated.vehicleModelId ?? null;
      if (!vehicleModelIdForCampaign && validated.stockId) {
        const stockForVm = await db.stock.findUnique({
          where: { id: validated.stockId },
          select: { vehicleModelId: true },
        });
        vehicleModelIdForCampaign = stockForVm?.vehicleModelId ?? null;
      }

      if (vehicleModelIdForCampaign) {
        const now = new Date();
        const activeCampaign = await db.campaign.findFirst({
          where: {
            status: 'ACTIVE',
            startDate: { lte: now },
            endDate: { gte: now },
            vehicleModels: { some: { vehicleModelId: vehicleModelIdForCampaign } },
          },
          orderBy: { startDate: 'desc' },
          select: { id: true },
        });
        if (activeCampaign) {
          validated.campaignId = activeCampaign.id;
        }
      }
    }

    const campaignSubsidySnapshot = await campaignFormulasService.computeSaleSubsidySnapshot({
      campaignId: validated.campaignId,
      vehicleModelId: validated.vehicleModelId ?? null,
      stockId: validated.stockId ?? null,
    });

    // Generate sale number
    const saleNumber = await this.generateSaleNumber();

    // Calculate remaining amount.
    // Buyer-charged fees (insurance / พรบ / registration) are part of what the
    // customer owes: remaining = total + fees − settled (deposit agreed on create).
    const createFees =
      (validated.insuranceFee || 0) +
      (validated.compulsoryInsuranceFee || 0) +
      (validated.registrationFee || 0);
    const remainingAmount = initialRemaining(
      validated.totalAmount,
      validated.depositAmount || 0,
      createFees
    );

    // Create sale + reserve stock + history + activity log in transaction
    const sale = await db.$transaction(async (tx) => {
      const created = await tx.sale.create({
        data: {
          ...validated,
          saleNumber,
          remainingAmount,
          campaignSubsidySnapshot,
          createdById: currentUser.id,
        },
      });

      // Reserve stock only if still AVAILABLE (atomic vs concurrent sales)
      if (validated.stockId) {
        const reserved = await tx.stock.updateMany({
          where: { id: validated.stockId, status: 'AVAILABLE', deletedAt: null },
          data: { status: 'RESERVED' },
        });
        if (reserved.count === 0) {
          throw new BadRequestError('Stock is not available');
        }
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
    // Mutable update payload; remainingAmount is computed server-side when money changes.
    const updatePayload: Record<string, unknown> = { ...validated };

    // Empty string relation IDs must not reach Prisma (FK violation → BAD_REQUEST).
    // Treat them as "omit field" so metadata-only edits (e.g. deliveryDate) succeed.
    if (updatePayload.stockId === '') {
      delete updatePayload.stockId;
    }
    if (updatePayload.customerId === '') {
      delete updatePayload.customerId;
    }
    // Sale type is set at create time; never rewrite it via update payload.
    delete updatePayload.type;

    // Check if sale exists
    const existingSale = await db.sale.findUnique({
      where: { id },
      select: {
        id: true,
        saleNumber: true,
        status: true,
        stockId: true,
        campaignId: true,
        vehicleModelId: true,
      },
    });

    if (!existingSale) {
      throw new NotFoundError('Sale');
    }

    // Cannot update cancelled sale
    if (existingSale.status === 'CANCELLED') {
      throw new BadRequestError('ไม่สามารถแก้ไขรายการที่ถูกยกเลิกแล้ว');
    }

    // Only ADMIN and ACCOUNTANT can update completed sale
    if (existingSale.status === 'COMPLETED' && !['ADMIN', 'ACCOUNTANT'].includes(currentUser.role)) {
      throw new BadRequestError('ไม่สามารถแก้ไขรายการที่เสร็จสิ้นแล้ว');
    }

    // ACCOUNTANT can only edit financial fields on completed sales
    if (existingSale.status === 'COMPLETED' && currentUser.role === 'ACCOUNTANT') {
      const allowedFields = [
        'totalAmount', 'depositAmount', 'paymentMode', 'downPayment',
        'financeAmount', 'financeProvider', 'carDiscount', 'downPaymentDiscount',
        'discountSnapshot', 'freebiesSnapshot',
        'insuranceFee', 'compulsoryInsuranceFee', 'registrationFee',
        'salesCommission', 'salesExpense', 'financeCommission',
        'interestRate', 'numberOfTerms', 'monthlyInstallment', 'notes',
        'createdAt', 'deliveryDate',
      ];
      const disallowed = Object.keys(updatePayload).filter((k) => !allowedFields.includes(k));
      if (disallowed.length > 0) {
        throw new BadRequestError(
          `ไม่สามารถแก้ไขฟิลด์เหล่านี้ในรายการที่เสร็จสิ้นแล้ว: ${disallowed.join(', ')}`
        );
      }
    }

    // Stock reassignment must mirror assignStock inventory rules (reserve new /
    // release old). Availability is re-checked inside the transaction via
    // conditional updateMany so concurrent assign/update cannot both win.
    // Re-sending the same stockId is a no-op for inventory.
    const incomingStockId =
      typeof updatePayload.stockId === 'string' ? updatePayload.stockId : undefined;
    const stockChanging =
      incomingStockId !== undefined && incomingStockId !== existingSale.stockId;
    let newStockStatus: 'RESERVED' | 'PREPARING' | null = null;

    if (stockChanging) {
      if (!authService.hasPermission(currentUser.role, 'SALE_ASSIGN_STOCK')) {
        throw new ForbiddenError();
      }

      if (['DELIVERED', 'COMPLETED', 'CANCELLED'].includes(existingSale.status)) {
        throw new BadRequestError(
          'ไม่สามารถเปลี่ยนรถในสต็อกเมื่อรายการส่งมอบแล้ว เสร็จสิ้น หรือยกเลิก'
        );
      }

      newStockStatus = existingSale.status === 'PREPARING' ? 'PREPARING' : 'RESERVED';
    }

    // Recalculate remaining amount only when financial values actually change.
    //
    // The sales form always re-sends total/deposit/fees on every save — including
    // when the user only edits วันที่รับรถ (deliveryDate). Recomputing remaining
    // in that case would reject the whole request for legacy/inconsistent rows
    // where paidAmount > total + fees, even though no money field changed.
    //
    // Invariant: remainingAmount = totalAmount + totalFees - paidAmount.
    //
    // `paidAmount` is the single source of truth for what the customer has
    // actually settled. It is kept in sync by the Payment flows:
    //   - createPayment / updatePayment / voidPayment  →  paid += / -= amount
    //   - convertToSale (from quotation)                →  paid = depositAmount
    //
    // We deliberately do NOT include `depositAmount` in this formula:
    //   - `depositAmount` is the agreed (informational) deposit on the
    //     contract — not money in the bank.
    //   - If the operator raises `depositAmount` on the form above what the
    //     customer has actually paid, the remaining must NOT drop, because
    //     the customer has not settled that extra amount.
    //   - The earlier `max(depositAmount, paidAmount)` formula over-counted
    //     whenever `depositAmount > paidAmount` (e.g. partial deposit paid,
    //     or operator bumped the agreed deposit up).
    //
    // `depositAmount` is still validated to be ≤ `totalAmount` so the form
    // can't accept nonsensical values, but it does not influence `remaining`.
    const feeFields = ['insuranceFee', 'compulsoryInsuranceFee', 'registrationFee'] as const;
    const anyFinancialPresent =
      updatePayload.totalAmount !== undefined ||
      updatePayload.depositAmount !== undefined ||
      feeFields.some((f) => updatePayload[f] !== undefined);

    if (anyFinancialPresent) {
      const currentSale = await db.sale.findUnique({
        where: { id },
        select: {
          totalAmount: true,
          depositAmount: true,
          paidAmount: true,
          insuranceFee: true,
          compulsoryInsuranceFee: true,
          registrationFee: true,
        },
      });

      const oldTotal = toNumber(currentSale!.totalAmount);
      const oldDeposit = toNumber(currentSale!.depositAmount);
      const oldFees = feeFields.reduce(
        (sum, f) => sum + (toNumberOrNull(currentSale![f]) || 0),
        0
      );

      const newTotal =
        updatePayload.totalAmount !== undefined
          ? Number(updatePayload.totalAmount)
          : oldTotal;
      const newDeposit =
        updatePayload.depositAmount !== undefined
          ? Number(updatePayload.depositAmount)
          : oldDeposit;
      const newFees = feeFields.reduce(
        (sum, f) =>
          sum +
          (updatePayload[f] !== undefined
            ? Number(updatePayload[f])
            : toNumberOrNull(currentSale![f]) || 0),
        0
      );

      // No actual money-field change (form re-sent the same numbers) → leave
      // remainingAmount alone so deliveryDate / notes / etc. can still save.
      if (
        shouldRecalcRemaining({
          oldTotal,
          oldDeposit,
          oldFees,
          newTotal,
          newDeposit,
          newFees,
          totalPresent: updatePayload.totalAmount !== undefined,
          depositPresent: updatePayload.depositAmount !== undefined,
        })
      ) {
        const paid = toNumber(currentSale!.paidAmount);
        const result = recalcRemaining(newTotal, newDeposit, paid, newFees);
        if (!result.ok) {
          throw new BadRequestError(result.message);
        }
        updatePayload.remainingAmount = result.remaining;
      }
    }

    const campaignSubsidySnapshot = await campaignFormulasService.computeSaleSubsidySnapshot({
      campaignId:
        (updatePayload.campaignId as string | undefined) ?? existingSale.campaignId,
      vehicleModelId:
        (updatePayload.vehicleModelId as string | undefined) ?? existingSale.vehicleModelId,
      stockId: (updatePayload.stockId as string | undefined) ?? existingSale.stockId,
    });

    const updateData = { ...updatePayload, campaignSubsidySnapshot };

    // When stock changes, reserve new (conditional) then release old in one
    // transaction so concurrent sales cannot both claim the same unit.
    const sale = stockChanging
      ? await db.$transaction(async (tx) => {
          const newStock = await tx.stock.findFirst({
            where: { id: incomingStockId, deletedAt: null },
            select: { id: true, status: true, vehicleModelId: true },
          });

          if (!newStock) {
            throw new NotFoundError('Stock');
          }
          if (newStock.status === 'DEMO') {
            throw new BadRequestError('รถ Demo ไม่สามารถขายได้');
          }
          if (newStock.status !== 'AVAILABLE') {
            throw new BadRequestError('รถคันนี้ไม่พร้อมขาย (ไม่ได้สถานะ AVAILABLE)');
          }

          if (
            existingSale.vehicleModelId &&
            newStock.vehicleModelId !== existingSale.vehicleModelId
          ) {
            console.warn(
              `Stock vehicle model (${newStock.vehicleModelId}) does not match sale preference (${existingSale.vehicleModelId})`
            );
          }

          // Atomic claim: only succeeds if still AVAILABLE
          const claimed = await tx.stock.updateMany({
            where: { id: incomingStockId!, status: 'AVAILABLE', deletedAt: null },
            data: { status: newStockStatus! },
          });
          if (claimed.count === 0) {
            throw new BadRequestError('รถคันนี้ไม่พร้อมขาย (ไม่ได้สถานะ AVAILABLE)');
          }

          if (existingSale.stockId && existingSale.stockId !== incomingStockId) {
            await tx.stock.update({
              where: { id: existingSale.stockId },
              data: { status: 'AVAILABLE' },
            });
          }

          const updated = await tx.sale.update({
            where: { id },
            data: updateData,
          });

          await tx.saleHistory.create({
            data: {
              saleId: updated.id,
              action: existingSale.stockId ? 'CHANGE_STOCK' : 'ASSIGN_STOCK',
              fromStatus: existingSale.status,
              toStatus: existingSale.status,
              notes: existingSale.stockId
                ? `Changed stock from ${existingSale.stockId} to ${incomingStockId} (via sale update)`
                : `Assigned stock ${incomingStockId} (via sale update)`,
              createdById: currentUser.id,
            },
          });

          return updated;
        })
      : await db.sale.update({
          where: { id },
          data: updateData,
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
          changes: updatePayload,
          ...(stockChanging
            ? {
                stockChange: {
                  oldStockId: existingSale.stockId,
                  newStockId: incomingStockId,
                },
              }
            : {}),
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
      select: { id: true, status: true, stockId: true, remainingAmount: true, reservedDate: true, deliveryDate: true },
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
    if (status === 'DELIVERED' && !existingSale.deliveryDate) {
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

    // Determine stock status based on sale status
    const stockStatus = existingSale.status === 'PREPARING' ? 'PREPARING' : 'RESERVED';

    // Claim availability inside the transaction (updateMany where AVAILABLE)
    // so concurrent assignStock / updateSale cannot double-book the unit.
    const result = await db.$transaction(async (tx) => {
      const newStock = await tx.stock.findFirst({
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

      if (existingSale.vehicleModelId && newStock.vehicleModelId !== existingSale.vehicleModelId) {
        console.warn(
          `Stock vehicle model (${newStock.vehicleModelId}) does not match sale preference (${existingSale.vehicleModelId})`
        );
      }

      const claimed = await tx.stock.updateMany({
        where: { id: stockId, status: 'AVAILABLE', deletedAt: null },
        data: { status: stockStatus },
      });
      if (claimed.count === 0) {
        throw new BadRequestError('Stock is not available');
      }

      if (existingSale.stockId && existingSale.stockId !== stockId) {
        await tx.stock.update({
          where: { id: existingSale.stockId },
          data: { status: 'AVAILABLE' },
        });
      }

      const sale = await tx.sale.update({
        where: { id: saleId },
        data: { stockId },
      });

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
