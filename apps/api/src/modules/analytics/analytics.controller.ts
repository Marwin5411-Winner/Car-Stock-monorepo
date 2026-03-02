import { Elysia } from 'elysia';
import { analyticsService } from './analytics.service';
import { authMiddleware } from '../auth/auth.middleware';

export const analyticsRoutes = new Elysia({ prefix: '/analytics' })
  .onBeforeHandle(authMiddleware)

  /**
   * Get Dashboard Statistics
   * GET /analytics/dashboard
   */
  .get('/dashboard', async () => {
    const stats = await analyticsService.getDashboardStats();
    return {
      success: true,
      data: stats
    };
  }, {
    detail: {
      tags: ['Analytics'],
      summary: 'Get dashboard statistics',
      description: 'Get aggregated statistics for stock, sales, and revenue'
    }
  });
