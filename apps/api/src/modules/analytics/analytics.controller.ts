import { Elysia } from 'elysia';
import { analyticsService } from './analytics.service';
import { authMiddleware } from '../auth/auth.middleware';

export const analyticsRoutes = new Elysia({ prefix: '/analytics' })
  .onBeforeHandle(authMiddleware)
  
  /**
   * Get Dashboard Statistics
   * GET /analytics/dashboard
   */
  .get('/dashboard', async ({ set }) => {
    try {
      const stats = await analyticsService.getDashboardStats();
      return {
        success: true,
        data: stats
      };
    } catch (error) {
      set.status = 500;
      return {
        success: false,
        error: 'Failed to fetch dashboard statistics',
        message: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }, {
    detail: {
      tags: ['Analytics'],
      summary: 'Get dashboard statistics',
      description: 'Get aggregated statistics for stock, sales, and revenue'
    }
  });
