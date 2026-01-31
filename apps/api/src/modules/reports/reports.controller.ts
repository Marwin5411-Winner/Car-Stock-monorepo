import { Elysia, t } from 'elysia';
import { reportsService } from './reports.service';
import { authMiddleware, requirePermission } from '../auth/auth.middleware';
import { authService } from '../auth/auth.service';
import { pdfService } from '../pdf/pdf.service';
import { formatThaiDate } from '../pdf/helpers';
import '../../types/context.d';
import { db } from '../../lib/db';

// Helper to get company header from settings or default
async function getCompanyHeader(): Promise<any> {
  const settings = await db.companySettings.findFirst();
  if (settings) {
    return {
      logoBase64: settings.logo || '', 
      companyName: settings.companyNameTh,
      address1: settings.addressTh,
      address2: '', 
      phone: `โทร. ${settings.phone} ${settings.fax ? `โทรสาร. ${settings.fax}` : ''}`,
    };
  }
  
  return {
    logoBase64: '',
    companyName: 'บริษัท วีบียอนด์ อินโนเวชั่น จำกัด',
    address1: '438/288 ถนนมิตรภาพ-หนองคาย ตำบลในเมือง',
    address2: 'อำเภอเมือง จังหวัดนครราชสีมา 30000',
    phone: 'โทร. 044-272-888 โทรสาร. 044-271-224',
  };
}


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
  .get(
    '/daily-payments/pdf',
    async ({ query, set, requester }) => {
      try {
        if (!authService.hasPermission(requester!.role, 'REPORT_FINANCE')) {
          set.status = 403;
          return 'Forbidden';
        }

        const startDate = query.startDate ? new Date(query.startDate) : undefined;
        const endDate = query.endDate ? new Date(query.endDate + 'T23:59:59.999Z') : undefined;

        const result = await reportsService.getDailyPaymentReport({ startDate, endDate });
        
        const dateRange = startDate && endDate 
          ? `${formatThaiDate(startDate, 'short')} - ${formatThaiDate(endDate, 'short')}` 
          : `ทั้งหมด`;
        
        const header = await getCompanyHeader();
        if (!header.logoBase64) header.logoBase64 = pdfService.getLogoBase64();

        const pdfBuffer = await pdfService.generateDailyPaymentReport({
          header,
          dateRange,
          payments: result.payments,
          summary: result.summary,
        });

        set.headers['Content-Type'] = 'application/pdf';
        set.headers['Content-Disposition'] = `attachment; filename="daily-payment-report.pdf"`;
        
        return pdfBuffer;
      } catch (error) {
        console.error('PDF generation error:', error);
        set.status = 500;
        return 'Failed to generate PDF';
      }
    },
    {
      beforeHandle: authMiddleware,
      query: t.Object({
        startDate: t.Optional(t.String()),
        endDate: t.Optional(t.String()),
      }),
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
  .get(
    '/stock/pdf',
    async ({ query, set, requester }) => {
      try {
        if (!authService.hasPermission(requester!.role, 'REPORT_STOCK')) {
          set.status = 403;
          return 'Forbidden';
        }

        const result = await reportsService.getStockReport({ status: query.status as any });
        
        const dateRange = `ข้อมูล ณ วันที่ ${formatThaiDate(new Date(), 'full')}`;

        const header = await getCompanyHeader();
        if (!header.logoBase64) header.logoBase64 = pdfService.getLogoBase64();

        const pdfBuffer = await pdfService.generateStockReport({
          header,
          dateRange,
          stocks: result.stocks,
          summary: result.summary,
        });

        set.headers['Content-Type'] = 'application/pdf';
        set.headers['Content-Disposition'] = `attachment; filename="stock-report.pdf"`;
        
        return pdfBuffer;
      } catch (error) {
        console.error('PDF generation error:', error);
        set.status = 500;
        return 'Failed to generate PDF';
      }
    },
    {
      beforeHandle: authMiddleware,
      query: t.Object({
        startDate: t.Optional(t.String()),
        endDate: t.Optional(t.String()),
        status: t.Optional(t.String()), // simplifying for pdf endpoint
      }),
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
  .get(
    '/profit-loss/pdf',
    async ({ query, set, requester }) => {
      try {
        if (!authService.hasPermission(requester!.role, 'REPORT_SALES')) {
          set.status = 403;
          return 'Forbidden';
        }

        const startDate = query.startDate ? new Date(query.startDate) : undefined;
        const endDate = query.endDate ? new Date(query.endDate + 'T23:59:59.999Z') : undefined;

        const result = await reportsService.getProfitLossReport({ startDate, endDate });
        
        const dateRange = startDate && endDate 
          ? `${formatThaiDate(startDate, 'short')} - ${formatThaiDate(endDate, 'short')}` 
          : `ทั้งหมด`;

        const header = await getCompanyHeader();
        if (!header.logoBase64) header.logoBase64 = pdfService.getLogoBase64();

        const pdfBuffer = await pdfService.generateProfitLossReport({
          header,
          dateRange,
          items: result.items,
          summary: result.summary,
        });

        set.headers['Content-Type'] = 'application/pdf';
        set.headers['Content-Disposition'] = `attachment; filename="profit-loss-report.pdf"`;
        
        return pdfBuffer;
      } catch (error) {
        console.error('PDF generation error:', error);
        set.status = 500;
        return 'Failed to generate PDF';
      }
    },
    {
      beforeHandle: authMiddleware,
      query: t.Object({
        startDate: t.Optional(t.String()),
        endDate: t.Optional(t.String()),
      }),
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
  .get(
    '/sales-summary/pdf',
    async ({ query, set, requester }) => {
      try {
        if (!authService.hasPermission(requester!.role, 'REPORT_SALES')) {
          set.status = 403;
          return 'Forbidden';
        }

        const startDate = query.startDate ? new Date(query.startDate) : undefined;
        const endDate = query.endDate ? new Date(query.endDate + 'T23:59:59.999Z') : undefined;

        const result = await reportsService.getSalesSummaryReport({
          startDate,
          endDate,
          status: query.status as any,
          salespersonId: query.salespersonId,
        });
        
        const dateRange = startDate && endDate 
          ? `${formatThaiDate(startDate, 'short')} - ${formatThaiDate(endDate, 'short')}` 
          : `ทั้งหมด`;

        const header = await getCompanyHeader();
        if (!header.logoBase64) header.logoBase64 = pdfService.getLogoBase64();

        const pdfBuffer = await pdfService.generateSalesSummaryReport({
          header,
          dateRange,
          sales: result.sales,
          summary: result.summary,
          bySalesperson: result.bySalesperson,
        });

        set.headers['Content-Type'] = 'application/pdf';
        set.headers['Content-Disposition'] = `attachment; filename="sales-summary-report.pdf"`;
        
        return pdfBuffer;
      } catch (error) {
        console.error('PDF generation error:', error);
        set.status = 500;
        return 'Failed to generate PDF';
      }
    },
    {
      beforeHandle: authMiddleware,
      query: t.Object({
        startDate: t.Optional(t.String()),
        endDate: t.Optional(t.String()),
        status: t.Optional(t.String()),
        salespersonId: t.Optional(t.String()),
      }),
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
  )
  .get(
    '/stock-interest/pdf',
    async ({ query, set, requester }) => {
      try {
        if (!authService.hasPermission(requester!.role, 'INTEREST_VIEW' as any)) {
          set.status = 403;
          return 'Forbidden';
        }

        const isCalculating = query.isCalculating === 'true' ? true : 
                              query.isCalculating === 'false' ? false : undefined;

        const result = await reportsService.getStockInterestReport({
          status: query.status as any,
          isCalculating,
          brand: query.brand,
        });
        
        const dateRange = `ข้อมูล ณ วันที่ ${formatThaiDate(new Date(), 'full')}`;

        const header = await getCompanyHeader();
        if (!header.logoBase64) header.logoBase64 = pdfService.getLogoBase64();

        const pdfBuffer = await pdfService.generateStockInterestReport({
          header,
          dateRange,
          stocks: result.stocks,
          summary: result.summary,
        });

        set.headers['Content-Type'] = 'application/pdf';
        set.headers['Content-Disposition'] = `attachment; filename="stock-interest-report.pdf"`;
        
        return pdfBuffer;
      } catch (error) {
        console.error('PDF generation error:', error);
        set.status = 500;
        return 'Failed to generate PDF';
      }
    },
    {
      beforeHandle: authMiddleware,
      query: t.Object({
        startDate: t.Optional(t.String()),
        endDate: t.Optional(t.String()),
        status: t.Optional(t.String()),
        isCalculating: t.Optional(t.String()),
        brand: t.Optional(t.String()),
      }),
    }
  );
