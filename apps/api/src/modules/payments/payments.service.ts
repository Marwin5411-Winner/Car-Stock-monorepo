import { db } from '../../lib/db';
import { CreatePaymentSchema, UpdatePaymentSchema, VoidPaymentSchema, PaymentFilterSchema } from '@car-stock/shared/schemas';
import { NUMBER_PREFIXES } from '@car-stock/shared/constants';
import { authService } from '../auth/auth.service';
import { AppError, NotFoundError, ForbiddenError, BadRequestError } from '../../lib/errors';

// Payment types that affect car price (should update paidAmount and remainingAmount)
const CAR_PAYMENT_TYPES = ['DEPOSIT', 'DOWN_PAYMENT', 'FINANCE_PAYMENT'] as const;

export class PaymentsService {
  /**
   * Generate receipt number
   */
  private async generateReceiptNumber(): Promise<string> {
    const currentYear = new Date().getFullYear();
    const currentMonth = new Date().getMonth() + 1;
    const prefix = NUMBER_PREFIXES.RECEIPT;

    // Atomic upsert + increment — prevents race condition on concurrent payments
    const sequence = await db.numberSequence.upsert({
      where: {
        prefix_year_month: {
          prefix,
          year: currentYear,
          month: currentMonth,
        },
      },
      create: {
        prefix,
        year: currentYear,
        month: currentMonth,
        lastNumber: 1,
      },
      update: {
        lastNumber: { increment: 1 },
      },
    });

    // Format: RCPT-YYMM-XXXX
    const yearStr = currentYear.toString().slice(-2);
    const monthStr = currentMonth.toString().padStart(2, '0');
    return `${prefix}-${yearStr}${monthStr}-${sequence.lastNumber.toString().padStart(4, '0')}`;
  }

