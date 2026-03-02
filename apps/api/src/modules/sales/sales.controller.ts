import { Elysia, t } from 'elysia';
import { salesService } from './sales.service';
import { authMiddleware, requirePermission } from '../auth/auth.middleware';
import { BadRequestError } from '../../lib/errors';

// Helper to safely parse float - moved to module scope
const safeParseFloat = (value: unknown): number => {
  if (typeof value !== 'string') return value as number;
  const parsed = parseFloat(value);
  if (isNaN(parsed)) throw new BadRequestError(`Invalid number format: ${value}`);
  return parsed;
};

export const salesRoutes = new Elysia({ prefix: '/sales' })
  // Get all sales
  .get(
    '/',
    async ({ query, set, requester }) => {
      const result = await salesService.getAllSales(query, requester);
      set.status = 200;
      return {
        success: true,
        data: result.data,
        meta: result.meta,
      };
    },
    {
      beforeHandle: authMiddleware,
      query: t.Object({
        page: t.Optional(t.String()),
        limit: t.Optional(t.String()),
        search: t.Optional(t.String()),
        // Updated: Removed INQUIRY and QUOTED - now handled by Quotation module
        status: t.Optional(
          t.Union([
            t.Literal('RESERVED'),
            t.Literal('PREPARING'),
            t.Literal('DELIVERED'),
            t.Literal('COMPLETED'),
            t.Literal('CANCELLED'),
          ])
        ),
        type: t.Optional(t.Union([t.Literal('RESERVATION_SALE'), t.Literal('DIRECT_SALE')])),
        customerId: t.Optional(t.String()),
        createdById: t.Optional(t.String()),
      }),
      detail: {
        tags: ['Sales'],
        summary: 'Get all sales',
        description: 'Get sales with pagination and filters',
      },
    }
  )
  // Get sales statistics
  .get(
    '/stats',
    async ({ set, requester }) => {
      const stats = await salesService.getSalesStats(requester);
      set.status = 200;
      return {
        success: true,
        data: stats,
      };
    },
    {
      beforeHandle: authMiddleware,
      detail: {
        tags: ['Sales'],
        summary: 'Get sales statistics',
        description: 'Get overview statistics for sales',
      },
    }
  )
  // Get sale by ID
  .get(
    '/:id',
    async ({ params, set, requester }) => {
      const sale = await salesService.getSaleById(params.id, requester);
      set.status = 200;
      return {
        success: true,
        data: sale,
      };
    },
    {
      beforeHandle: authMiddleware,
      detail: {
        tags: ['Sales'],
        summary: 'Get sale by ID',
        description: 'Get a specific sale with full details',
      },
    }
  )
  // Create sale
  .post(
    '/',
    async ({ body, set, requester }) => {
      // Convert string numbers to actual numbers
      const processedBody = {
        ...body,
        totalAmount: safeParseFloat(body.totalAmount),
        depositAmount: body.depositAmount !== undefined ? safeParseFloat(body.depositAmount) : body.depositAmount,
        discountSnapshot: body.discountSnapshot !== undefined ? safeParseFloat(body.discountSnapshot) : body.discountSnapshot,
        downPayment: body.downPayment !== undefined ? safeParseFloat(body.downPayment) : body.downPayment,
        financeAmount: body.financeAmount !== undefined ? safeParseFloat(body.financeAmount) : body.financeAmount,
        carDiscount: body.carDiscount !== undefined ? safeParseFloat(body.carDiscount) : body.carDiscount,
        downPaymentDiscount: body.downPaymentDiscount !== undefined ? safeParseFloat(body.downPaymentDiscount) : body.downPaymentDiscount,
        interestRate: body.interestRate !== undefined ? safeParseFloat(body.interestRate) : body.interestRate,
        monthlyInstallment: body.monthlyInstallment !== undefined ? safeParseFloat(body.monthlyInstallment) : body.monthlyInstallment,
      };

      const sale = await salesService.createSale(processedBody, requester);
      set.status = 201;
      return {
        success: true,
        data: sale,
        message: 'Sale created successfully',
      };
    },
    {
      beforeHandle: [authMiddleware, requirePermission('SALE_CREATE')],
      body: t.Object({
        type: t.Union([t.Literal('RESERVATION_SALE'), t.Literal('DIRECT_SALE')]),
        customerId: t.String({ minLength: 1 }),
        stockId: t.Optional(t.String()),
        vehicleModelId: t.Optional(t.String()),
        preferredExtColor: t.Optional(t.String()),
        preferredIntColor: t.Optional(t.String()),
        totalAmount: t.Union([t.String(), t.Number()]),
        depositAmount: t.Optional(t.Union([t.String(), t.Number()])),
        expirationDate: t.Optional(t.Date()),
        hasExpiration: t.Optional(t.Boolean()),
        campaignId: t.Optional(t.String()),
        discountSnapshot: t.Optional(t.Union([t.String(), t.Number()])),
        freebiesSnapshot: t.Optional(t.String()),
        paymentMode: t.Optional(t.Union([t.Literal('CASH'), t.Literal('FINANCE'), t.Literal('MIXED')])),
        downPayment: t.Optional(t.Union([t.String(), t.Number()])),
        financeAmount: t.Optional(t.Union([t.String(), t.Number()])),
        financeProvider: t.Optional(t.String()),
        carDiscount: t.Optional(t.Union([t.String(), t.Number()])),
        downPaymentDiscount: t.Optional(t.Union([t.String(), t.Number()])),
        interestRate: t.Optional(t.Union([t.String(), t.Number()])),
        numberOfTerms: t.Optional(t.Number()),
        monthlyInstallment: t.Optional(t.Union([t.String(), t.Number()])),
        refundPolicy: t.Optional(t.Union([t.Literal('FULL'), t.Literal('PARTIAL'), t.Literal('NO_REFUND')])),
        notes: t.Optional(t.String()),
      }),
      detail: {
        tags: ['Sales'],
        summary: 'Create sale',
        description: 'Create a new sale (sales roles)',
      },
    }
  )
  // Update sale
  .patch(
    '/:id',
    async ({ params, body, set, requester }) => {
      const processedBody = {
        ...body,
        totalAmount: body.totalAmount !== undefined ? safeParseFloat(body.totalAmount) : undefined,
        depositAmount: body.depositAmount !== undefined ? safeParseFloat(body.depositAmount) : undefined,
        discountSnapshot: body.discountSnapshot !== undefined ? safeParseFloat(body.discountSnapshot) : undefined,
        downPayment: body.downPayment !== undefined ? safeParseFloat(body.downPayment) : undefined,
        financeAmount: body.financeAmount !== undefined ? safeParseFloat(body.financeAmount) : undefined,
        carDiscount: body.carDiscount !== undefined ? safeParseFloat(body.carDiscount) : undefined,
        downPaymentDiscount: body.downPaymentDiscount !== undefined ? safeParseFloat(body.downPaymentDiscount) : undefined,
        interestRate: body.interestRate !== undefined ? safeParseFloat(body.interestRate) : undefined,
        monthlyInstallment: body.monthlyInstallment !== undefined ? safeParseFloat(body.monthlyInstallment) : undefined,
      };

      const sale = await salesService.updateSale(params.id, processedBody, requester);
      set.status = 200;
      return {
        success: true,
        data: sale,
        message: 'Sale updated successfully',
      };
    },
    {
      beforeHandle: [authMiddleware, requirePermission('SALE_UPDATE')],
      body: t.Object({
        customerId: t.Optional(t.String({ minLength: 1 })),
        stockId: t.Optional(t.String()),
        vehicleModelId: t.Optional(t.String()),
        preferredExtColor: t.Optional(t.String()),
        preferredIntColor: t.Optional(t.String()),
        totalAmount: t.Optional(t.Union([t.String(), t.Number()])),
        depositAmount: t.Optional(t.Union([t.String(), t.Number()])),
        expirationDate: t.Optional(t.Date()),
        hasExpiration: t.Optional(t.Boolean()),
        campaignId: t.Optional(t.String()),
        discountSnapshot: t.Optional(t.Union([t.String(), t.Number()])),
        freebiesSnapshot: t.Optional(t.String()),
        paymentMode: t.Optional(t.Union([t.Literal('CASH'), t.Literal('FINANCE'), t.Literal('MIXED')])),
        downPayment: t.Optional(t.Union([t.String(), t.Number()])),
        financeAmount: t.Optional(t.Union([t.String(), t.Number()])),
        financeProvider: t.Optional(t.String()),
        carDiscount: t.Optional(t.Union([t.String(), t.Number()])),
        downPaymentDiscount: t.Optional(t.Union([t.String(), t.Number()])),
        interestRate: t.Optional(t.Union([t.String(), t.Number()])),
        numberOfTerms: t.Optional(t.Number()),
        monthlyInstallment: t.Optional(t.Union([t.String(), t.Number()])),
        refundPolicy: t.Optional(t.Union([t.Literal('FULL'), t.Literal('PARTIAL'), t.Literal('NO_REFUND')])),
        notes: t.Optional(t.String()),
      }),
      detail: {
        tags: ['Sales'],
        summary: 'Update sale',
        description: 'Update sale information',
      },
    }
  )
  // Update sale status
  .patch(
    '/:id/status',
    async ({ params, body, set, requester }) => {
      const sale = await salesService.updateSaleStatus(
        params.id,
        body.status,
        body.notes,
        requester
      );
      set.status = 200;
      return {
        success: true,
        data: sale,
        message: 'Sale status updated successfully',
      };
    },
    {
      beforeHandle: [authMiddleware, requirePermission('SALE_STATUS_UPDATE')],
      body: t.Object({
        // Updated: Removed INQUIRY and QUOTED - now handled by Quotation module
        status: t.Union([
          t.Literal('RESERVED'),
          t.Literal('PREPARING'),
          t.Literal('DELIVERED'),
          t.Literal('COMPLETED'),
          t.Literal('CANCELLED'),
        ]),
        notes: t.Optional(t.String()),
      }),
      detail: {
        tags: ['Sales'],
        summary: 'Update sale status',
        description: 'Update sale status (workflow transitions)',
      },
    }
  )
  // Assign or change stock
  .patch(
    '/:id/assign-stock',
    async ({ params, body, set, requester }) => {
      const sale = await salesService.assignStock(params.id, body.stockId, requester);
      set.status = 200;
      return {
        success: true,
        data: sale,
        message: 'Stock assigned successfully',
      };
    },
    {
      beforeHandle: [authMiddleware, requirePermission('SALE_ASSIGN_STOCK')],
      body: t.Object({
        stockId: t.String({ minLength: 1 }),
      }),
      detail: {
        tags: ['Sales'],
        summary: 'Assign or change stock',
        description: 'Assign a stock to a sale or change the assigned stock',
      },
    }
  )
  // Delete sale
  .delete(
    '/:id',
    async ({ params, set, requester }) => {
      await salesService.deleteSale(params.id, requester);
      set.status = 200;
      return {
        success: true,
        message: 'Sale deleted successfully',
      };
    },
    {
      beforeHandle: [authMiddleware, requirePermission('SALE_DELETE')],
      detail: {
        tags: ['Sales'],
        summary: 'Delete sale',
        description: 'Delete a sale (admin only)',
      },
    }
  );
