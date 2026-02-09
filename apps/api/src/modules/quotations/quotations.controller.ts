import { Elysia, t } from 'elysia';
import { quotationsService } from './quotations.service';
import { authMiddleware, requirePermission } from '../auth/auth.middleware';

export const quotationRoutes = new Elysia({ prefix: '/quotations' })
  // Get all quotations
  .get(
    '/',
    async ({ query, set, requester }) => {
      try {
        const result = await quotationsService.getAllQuotations(query, requester);
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
          message: error instanceof Error ? error.message : 'Failed to fetch quotations',
        };
      }
    },
    {
      beforeHandle: authMiddleware,
      query: t.Object({
        page: t.Optional(t.String()),
        limit: t.Optional(t.String()),
        search: t.Optional(t.String()),
        status: t.Optional(
          t.Union([
            t.Literal('DRAFT'),
            t.Literal('SENT'),
            t.Literal('ACCEPTED'),
            t.Literal('REJECTED'),
            t.Literal('EXPIRED'),
            t.Literal('CONVERTED'),
          ])
        ),
        customerId: t.Optional(t.String()),
      }),
      detail: {
        tags: ['Quotations'],
        summary: 'Get all quotations',
        description: 'Get quotations with pagination and filters',
      },
    }
  )
  // Get quotation statistics
  .get(
    '/stats',
    async ({ set, requester }) => {
      try {
        const stats = await quotationsService.getQuotationStats(requester);
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
          message: error instanceof Error ? error.message : 'Failed to fetch quotation stats',
        };
      }
    },
    {
      beforeHandle: authMiddleware,
      detail: {
        tags: ['Quotations'],
        summary: 'Get quotation statistics',
        description: 'Get overview statistics for quotations',
      },
    }
  )
  // Get quotation by ID
  .get(
    '/:id',
    async ({ params, set, requester }) => {
      try {
        const quotation = await quotationsService.getQuotationById(params.id, requester);
        set.status = 200;
        return {
          success: true,
          data: quotation,
        };
      } catch (error) {
        set.status = error instanceof Error && error.message === 'Quotation not found' ? 404 : 400;
        return {
          success: false,
          error: 'Not found',
          message: error instanceof Error ? error.message : 'Quotation not found',
        };
      }
    },
    {
      beforeHandle: authMiddleware,
      params: t.Object({
        id: t.String(),
      }),
      detail: {
        tags: ['Quotations'],
        summary: 'Get quotation by ID',
        description: 'Get detailed information about a specific quotation',
      },
    }
  )
  // Create new quotation
  .post(
    '/',
    async ({ body, set, requester }) => {
      try {
        const quotation = await quotationsService.createQuotation(body, requester);
        set.status = 201;
        return {
          success: true,
          data: quotation,
        };
      } catch (error) {
        set.status = 400;
        return {
          success: false,
          error: 'Bad request',
          message: error instanceof Error ? error.message : 'Failed to create quotation',
        };
      }
    },
    {
      beforeHandle: [authMiddleware, requirePermission('QUOTATION_CREATE')],
      body: t.Object({
        customerId: t.String(),
        vehicleModelId: t.Optional(t.String()),
        preferredExtColor: t.Optional(t.String()),
        preferredIntColor: t.Optional(t.String()),
        quotedPrice: t.Number(),
        discountAmount: t.Optional(t.Number()),
        validUntil: t.String(),
        notes: t.Optional(t.String()),
      }),
      detail: {
        tags: ['Quotations'],
        summary: 'Create new quotation',
        description: 'Create a new quotation for a customer',
      },
    }
  )
  // Update quotation
  .put(
    '/:id',
    async ({ params, body, set, requester }) => {
      try {
        const quotation = await quotationsService.updateQuotation(params.id, body, requester);
        set.status = 200;
        return {
          success: true,
          data: quotation,
        };
      } catch (error) {
        set.status = 400;
        return {
          success: false,
          error: 'Bad request',
          message: error instanceof Error ? error.message : 'Failed to update quotation',
        };
      }
    },
    {
      beforeHandle: [authMiddleware, requirePermission('QUOTATION_UPDATE')],
      params: t.Object({
        id: t.String(),
      }),
      body: t.Object({
        vehicleModelId: t.Optional(t.String()),
        preferredExtColor: t.Optional(t.String()),
        preferredIntColor: t.Optional(t.String()),
        quotedPrice: t.Optional(t.Number()),
        discountAmount: t.Optional(t.Number()),
        validUntil: t.Optional(t.String()),
        notes: t.Optional(t.String()),
      }),
      detail: {
        tags: ['Quotations'],
        summary: 'Update quotation',
        description: 'Update an existing quotation (only DRAFT status)',
      },
    }
  )
  // Update quotation status
  .patch(
    '/:id/status',
    async ({ params, body, set, requester }) => {
      try {
        const quotation = await quotationsService.updateQuotationStatus(params.id, body.status, requester);
        set.status = 200;
        return {
          success: true,
          data: quotation,
        };
      } catch (error) {
        set.status = 400;
        return {
          success: false,
          error: 'Bad request',
          message: error instanceof Error ? error.message : 'Failed to update quotation status',
        };
      }
    },
    {
      beforeHandle: [authMiddleware, requirePermission('QUOTATION_UPDATE')],
      params: t.Object({
        id: t.String(),
      }),
      body: t.Object({
        status: t.Union([
          t.Literal('DRAFT'),
          t.Literal('SENT'),
          t.Literal('ACCEPTED'),
          t.Literal('REJECTED'),
          t.Literal('EXPIRED'),
        ]),
      }),
      detail: {
        tags: ['Quotations'],
        summary: 'Update quotation status',
        description: 'Change the status of a quotation',
      },
    }
  )
  // Convert quotation to sale
  .post(
    '/:id/convert',
    async ({ params, body, set, requester }) => {
      try {
        const result = await quotationsService.convertToSale(params.id, body, requester);
        set.status = 200;
        return {
          success: true,
          data: result,
        };
      } catch (error) {
        set.status = 400;
        return {
          success: false,
          error: 'Bad request',
          message: error instanceof Error ? error.message : 'Failed to convert quotation to sale',
        };
      }
    },
    {
      beforeHandle: [authMiddleware, requirePermission('QUOTATION_CONVERT')],
      params: t.Object({
        id: t.String(),
      }),
      body: t.Object({
        saleType: t.Optional(t.Union([t.Literal('RESERVATION_SALE'), t.Literal('DIRECT_SALE')])),
        depositAmount: t.Optional(t.Number()),
        stockId: t.Optional(t.String()),
        paymentMode: t.Optional(t.Union([t.Literal('CASH'), t.Literal('FINANCE'), t.Literal('MIXED')])),
      }),
      detail: {
        tags: ['Quotations'],
        summary: 'Convert quotation to sale',
        description: 'Convert an accepted quotation to a sale record',
      },
    }
  )
  // Create new version of quotation
  .post(
    '/:id/new-version',
    async ({ params, body, set, requester }) => {
      try {
        const quotation = await quotationsService.createNewVersion(params.id, body, requester);
        set.status = 201;
        return {
          success: true,
          data: quotation,
        };
      } catch (error) {
        set.status = 400;
        return {
          success: false,
          error: 'Bad request',
          message: error instanceof Error ? error.message : 'Failed to create new quotation version',
        };
      }
    },
    {
      beforeHandle: [authMiddleware, requirePermission('QUOTATION_CREATE')],
      params: t.Object({
        id: t.String(),
      }),
      body: t.Object({
        vehicleModelId: t.Optional(t.String()),
        preferredExtColor: t.Optional(t.String()),
        preferredIntColor: t.Optional(t.String()),
        quotedPrice: t.Optional(t.Number()),
        discountAmount: t.Optional(t.Number()),
        validUntil: t.Optional(t.String()),
        notes: t.Optional(t.String()),
      }),
      detail: {
        tags: ['Quotations'],
        summary: 'Create new quotation version',
        description: 'Create a new version of an existing quotation',
      },
    }
  )
  // Delete quotation
  .delete(
    '/:id',
    async ({ params, set, requester }) => {
      try {
        await quotationsService.deleteQuotation(params.id, requester);
        set.status = 200;
        return {
          success: true,
          message: 'Quotation deleted successfully',
        };
      } catch (error) {
        set.status = 400;
        return {
          success: false,
          error: 'Bad request',
          message: error instanceof Error ? error.message : 'Failed to delete quotation',
        };
      }
    },
    {
      beforeHandle: [authMiddleware, requirePermission('QUOTATION_DELETE')],
      params: t.Object({
        id: t.String(),
      }),
      detail: {
        tags: ['Quotations'],
        summary: 'Delete quotation',
        description: 'Delete a quotation (only DRAFT status)',
      },
    }
  );