  /**
   * Get all payments with pagination and filters
   */
  async getAllPayments(params: any, currentUser: any) {
    // Check permission
    if (!authService.hasPermission(currentUser.role, 'PAYMENT_VIEW' as any)) {
      throw new ForbiddenError();
    }

    const validated = PaymentFilterSchema.parse(params);
    const skip = (validated.page - 1) * validated.limit;

    const where: any = {};

    if (validated.search) {
      where.OR = [
        { receiptNumber: { contains: validated.search, mode: 'insensitive' } },
        { customer: { is: { name: { contains: validated.search, mode: 'insensitive' } } } },
        { customer: { is: { code: { contains: validated.search, mode: 'insensitive' } } } },
        { sale: { is: { saleNumber: { contains: validated.search, mode: 'insensitive' } } } },
      ];
    }

    if (validated.saleId) {
      where.saleId = validated.saleId;
    }

    if (validated.customerId) {
      where.customerId = validated.customerId;
    }

    if (validated.status) {
      where.status = validated.status;
    }

    if (validated.paymentType) {
      where.paymentType = validated.paymentType;
    }

    const [payments, total] = await Promise.all([
      db.payment.findMany({
        where,
        select: {
          id: true,
          receiptNumber: true,
          amount: true,
          paymentDate: true,
          paymentType: true,
          paymentMethod: true,
          referenceNumber: true,
          description: true,
          status: true,
          customer: {
            select: {
              id: true,
              code: true,
              name: true,
            },
          },
          sale: {
            select: {
              id: true,
              saleNumber: true,
            },
          },
          createdAt: true,
        },
        skip,
        take: validated.limit,
        orderBy: { paymentDate: 'desc' },
      }),
      db.payment.count({ where }),
    ]);

    return {
      data: payments,
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
   * Get payment by ID
   */
  async getPaymentById(id: string, currentUser: any) {
    // Check permission
    if (!authService.hasPermission(currentUser.role, 'PAYMENT_VIEW' as any)) {
      throw new ForbiddenError();
    }

    const payment = await db.payment.findUnique({
      where: { id },
      include: {
        customer: true,
        sale: {
          include: {
            customer: {
              select: {
                id: true,
                code: true,
                name: true,
              },
            },
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
      },
    });

    if (!payment) {
      throw new NotFoundError('Payment');
    }

    return payment;
  }

  /**
   * Create new payment
   */
  async createPayment(data: any, currentUser: any) {
    // Check permission
    if (!authService.hasPermission(currentUser.role, 'PAYMENT_CREATE' as any)) {
      throw new ForbiddenError();
    }

    const validated = CreatePaymentSchema.parse(data);

    // Check if customer exists
    const customer = await db.customer.findUnique({
      where: { id: validated.customerId },
      select: { id: true },
    });

    if (!customer) {
      throw new NotFoundError('Customer');
    }

    let sale = null;
    
    // Only check for sale if saleId is provided (not a miscellaneous payment)
    if (validated.saleId) {
      sale = await db.sale.findUnique({
        where: { id: validated.saleId },
        select: { id: true, totalAmount: true, paidAmount: true, remainingAmount: true },
      });

      if (!sale) {
        throw new NotFoundError('Sale');
      }
    }

    // Validate amount is positive
    if (validated.amount <= 0) {
      throw new BadRequestError('จำนวนเงินต้องมากกว่า 0');
    }

    // Validate overpayment for car-related payments
    const isCarPayment = CAR_PAYMENT_TYPES.includes(validated.paymentType as typeof CAR_PAYMENT_TYPES[number]);

    if (sale && isCarPayment) {
      const remaining = Number(sale.remainingAmount);
      if (validated.amount > remaining) {
        throw new BadRequestError(
          `จำนวนเงินเกินยอดค้างชำระ (คงเหลือ ${remaining.toLocaleString()} บาท)`
        );
      }
    }

    // Generate receipt number
    const receiptNumber = await this.generateReceiptNumber();

    // Create payment + update sale balance in a single transaction
    const payment = await db.$transaction(async (tx) => {
      const created = await tx.payment.create({
        data: {
          customerId: validated.customerId,
          saleId: validated.saleId || null,
          description: validated.description || null,
          paymentDate: validated.paymentDate,
          paymentType: validated.paymentType,
          amount: validated.amount,
          paymentMethod: validated.paymentMethod,
          referenceNumber: validated.referenceNumber || null,
          notes: validated.notes || null,
          receiptNumber,
          createdById: currentUser.id,
          issuedBy: [currentUser.firstName, currentUser.lastName].filter(Boolean).join(' ') || currentUser.username,
        },
      });

      // Update sale paid amount and remaining amount
      // Only for car-related payment types (DEPOSIT, DOWN_PAYMENT, FINANCE_PAYMENT)
      if (sale && validated.saleId && isCarPayment) {
        const newPaidAmount = Number(sale.paidAmount) + validated.amount;
        const newRemainingAmount = Number(sale.totalAmount) - newPaidAmount;

        await tx.sale.update({
          where: { id: validated.saleId },
          data: {
            paidAmount: newPaidAmount,
            remainingAmount: newRemainingAmount,
          },
        });
      }

      await tx.activityLog.create({
        data: {
          userId: currentUser.id,
          action: 'CREATE_PAYMENT',
          entity: 'PAYMENT',
          entityId: created.id,
          details: {
            receiptNumber: created.receiptNumber,
            amount: created.amount,
            saleId: created.saleId,
            customerId: created.customerId,
            paymentType: created.paymentType,
            description: created.description,
          },
        },
      });

      return created;
    });

    return payment;
  }

  /**
   * Update payment (ADMIN/ACCOUNTANT only, ACTIVE payments only)
   */
  async updatePayment(id: string, data: any, currentUser: any) {
    if (!authService.hasPermission(currentUser.role, 'PAYMENT_UPDATE' as any)) {
      throw new ForbiddenError();
    }

    const validated = UpdatePaymentSchema.parse(data);

    const existingPayment = await db.payment.findUnique({
      where: { id },
      select: { id: true, status: true, amount: true, saleId: true, paymentType: true },
    });

    if (!existingPayment) {
      throw new NotFoundError('Payment');
    }

    if (existingPayment.status === 'VOIDED') {
      throw new BadRequestError('ไม่สามารถแก้ไขใบเสร็จที่ยกเลิกแล้วได้');
    }

    const oldAmount = Number(existingPayment.amount);
    const newAmount = validated.amount ?? oldAmount;

    const oldType = existingPayment.paymentType;
    const newType = validated.paymentType ?? oldType;
    const wasCarPayment = CAR_PAYMENT_TYPES.includes(oldType as typeof CAR_PAYMENT_TYPES[number]);
    const isCarPayment = CAR_PAYMENT_TYPES.includes(newType as typeof CAR_PAYMENT_TYPES[number]);

    // Calculate net effect on sale paidAmount
    // Subtract old car-payment amount, add new car-payment amount
    const oldContribution = wasCarPayment ? oldAmount : 0;
    const newContribution = isCarPayment ? newAmount : 0;
    const saleDiff = newContribution - oldContribution;

    // Validate overpayment when amount increases for car-related payments
    if (existingPayment.saleId && saleDiff > 0 && isCarPayment) {
      const sale = await db.sale.findUnique({
        where: { id: existingPayment.saleId },
        select: { remainingAmount: true },
      });

      if (sale) {
        const remaining = Number(sale.remainingAmount);
        if (saleDiff > remaining) {
          throw new BadRequestError(
            `จำนวนเงินเกินยอดค้างชำระ (คงเหลือ ${remaining.toLocaleString()} บาท)`
          );
        }
      }
    }

    const payment = await db.$transaction(async (tx) => {
      const updated = await tx.payment.update({
        where: { id },
        data: validated,
      });

      // Update sale paidAmount/remainingAmount if contribution changed
      if (existingPayment.saleId && saleDiff !== 0) {
        const sale = await tx.sale.findUnique({
          where: { id: existingPayment.saleId },
          select: { paidAmount: true, totalAmount: true },
        });

        if (sale) {
          const newPaidAmount = Number(sale.paidAmount) + saleDiff;
          const newRemainingAmount = Number(sale.totalAmount) - newPaidAmount;

          await tx.sale.update({
            where: { id: existingPayment.saleId },
            data: {
              paidAmount: newPaidAmount,
              remainingAmount: newRemainingAmount,
            },
          });
        }
      }

      await tx.activityLog.create({
        data: {
          userId: currentUser.id,
          action: 'UPDATE_PAYMENT',
          entity: 'PAYMENT',
          entityId: updated.id,
          details: {
            receiptNumber: updated.receiptNumber,
            changes: validated,
          },
        },
      });

      return updated;
    });

    return payment;
  }

  /**
   * Void payment
   */
  async voidPayment(id: string, data: any, currentUser: any) {
    // Check permission
    if (!authService.hasPermission(currentUser.role, 'PAYMENT_VOID' as any)) {
      throw new ForbiddenError();
    }

    const validated = VoidPaymentSchema.parse(data);

    // Check if payment exists
    const existingPayment = await db.payment.findUnique({
      where: { id },
      select: { id: true, status: true, amount: true, saleId: true, paymentType: true },
    });

    if (!existingPayment) {
      throw new NotFoundError('Payment');
    }

    if (existingPayment.status === 'VOIDED') {
      throw new BadRequestError('Cannot void already voided payment');
    }

    const isCarPayment = CAR_PAYMENT_TYPES.includes(existingPayment.paymentType as typeof CAR_PAYMENT_TYPES[number]);

    // Void payment + reverse sale balance + log in a single transaction
    const payment = await db.$transaction(async (tx) => {
      const voided = await tx.payment.update({
        where: { id },
        data: {
          status: 'VOIDED',
          voidReason: validated.voidReason,
          voidedAt: new Date(),
        },
      });

      // Reverse sale balance for car-related payment types
      if (existingPayment.saleId && isCarPayment) {
        const sale = await tx.sale.findUnique({
          where: { id: existingPayment.saleId },
          select: { paidAmount: true, totalAmount: true },
        });

        if (sale) {
          const newPaidAmount = Number(sale.paidAmount) - Number(existingPayment.amount);
          const newRemainingAmount = Number(sale.totalAmount) - newPaidAmount;

          await tx.sale.update({
            where: { id: existingPayment.saleId },
            data: {
              paidAmount: newPaidAmount,
              remainingAmount: newRemainingAmount,
            },
          });
        }
      }

      await tx.activityLog.create({
        data: {
          userId: currentUser.id,
          action: 'VOID_PAYMENT',
          entity: 'PAYMENT',
          entityId: voided.id,
          details: {
            receiptNumber: voided.receiptNumber,
            amount: voided.amount,
            voidReason: validated.voidReason,
          },
        },
      });

      return voided;
    });

    return payment;
  }

  /**
   * Get payment statistics
   */
  async getPaymentStats(currentUser: any) {
    // Check permission
    if (!authService.hasPermission(currentUser.role, 'PAYMENT_VIEW' as any)) {
      throw new ForbiddenError();
    }

    const [totalPayments, activePayments, voidedPayments] = await Promise.all([
      db.payment.count(),
      db.payment.count({ where: { status: 'ACTIVE' } }),
      db.payment.count({ where: { status: 'VOIDED' } }),
    ]);

    // Calculate total amount received
    const amountResult = await db.payment.aggregate({
      where: { status: 'ACTIVE' },
      _sum: {
        amount: true,
      },
    });

    const totalAmount = Number(amountResult._sum.amount || 0);

    // Calculate amounts by payment type
    const [depositResult, downPaymentResult, financeResult, otherExpenseResult] = await Promise.all([
      db.payment.aggregate({
        where: { status: 'ACTIVE', paymentType: 'DEPOSIT' },
        _sum: { amount: true },
      }),
      db.payment.aggregate({
        where: { status: 'ACTIVE', paymentType: 'DOWN_PAYMENT' },
        _sum: { amount: true },
      }),
      db.payment.aggregate({
        where: { status: 'ACTIVE', paymentType: 'FINANCE_PAYMENT' },
        _sum: { amount: true },
      }),
      db.payment.aggregate({
        where: { status: 'ACTIVE', paymentType: 'OTHER_EXPENSE' },
        _sum: { amount: true },
      }),
    ]);

    const depositAmount = Number(depositResult._sum.amount || 0);
    const downPaymentAmount = Number(downPaymentResult._sum.amount || 0);
    const financePaymentAmount = Number(financeResult._sum.amount || 0);
    const otherExpenseAmount = Number(otherExpenseResult._sum.amount || 0);

    // Calculate monthly revenue (current month)
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    const monthlyAmountResult = await db.payment.aggregate({
      where: {
        status: 'ACTIVE',
        paymentDate: {
          gte: startOfMonth,
          lte: endOfMonth,
        },
      },
      _sum: {
        amount: true,
      },
    });

    const monthlyRevenue = Number(monthlyAmountResult._sum.amount || 0);

    return {
      totalPayments,
      activePayments,
      voidedPayments,
      totalAmount,
      depositAmount,
      downPaymentAmount,
      financePaymentAmount,
      otherExpenseAmount,
      monthlyRevenue,
    };
  }

  /**
   * Get outstanding payments (sales with remaining amount > 0)
   */
  async getOutstandingPayments(currentUser: any) {
    // Check permission
    if (!authService.hasPermission(currentUser.role, 'PAYMENT_VIEW' as any)) {
      throw new ForbiddenError();
    }

    const outstandingSales = await db.sale.findMany({
      where: {
        remainingAmount: {
          gt: 0,
        },
        status: {
          in: ['RESERVED', 'PREPARING', 'DELIVERED', 'COMPLETED'],
        },
      },
      select: {
        id: true,
        saleNumber: true,
        totalAmount: true,
        paidAmount: true,
        remainingAmount: true,
        deliveryDate: true,
        customer: {
          select: {
            id: true,
            code: true,
            name: true,
          },
        },
        stock: {
          select: {
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
      },
      orderBy: { deliveryDate: 'asc' },
      take: 50,
    });

    return outstandingSales;
  }
}

export const paymentsService = new PaymentsService();
