import { Elysia, t } from 'elysia';
import { salesService } from './sales.service';
import { authMiddleware, requirePermission } from '../auth/auth.middleware';
import { authService } from '../auth/auth.service';

export const salesRoutes = new Elysia({ prefix: '/sales' })
  // Get all sales
  .get(
    '/',
    async ({ query, set, requester }) => {
      try {
        const result = await salesService.getAllSales(query, requester);
        set.status = 200;
        return {
          success: true,
          data: result.data,
          meta: result.meta,
        };
      } catch (error) {
        set.status = 500;
        return {
          success: false,
          error: 'Server error',
          message: error instanceof Error ? error.message : 'Failed to fetch sales',
        };
      }
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
      try {
        const stats = await salesService.getSalesStats(requester);
        set.status = 200;
        return {
          success: true,
          data: stats,
        };
      } catch (error) {
        set.status = 500;
        return {
          success: false,
          error: 'Server error',
          message: error instanceof Error ? error.message : 'Failed to fetch sales stats',
        };
      }
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
      try {
        const sale = await salesService.getSaleById(params.id, requester);
        set.status = 200;
        return {
          success: true,
          data: sale,
        };
      } catch (error) {
        set.status = error instanceof Error && error.message === 'Sale not found' ? 404 : 400;
        return {
          success: false,
          error: 'Not found',
          message: error instanceof Error ? error.message : 'Failed to fetch sale',
        };
      }
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
      try {
        const sale = await salesService.createSale(body, requester);
        set.status = 201;
        return {
          success: true,
          data: sale,
          message: 'Sale created successfully',
        };
      } catch (error) {
        set.status = 400;
        return {
          success: false,
          error: 'Creation failed',
          message: error instanceof Error ? error.message : 'Failed to create sale',
        };
      }
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
        totalAmount: t.Number(),
        depositAmount: t.Optional(t.Number()),
        expirationDate: t.Optional(t.Date()),
        hasExpiration: t.Optional(t.Boolean()),
        campaignId: t.Optional(t.String()),
        discountSnapshot: t.Optional(t.Number()),
        freebiesSnapshot: t.Optional(t.String()),
        paymentMode: t.Optional(t.Union([t.Literal('CASH'), t.Literal('FINANCE'), t.Literal('MIXED')])),
        downPayment: t.Optional(t.Number()),
        financeAmount: t.Optional(t.Number()),
        financeProvider: t.Optional(t.String()),
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
      try {
        const sale = await salesService.updateSale(params.id, body, requester);
        set.status = 200;
        return {
          success: true,
          data: sale,
          message: 'Sale updated successfully',
        };
      } catch (error) {
        set.status = error instanceof Error && error.message === 'Sale not found' ? 404 : 400;
        return {
          success: false,
          error: 'Update failed',
          message: error instanceof Error ? error.message : 'Failed to update sale',
        };
      }
    },
    {
      beforeHandle: [authMiddleware, requirePermission('SALE_UPDATE')],
      body: t.Object({
        customerId: t.Optional(t.String({ minLength: 1 })),
        stockId: t.Optional(t.String()),
        vehicleModelId: t.Optional(t.String()),
        preferredExtColor: t.Optional(t.String()),
        preferredIntColor: t.Optional(t.String()),
        totalAmount: t.Optional(t.Number()),
        depositAmount: t.Optional(t.Number()),
        expirationDate: t.Optional(t.Date()),
        hasExpiration: t.Optional(t.Boolean()),
        campaignId: t.Optional(t.String()),
        discountSnapshot: t.Optional(t.Number()),
        freebiesSnapshot: t.Optional(t.String()),
        paymentMode: t.Optional(t.Union([t.Literal('CASH'), t.Literal('FINANCE'), t.Literal('MIXED')])),
        downPayment: t.Optional(t.Number()),
        financeAmount: t.Optional(t.Number()),
        financeProvider: t.Optional(t.String()),
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
      try {
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
      } catch (error) {
        set.status = error instanceof Error && error.message === 'Sale not found' ? 404 : 400;
        return {
          success: false,
          error: 'Update failed',
          message: error instanceof Error ? error.message : 'Failed to update sale status',
        };
      }
    },
    {
      beforeHandle: [authMiddleware, requirePermission('SALE_UPDATE')],
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
      try {
        const sale = await salesService.assignStock(params.id, body.stockId, requester);
        set.status = 200;
        return {
          success: true,
          data: sale,
          message: 'Stock assigned successfully',
        };
      } catch (error) {
        set.status = error instanceof Error && error.message === 'Sale not found' ? 404 : 400;
        return {
          success: false,
          error: 'Assignment failed',
          message: error instanceof Error ? error.message : 'Failed to assign stock',
        };
      }
    },
    {
      beforeHandle: [authMiddleware, requirePermission('SALE_UPDATE')],
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
      try {
        await salesService.deleteSale(params.id, requester);
        set.status = 200;
        return {
          success: true,
          message: 'Sale deleted successfully',
        };
      } catch (error) {
        set.status = error instanceof Error && error.message === 'Sale not found' ? 404 : 400;
        return {
          success: false,
          error: 'Deletion failed',
          message: error instanceof Error ? error.message : 'Failed to delete sale',
        };
      }
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
