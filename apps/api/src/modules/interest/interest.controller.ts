import { Elysia, t } from 'elysia';
import { interestService } from './interest.service';
import { authMiddleware } from '../auth/auth.middleware';
import { authService } from '../auth/auth.service';
import '../../types/context.d';

export const interestRoutes = new Elysia({ prefix: '/interest' })
  // Get all stock with interest summary
  .get(
    '/',
    async ({ query, set, requester }) => {
      try {
        // Check permission - need INTEREST_VIEW
        if (!authService.hasPermission(requester!.role, 'INTEREST_VIEW' as any)) {
          set.status = 403;
          return {
            success: false,
            error: 'Forbidden',
            message: 'Insufficient permissions',
          };
        }

        const page = query.page ? parseInt(query.page) : 1;
        const limit = query.limit ? parseInt(query.limit) : 20;
        const isCalculating = query.isCalculating === 'true' ? true : 
                              query.isCalculating === 'false' ? false : undefined;

        const result = await interestService.getAllStockInterest({
          page,
          limit,
          search: query.search,
          status: query.status as any,
          isCalculating,
        });

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
          message: error instanceof Error ? error.message : 'Failed to fetch interest data',
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
            t.Literal('AVAILABLE'),
            t.Literal('RESERVED'),
            t.Literal('PREPARING'),
            t.Literal('SOLD'),
          ])
        ),
        isCalculating: t.Optional(t.String()),
      }),
      detail: {
        tags: ['Interest'],
        summary: 'Get all stock with interest summary',
        description: 'Get list of all stock with their accumulated interest',
      },
    }
  )
  // Get interest statistics
  .get(
    '/stats',
    async ({ set, requester }) => {
      try {
        // Check permission - need INTEREST_VIEW
        if (!authService.hasPermission(requester!.role, 'INTEREST_VIEW' as any)) {
          set.status = 403;
          return {
            success: false,
            error: 'Forbidden',
            message: 'Insufficient permissions',
          };
        }

        const stats = await interestService.getInterestStats();
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
          message: error instanceof Error ? error.message : 'Failed to fetch interest stats',
        };
      }
    },
    {
      beforeHandle: authMiddleware,
      detail: {
        tags: ['Interest'],
        summary: 'Get interest statistics',
        description: 'Get overall interest statistics for all stock',
      },
    }
  )
  // Get interest detail for a specific stock
  .get(
    '/:stockId',
    async ({ params, set, requester }) => {
      try {
        // Check permission - need INTEREST_VIEW
        if (!authService.hasPermission(requester!.role, 'INTEREST_VIEW' as any)) {
          set.status = 403;
          return {
            success: false,
            error: 'Forbidden',
            message: 'Insufficient permissions',
          };
        }

        const result = await interestService.getStockInterestDetail(params.stockId);
        set.status = 200;
        return {
          success: true,
          data: result,
        };
      } catch (error) {
        const status = error instanceof Error && error.message === 'Stock not found' ? 404 : 500;
        set.status = status;
        return {
          success: false,
          error: status === 404 ? 'Not found' : 'Server error',
          message: error instanceof Error ? error.message : 'Failed to fetch interest detail',
        };
      }
    },
    {
      beforeHandle: authMiddleware,
      params: t.Object({
        stockId: t.String(),
      }),
      detail: {
        tags: ['Interest'],
        summary: 'Get interest detail for a stock',
        description: 'Get detailed interest information including all periods for a specific stock',
      },
    }
  )
  // Initialize interest period for a stock
  .post(
    '/:stockId/initialize',
    async ({ params, body, set, requester }) => {
      try {
        // Need INTEREST_UPDATE permission (ADMIN or ACCOUNTANT only)
        if (!authService.hasPermission(requester!.role, 'INTEREST_UPDATE' as any)) {
          set.status = 403;
          return {
            success: false,
            error: 'Forbidden',
            message: 'Insufficient permissions',
          };
        }

        const result = await interestService.initializeInterestPeriod(
          params.stockId,
          {
            annualRate: body.annualRate,
            principalBase: body.principalBase as any,
            startDate: body.startDate ? new Date(body.startDate) : undefined,
            notes: body.notes,
          },
          requester!.userId
        );

        set.status = 201;
        return {
          success: true,
          data: result,
          message: 'Interest period initialized successfully',
        };
      } catch (error) {
        const status = error instanceof Error && error.message.includes('not found') ? 404 : 400;
        set.status = status;
        return {
          success: false,
          error: status === 404 ? 'Not found' : 'Bad request',
          message: error instanceof Error ? error.message : 'Failed to initialize interest period',
        };
      }
    },
    {
      beforeHandle: authMiddleware,
      params: t.Object({
        stockId: t.String(),
      }),
      body: t.Object({
        annualRate: t.Number({ minimum: 0, maximum: 100 }),
        principalBase: t.Optional(t.Union([t.Literal('BASE_COST_ONLY'), t.Literal('TOTAL_COST')])),
        startDate: t.Optional(t.String()),
        notes: t.Optional(t.String()),
      }),
      detail: {
        tags: ['Interest'],
        summary: 'Initialize interest period',
        description: 'Initialize the first interest period for a stock that has no periods yet',
      },
    }
  )
  // Update interest rate (creates new period)
  .put(
    '/:stockId',
    async ({ params, body, set, requester }) => {
      try {
        // Need INTEREST_UPDATE permission (ADMIN or ACCOUNTANT only)
        if (!authService.hasPermission(requester!.role, 'INTEREST_UPDATE' as any)) {
          set.status = 403;
          return {
            success: false,
            error: 'Forbidden',
            message: 'Insufficient permissions',
          };
        }

        const result = await interestService.updateInterestRate(
          params.stockId,
          {
            annualRate: body.annualRate,
            principalBase: body.principalBase as any,
            effectiveDate: body.effectiveDate ? new Date(body.effectiveDate) : undefined,
            notes: body.notes,
          },
          requester!.userId
        );

        set.status = 200;
        return {
          success: true,
          data: result,
          message: 'Interest rate updated successfully',
        };
      } catch (error) {
        const status = error instanceof Error && error.message.includes('not found') ? 404 : 400;
        set.status = status;
        return {
          success: false,
          error: status === 404 ? 'Not found' : 'Bad request',
          message: error instanceof Error ? error.message : 'Failed to update interest rate',
        };
      }
    },
    {
      beforeHandle: authMiddleware,
      params: t.Object({
        stockId: t.String(),
      }),
      body: t.Object({
        annualRate: t.Number({ minimum: 0, maximum: 100 }),
        principalBase: t.Optional(t.Union([t.Literal('BASE_COST_ONLY'), t.Literal('TOTAL_COST')])),
        effectiveDate: t.Optional(t.String()),
        notes: t.Optional(t.String()),
      }),
      detail: {
        tags: ['Interest'],
        summary: 'Update interest rate',
        description: 'Update interest rate for a stock. This closes the current period and creates a new one.',
      },
    }
  )
  // Stop interest calculation
  .post(
    '/:stockId/stop',
    async ({ params, body, set, requester }) => {
      try {
        // Need INTEREST_UPDATE permission (ADMIN or ACCOUNTANT only)
        if (!authService.hasPermission(requester!.role, 'INTEREST_UPDATE' as any)) {
          set.status = 403;
          return {
            success: false,
            error: 'Forbidden',
            message: 'Insufficient permissions',
          };
        }

        await interestService.stopInterestCalculation(
          params.stockId,
          requester!.userId,
          body?.notes
        );

        set.status = 200;
        return {
          success: true,
          message: 'Interest calculation stopped successfully',
        };
      } catch (error) {
        const status = error instanceof Error && error.message.includes('not found') ? 404 : 400;
        set.status = status;
        return {
          success: false,
          error: status === 404 ? 'Not found' : 'Bad request',
          message: error instanceof Error ? error.message : 'Failed to stop interest calculation',
        };
      }
    },
    {
      beforeHandle: authMiddleware,
      params: t.Object({
        stockId: t.String(),
      }),
      body: t.Optional(
        t.Object({
          notes: t.Optional(t.String()),
        })
      ),
      detail: {
        tags: ['Interest'],
        summary: 'Stop interest calculation',
        description: 'Stop interest calculation for a stock',
      },
    }
  )
  // Resume interest calculation
  .post(
    '/:stockId/resume',
    async ({ params, body, set, requester }) => {
      try {
        // Need INTEREST_UPDATE permission (ADMIN or ACCOUNTANT only)
        if (!authService.hasPermission(requester!.role, 'INTEREST_UPDATE' as any)) {
          set.status = 403;
          return {
            success: false,
            error: 'Forbidden',
            message: 'Insufficient permissions',
          };
        }

        const result = await interestService.resumeInterestCalculation(
          params.stockId,
          {
            annualRate: body.annualRate,
            principalBase: body.principalBase as any,
            notes: body.notes,
          },
          requester!.userId
        );

        set.status = 200;
        return {
          success: true,
          data: result,
          message: 'Interest calculation resumed successfully',
        };
      } catch (error) {
        const status = error instanceof Error && error.message.includes('not found') ? 404 : 400;
        set.status = status;
        return {
          success: false,
          error: status === 404 ? 'Not found' : 'Bad request',
          message: error instanceof Error ? error.message : 'Failed to resume interest calculation',
        };
      }
    },
    {
      beforeHandle: authMiddleware,
      params: t.Object({
        stockId: t.String(),
      }),
      body: t.Object({
        annualRate: t.Number({ minimum: 0, maximum: 100 }),
        principalBase: t.Optional(t.Union([t.Literal('BASE_COST_ONLY'), t.Literal('TOTAL_COST')])),
        notes: t.Optional(t.String()),
      }),
      detail: {
        tags: ['Interest'],
        summary: 'Resume interest calculation',
        description: 'Resume interest calculation for a stock that was previously stopped',
      },
    }
  );
