import { db } from '../../lib/db';
import { CreateCustomerSchema, UpdateCustomerSchema, CustomerFilterSchema } from '@car-stock/shared/schemas';
import { NUMBER_PREFIXES } from '@car-stock/shared/constants';
import { authService } from '../auth/auth.service';

export class CustomersService {
  /**
   * Generate customer code
   */
  private async generateCustomerCode(): Promise<string> {
    const currentYear = new Date().getFullYear();
    const prefix = NUMBER_PREFIXES.CUSTOMER;

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

    // Format: CUST-YYYY-XXXX
    return `${prefix}-${currentYear}-${nextNumber.toString().padStart(4, '0')}`;
  }

  /**
   * Get all customers with pagination and filters
   */
  async getAllCustomers(params: any, currentUser: any) {
    // Check permission
    if (!authService.hasPermission(currentUser.role, 'CUSTOMER_VIEW' as any)) {
      throw new Error('Insufficient permissions');
    }

    const validated = CustomerFilterSchema.parse(params);
    const skip = (validated.page - 1) * validated.limit;

    const where: any = {};

    if (validated.search) {
      where.OR = [
        { code: { contains: validated.search, mode: 'insensitive' } },
        { name: { contains: validated.search, mode: 'insensitive' } },
        { email: { contains: validated.search, mode: 'insensitive' } },
        { phone: { contains: validated.search, mode: 'insensitive' } },
      ];
    }

    if (validated.type) {
      where.type = validated.type;
    }

    if (validated.salesType) {
      where.salesType = validated.salesType;
    }

    const [customers, total] = await Promise.all([
      db.customer.findMany({
        where,
        select: {
          id: true,
          code: true,
          type: true,
          salesType: true,
          name: true,
          taxId: true,
          phone: true,
          email: true,
          creditLimit: true,
          createdAt: true,
          updatedAt: true,
        },
        skip,
        take: validated.limit,
        orderBy: { createdAt: 'desc' },
      }),
      db.customer.count({ where }),
    ]);

    return {
      data: customers,
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
   * Get customer by ID
   */
  async getCustomerById(id: string, currentUser: any) {
    // Check permission
    if (!authService.hasPermission(currentUser.role, 'CUSTOMER_VIEW' as any)) {
      throw new Error('Insufficient permissions');
    }

    const customer = await db.customer.findUnique({
      where: { id },
      include: {
        sales: {
          select: {
            id: true,
            saleNumber: true,
            totalAmount: true,
            status: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
        payments: {
          select: {
            id: true,
            receiptNumber: true,
            amount: true,
            paymentDate: true,
            status: true,
          },
          orderBy: { paymentDate: 'desc' },
          take: 10,
        },
      },
    });

    if (!customer) {
      throw new Error('Customer not found');
    }

    return customer;
  }

  /**
   * Create new customer
   */
  async createCustomer(data: any, currentUser: any) {
    // Check permission
    if (!authService.hasPermission(currentUser.role, 'CUSTOMER_CREATE' as any)) {
      throw new Error('Insufficient permissions');
    }

    const validated = CreateCustomerSchema.parse(data);

    // Check if tax ID exists (if provided)
    if (validated.taxId) {
      const existingTaxId = await db.customer.findUnique({
        where: { taxId: validated.taxId },
      });

      if (existingTaxId) {
        throw new Error('Tax ID already exists');
      }
    }

    // Generate customer code
    const code = await this.generateCustomerCode();

    // Create customer
    const customer = await db.customer.create({
      data: {
        ...validated,
        code,
      },
    });

    // Log activity
    await db.activityLog.create({
      data: {
        userId: currentUser.id,
        action: 'CREATE_CUSTOMER',
        entity: 'CUSTOMER',
        entityId: customer.id,
        details: {
          customerCode: customer.code,
          customerName: customer.name,
        },
      },
    });

    return customer;
  }

  /**
   * Update customer
   */
  async updateCustomer(id: string, data: any, currentUser: any) {
    // Check permission
    if (!authService.hasPermission(currentUser.role, 'CUSTOMER_UPDATE' as any)) {
      throw new Error('Insufficient permissions');
    }

    const validated = UpdateCustomerSchema.parse(data);

    // Check if customer exists
    const existingCustomer = await db.customer.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!existingCustomer) {
      throw new Error('Customer not found');
    }

    // Check if tax ID exists (if updating tax ID)
    if (validated.taxId) {
      const existingTaxId = await db.customer.findUnique({
        where: { taxId: validated.taxId },
      });

      if (existingTaxId && existingTaxId.id !== id) {
        throw new Error('Tax ID already exists');
      }
    }

    // Update customer
    const customer = await db.customer.update({
      where: { id },
      data: validated,
    });

    // Log activity
    await db.activityLog.create({
      data: {
        userId: currentUser.id,
        action: 'UPDATE_CUSTOMER',
        entity: 'CUSTOMER',
        entityId: customer.id,
        details: {
          customerCode: customer.code,
          changes: validated,
        },
      },
    });

    return customer;
  }

  /**
   * Delete customer
   */
  async deleteCustomer(id: string, currentUser: any) {
    // Check permission
    if (!authService.hasPermission(currentUser.role, 'CUSTOMER_DELETE' as any)) {
      throw new Error('Insufficient permissions');
    }

    // Check if customer has sales
    const salesCount = await db.sale.count({
      where: { customerId: id },
    });

    if (salesCount > 0) {
      throw new Error('Cannot delete customer with existing sales');
    }

    // Get customer for logging
    const customer = await db.customer.findUnique({
      where: { id },
      select: { code: true, name: true },
    });

    if (!customer) {
      throw new Error('Customer not found');
    }

    // Delete customer
    await db.customer.delete({
      where: { id },
    });

    // Log activity
    await db.activityLog.create({
      data: {
        userId: currentUser.id,
        action: 'DELETE_CUSTOMER',
        entity: 'CUSTOMER',
        entityId: id,
        details: {
          customerCode: customer.code,
          customerName: customer.name,
        },
      },
    });

    return { success: true, message: 'Customer deleted successfully' };
  }
}

export const customersService = new CustomersService();
