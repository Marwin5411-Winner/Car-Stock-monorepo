import { Elysia, t } from 'elysia';
import { paymentsService } from './payments.service';
import { authMiddleware, requirePermission } from '../auth/auth.middleware';
import { authService } from '../auth/auth.service';

export const paymentRoutes = new Elysia({ prefix: '/payments' })
  // Get all payments
  .get(
    '/',
    async ({ query, set, requester }) => {
      try {
        const result = await paymentsService.getAllPayments(query, requester);
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
          message: error instanceof Error ? error.message : 'Failed to fetch payments',
        };
      }
    },
    {
      beforeHandle: authMiddleware,
      query: t.Object({
        page: t.Optional(t.String()),
        limit: t.Optional(t.String()),
        search: t.Optional(t.String()),
        saleId: t.Optional(t.String()),
        customerId: t.Optional(t.String()),
        status: t.Optional(t.Union([t.Literal('ACTIVE'), t.Literal('VOIDED')])),
        paymentType: t.Optional(
          t.Union([
            t.Literal('DEPOSIT'),
            t.Literal('DOWN_PAYMENT'),
            t.Literal('FINANCE_PAYMENT'),
            t.Literal('OTHER_EXPENSE'),
            t.Literal('MISCELLANEOUS'),
          ])
        ),
      }),
      detail: {
        tags: ['Payments'],
        summary: 'Get all payments',
        description: 'Get payments with pagination and filters',
      },
    }
  )
  // Get payment statistics
  .get(
    '/stats',
    async ({ set, requester }) => {
      try {
        const stats = await paymentsService.getPaymentStats(requester);
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
          message: error instanceof Error ? error.message : 'Failed to fetch payment stats',
        };
      }
    },
    {
      beforeHandle: authMiddleware,
      detail: {
        tags: ['Payments'],
        summary: 'Get payment statistics',
        description: 'Get overview statistics for payments',
      },
    }
  )
  // Get outstanding payments
  .get(
    '/outstanding',
    async ({ set, requester }) => {
      try {
        const outstanding = await paymentsService.getOutstandingPayments(requester);
        set.status = 200;
        return {
          success: true,
          data: outstanding,
        };
      } catch (error) {
        set.status = 500;
        return {
          success: false,
          error: 'Server error',
          message: error instanceof Error ? error.message : 'Failed to fetch outstanding payments',
        };
      }
    },
    {
      beforeHandle: authMiddleware,
      detail: {
        tags: ['Payments'],
        summary: 'Get outstanding payments',
        description: 'Get sales with outstanding payments',
      },
    }
  )
  // Get payment by ID
  .get(
    '/:id',
    async ({ params, set, requester }) => {
      try {
        const payment = await paymentsService.getPaymentById(params.id, requester);
        set.status = 200;
        return {
          success: true,
          data: payment,
        };
      } catch (error) {
        set.status = error instanceof Error && error.message === 'Payment not found' ? 404 : 400;
        return {
          success: false,
          error: 'Not found',
          message: error instanceof Error ? error.message : 'Failed to fetch payment',
        };
      }
    },
    {
      beforeHandle: authMiddleware,
      detail: {
        tags: ['Payments'],
        summary: 'Get payment by ID',
        description: 'Get a specific payment with full details',
      },
    }
  )
  // Create payment
  .post(
    '/',
    async ({ body, set, requester }) => {
      try {
        const payment = await paymentsService.createPayment(body, requester);
        set.status = 201;
        return {
          success: true,
          data: payment,
          message: 'Payment recorded successfully',
        };
      } catch (error) {
        set.status = 400;
        return {
          success: false,
          error: 'Creation failed',
          message: error instanceof Error ? error.message : 'Failed to create payment',
        };
      }
    },
    {
      beforeHandle: [authMiddleware, requirePermission('PAYMENT_CREATE')],
      body: t.Object({
        saleId: t.Optional(t.String()),
        customerId: t.String({ minLength: 1 }),
        description: t.Optional(t.String()),
        paymentDate: t.Optional(t.Date()),
        paymentType: t.Union([
          t.Literal('DEPOSIT'),
          t.Literal('DOWN_PAYMENT'),
          t.Literal('FINANCE_PAYMENT'),
          t.Literal('OTHER_EXPENSE'),
          t.Literal('MISCELLANEOUS'),
        ]),
        amount: t.Number(),
        paymentMethod: t.Union([
          t.Literal('CASH'),
          t.Literal('BANK_TRANSFER'),
          t.Literal('CHEQUE'),
          t.Literal('CREDIT_CARD'),
        ]),
        referenceNumber: t.Optional(t.String()),
        notes: t.Optional(t.String()),
      }),
      detail: {
        tags: ['Payments'],
        summary: 'Create payment',
        description: 'Record a new payment. SaleId is optional for miscellaneous payments.',
      },
    }
  )
  // Void payment
  .post(
    '/:id/void',
    async ({ params, body, set, requester }) => {
      try {
        const payment = await paymentsService.voidPayment(params.id, body, requester);
        set.status = 200;
        return {
          success: true,
          data: payment,
          message: 'Payment voided successfully',
        };
      } catch (error) {
        set.status = error instanceof Error && error.message === 'Payment not found' ? 404 : 400;
        return {
          success: false,
          error: 'Void failed',
          message: error instanceof Error ? error.message : 'Failed to void payment',
        };
      }
    },
    {
      beforeHandle: [authMiddleware, requirePermission('PAYMENT_VOID')],
      body: t.Object({
        voidReason: t.String({ minLength: 1 }),
      }),
      detail: {
        tags: ['Payments'],
        summary: 'Void payment',
        description: 'Void a payment (accountant, admin only)',
      },
    }
  );
