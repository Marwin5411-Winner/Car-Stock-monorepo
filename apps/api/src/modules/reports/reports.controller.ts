import { Elysia, t } from 'elysia';
import { reportsService } from './reports.service';
import { authMiddleware, requirePermission } from '../auth/auth.middleware';
import { authService } from '../auth/auth.service';
import '../../types/context.d';

export const reportRoutes = new Elysia({ prefix: '/reports' })
  // ============================================
  // Daily Payment Report
  // ============================================
  .get(
    '/daily-payments',
    async ({ query, set, requester }) => {
      try {
        // Check permission - REPORT_FINANCE
        if (!authService.hasPermission(requester!.role, 'REPORT_FINANCE')) {
          set.status = 403;
          return {
            success: false,
            error: 'Forbidden',
            message: 'คุณไม่มีสิทธิ์ดูรายงานนี้',
          };
        }

        const startDate = query.startDate ? new Date(query.startDate) : undefined;
        const endDate = query.endDate ? new Date(query.endDate + 'T23:59:59.999Z') : undefined;

        const result = await reportsService.getDailyPaymentReport({
          startDate,
          endDate,
        });

        set.status = 200;
        return {
          success: true,
          data: result,
        };
      } catch (error) {
        set.status = 500;
        return {
          success: false,
          error: 'Server error',
          message: error instanceof Error ? error.message : 'Failed to fetch daily payment report',
        };
      }
    },
    {
      beforeHandle: authMiddleware,
      query: t.Object({
        startDate: t.Optional(t.String()),
        endDate: t.Optional(t.String()),
      }),
      detail: {
        tags: ['Reports'],
        summary: 'Get daily payment report',
        description: 'Get payment transactions grouped by day with summary',
      },
    }
  )
  // ============================================
  // Stock Report
  // ============================================
  .get(
    '/stock',
    async ({ query, set, requester }) => {
      try {
        // Check permission - REPORT_STOCK
        if (!authService.hasPermission(requester!.role, 'REPORT_STOCK')) {
          set.status = 403;
          return {
            success: false,
            error: 'Forbidden',
            message: 'คุณไม่มีสิทธิ์ดูรายงานนี้',
          };
        }

        const result = await reportsService.getStockReport({
          status: query.status as any,
        });

        set.status = 200;
        return {
          success: true,
          data: result,
        };
      } catch (error) {
        set.status = 500;
        return {
          success: false,
          error: 'Server error',
          message: error instanceof Error ? error.message : 'Failed to fetch stock report',
        };
      }
    },
    {
      beforeHandle: authMiddleware,
      query: t.Object({
        startDate: t.Optional(t.String()),
        endDate: t.Optional(t.String()),
        status: t.Optional(
          t.Union([
            t.Literal('AVAILABLE'),
            t.Literal('RESERVED'),
            t.Literal('PREPARING'),
            t.Literal('SOLD'),
          ])
        ),
      }),
      detail: {
        tags: ['Reports'],
        summary: 'Get stock report',
        description: 'Get stock inventory report with summary by status and brand',
      },
    }
  )
  // ============================================
  // Profit & Loss Report
  // ============================================
  .get(
    '/profit-loss',
    async ({ query, set, requester }) => {
      try {
        // Check permission - REPORT_SALES + SALE_VIEW_PROFIT
        if (
          !authService.hasPermission(requester!.role, 'REPORT_SALES') ||
          !authService.hasPermission(requester!.role, 'SALE_VIEW_PROFIT')
        ) {
          set.status = 403;
          return {
            success: false,
            error: 'Forbidden',
            message: 'คุณไม่มีสิทธิ์ดูรายงานนี้',
          };
        }

        const startDate = query.startDate ? new Date(query.startDate) : undefined;
        const endDate = query.endDate ? new Date(query.endDate + 'T23:59:59.999Z') : undefined;

        const result = await reportsService.getProfitLossReport({
          startDate,
          endDate,
        });

        set.status = 200;
        return {
          success: true,
          data: result,
        };
      } catch (error) {
        set.status = 500;
        return {
          success: false,
          error: 'Server error',
          message: error instanceof Error ? error.message : 'Failed to fetch profit/loss report',
        };
      }
    },
    {
      beforeHandle: authMiddleware,
      query: t.Object({
        startDate: t.Optional(t.String()),
        endDate: t.Optional(t.String()),
      }),
      detail: {
        tags: ['Reports'],
        summary: 'Get profit and loss report',
        description: 'Get sales profit/loss report including interest costs',
      },
    }
  )
  // ============================================
  // Sales Summary Report
  // ============================================
  .get(
    '/sales-summary',
    async ({ query, set, requester }) => {
      try {
        // Check permission - REPORT_SALES
        if (!authService.hasPermission(requester!.role, 'REPORT_SALES')) {
          set.status = 403;
          return {
            success: false,
            error: 'Forbidden',
            message: 'คุณไม่มีสิทธิ์ดูรายงานนี้',
          };
        }

        const startDate = query.startDate ? new Date(query.startDate) : undefined;
        const endDate = query.endDate ? new Date(query.endDate + 'T23:59:59.999Z') : undefined;

        const result = await reportsService.getSalesSummaryReport({
          startDate,
          endDate,
          status: query.status as any,
          salespersonId: query.salespersonId,
        });

        set.status = 200;
        return {
          success: true,
          data: result,
        };
      } catch (error) {
        set.status = 500;
        return {
          success: false,
          error: 'Server error',
          message: error instanceof Error ? error.message : 'Failed to fetch sales summary report',
        };
      }
    },
    {
      beforeHandle: authMiddleware,
      query: t.Object({
        startDate: t.Optional(t.String()),
        endDate: t.Optional(t.String()),
        status: t.Optional(
          t.Union([
            t.Literal('RESERVED'),
            t.Literal('PREPARING'),
            t.Literal('DELIVERED'),
            t.Literal('COMPLETED'),
            t.Literal('CANCELLED'),
          ])
        ),
        salespersonId: t.Optional(t.String()),
      }),
      detail: {
        tags: ['Reports'],
        summary: 'Get sales summary report',
        description: 'Get sales summary report with breakdown by salesperson and status',
      },
    }
  )
  // ============================================
  // Stock Interest Report
  // ============================================
  .get(
    '/stock-interest',
    async ({ query, set, requester }) => {
      try {
        // Check permission - INTEREST_VIEW
        if (!authService.hasPermission(requester!.role, 'INTEREST_VIEW' as any)) {
          set.status = 403;
          return {
            success: false,
            error: 'Forbidden',
            message: 'คุณไม่มีสิทธิ์ดูรายงานนี้',
          };
        }

        const isCalculating = query.isCalculating === 'true' ? true : 
                              query.isCalculating === 'false' ? false : undefined;

        const result = await reportsService.getStockInterestReport({
          status: query.status as any,
          isCalculating,
          brand: query.brand,
        });

        set.status = 200;
        return {
          success: true,
          data: result,
        };
      } catch (error) {
        set.status = 500;
        return {
          success: false,
          error: 'Server error',
          message: error instanceof Error ? error.message : 'Failed to fetch stock interest report',
        };
      }
    },
    {
      beforeHandle: authMiddleware,
      query: t.Object({
        startDate: t.Optional(t.String()),
        endDate: t.Optional(t.String()),
        status: t.Optional(
          t.Union([
            t.Literal('AVAILABLE'),
            t.Literal('RESERVED'),
            t.Literal('PREPARING'),
            t.Literal('SOLD'),
          ])
        ),
        isCalculating: t.Optional(t.String()),
        brand: t.Optional(t.String()),
      }),
      detail: {
        tags: ['Reports'],
        summary: 'Get stock interest report',
        description: 'Get stock interest report with accumulated interest calculations',
      },
    }
  );
