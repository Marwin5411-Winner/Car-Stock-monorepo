import { db } from '../../lib/db';
import { CreatePaymentSchema, VoidPaymentSchema, PaymentFilterSchema } from '@car-stock/shared/schemas';
import { NUMBER_PREFIXES } from '@car-stock/shared/constants';
import { authService } from '../auth/auth.service';

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

    // Get or create number sequence
    let sequence = await db.numberSequence.findFirst({
      where: {
        prefix: prefix,
        year: currentYear,
        month: currentMonth,
      },
    });

    if (!sequence) {
      sequence = await db.numberSequence.create({
        data: {
          prefix: prefix,
          year: currentYear,
          month: currentMonth,
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

    // Format: RCPT-YYMM-XXXX
    const yearStr = currentYear.toString().slice(-2);
    const monthStr = currentMonth.toString().padStart(2, '0');
    return `${prefix}-${yearStr}${monthStr}-${nextNumber.toString().padStart(4, '0')}`;
  }

  /**
   * Get all payments with pagination and filters
   */
  async getAllPayments(params: any, currentUser: any) {
    // Check permission
    if (!authService.hasPermission(currentUser.role, 'PAYMENT_VIEW' as any)) {
      throw new Error('Insufficient permissions');
    }

    const validated = PaymentFilterSchema.parse(params);
    const skip = (validated.page - 1) * validated.limit;

    const where: any = {};

    if (validated.search) {
      where.OR = [
        { receiptNumber: { contains: validated.search, mode: 'insensitive' } },
        { customer: { name: { contains: validated.search, mode: 'insensitive' } } },
        { sale: { saleNumber: { contains: validated.search, mode: 'insensitive' } } },
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
      throw new Error('Insufficient permissions');
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
      throw new Error('Payment not found');
    }

    return payment;
  }

  /**
   * Create new payment
   */
  async createPayment(data: any, currentUser: any) {
    // Check permission
    if (!authService.hasPermission(currentUser.role, 'PAYMENT_CREATE' as any)) {
      throw new Error('Insufficient permissions');
    }

    const validated = CreatePaymentSchema.parse(data);

    // Check if customer exists
    const customer = await db.customer.findUnique({
      where: { id: validated.customerId },
      select: { id: true },
    });

    if (!customer) {
      throw new Error('Customer not found');
    }

    let sale = null;
    
    // Only check for sale if saleId is provided (not a miscellaneous payment)
    if (validated.saleId) {
      sale = await db.sale.findUnique({
        where: { id: validated.saleId },
        select: { id: true, totalAmount: true, paidAmount: true, remainingAmount: true },
      });

      if (!sale) {
        throw new Error('Sale not found');
      }
    }

    // Generate receipt number
    const receiptNumber = await this.generateReceiptNumber();

    // Create payment
    const payment = await db.payment.create({
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
        issuedBy: `${currentUser.firstName} ${currentUser.lastName}`,
      },
    });

    // Update sale paid amount and remaining amount
    // Only for car-related payment types (DEPOSIT, DOWN_PAYMENT, FINANCE_PAYMENT)
    // OTHER_EXPENSE and MISCELLANEOUS should NOT affect the car price remaining
    const isCarPayment = CAR_PAYMENT_TYPES.includes(validated.paymentType as typeof CAR_PAYMENT_TYPES[number]);
    
    if (sale && validated.saleId && isCarPayment) {
      const newPaidAmount = Number(sale.paidAmount) + validated.amount;
      const newRemainingAmount = Number(sale.totalAmount) - newPaidAmount;

      await db.sale.update({
        where: { id: validated.saleId },
        data: {
          paidAmount: newPaidAmount,
          remainingAmount: newRemainingAmount,
        },
      });
    }

    // Log activity
    await db.activityLog.create({
      data: {
        userId: currentUser.id,
        action: 'CREATE_PAYMENT',
        entity: 'PAYMENT',
        entityId: payment.id,
        details: {
          receiptNumber: payment.receiptNumber,
          amount: payment.amount,
          saleId: payment.saleId,
          customerId: payment.customerId,
          paymentType: payment.paymentType,
          description: payment.description,
        },
      },
    });

    return payment;
  }

  /**
   * Void payment
   */
  async voidPayment(id: string, data: any, currentUser: any) {
    // Check permission
    if (!authService.hasPermission(currentUser.role, 'PAYMENT_VOID' as any)) {
      throw new Error('Insufficient permissions');
    }

    const validated = VoidPaymentSchema.parse(data);

    // Check if payment exists
    const existingPayment = await db.payment.findUnique({
      where: { id },
      select: { id: true, status: true, amount: true, saleId: true, paymentType: true },
    });

    if (!existingPayment) {
      throw new Error('Payment not found');
    }

    if (existingPayment.status === 'VOIDED') {
      throw new Error('Payment already voided');
    }

    // Void payment
    const payment = await db.payment.update({
      where: { id },
      data: {
        status: 'VOIDED',
        voidReason: validated.voidReason,
        voidedAt: new Date(),
      },
    });

    // Update sale paid amount and remaining amount
    // Only for car-related payment types (DEPOSIT, DOWN_PAYMENT, FINANCE_PAYMENT)
    // OTHER_EXPENSE and MISCELLANEOUS should NOT affect the car price remaining
    const isCarPayment = CAR_PAYMENT_TYPES.includes(existingPayment.paymentType as typeof CAR_PAYMENT_TYPES[number]);
    
    if (existingPayment.saleId && isCarPayment) {
      const sale = await db.sale.findUnique({
        where: { id: existingPayment.saleId },
        select: { paidAmount: true, totalAmount: true },
      });

      if (sale) {
        const newPaidAmount = Number(sale.paidAmount) - Number(existingPayment.amount);
        const newRemainingAmount = Number(sale.totalAmount) - newPaidAmount;

        await db.sale.update({
          where: { id: existingPayment.saleId },
          data: {
            paidAmount: newPaidAmount,
            remainingAmount: newRemainingAmount,
          },
        });
      }
    }

    // Log activity
    await db.activityLog.create({
      data: {
        userId: currentUser.id,
        action: 'VOID_PAYMENT',
        entity: 'PAYMENT',
        entityId: payment.id,
        details: {
          receiptNumber: payment.receiptNumber,
          amount: payment.amount,
          voidReason: validated.voidReason,
        },
      },
    });

    return payment;
  }

  /**
   * Get payment statistics
   */
  async getPaymentStats(currentUser: any) {
    // Check permission
    if (!authService.hasPermission(currentUser.role, 'PAYMENT_VIEW' as any)) {
      throw new Error('Insufficient permissions');
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
      monthlyRevenue,
    };
  }

  /**
   * Get outstanding payments (sales with remaining amount > 0)
   */
  async getOutstandingPayments(currentUser: any) {
    // Check permission
    if (!authService.hasPermission(currentUser.role, 'PAYMENT_VIEW' as any)) {
      throw new Error('Insufficient permissions');
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
