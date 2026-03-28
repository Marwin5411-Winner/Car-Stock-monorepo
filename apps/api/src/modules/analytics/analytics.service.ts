import { db } from '../../lib/db';
import { DashboardStats, ActivityItem } from './types';

export class AnalyticsService {
  private static instance: AnalyticsService;

  private constructor() {}

  public static getInstance(): AnalyticsService {
    if (!AnalyticsService.instance) {
      AnalyticsService.instance = new AnalyticsService();
    }
    return AnalyticsService.instance;
  }

  /**
   * Get aggregated dashboard statistics
   */
  async getDashboardStats(): Promise<DashboardStats> {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    // Run all independent queries in parallel — was 8+ sequential queries, now 4 parallel
    const [stockByStatus, todayInStock, salesAgg, activeDeals, completedDeals, monthlyRevenueObj, recentSales, recentPayments] = await Promise.all([
      // 1. Stock counts by status in single query (replaces 4 separate counts)
      db.stock.groupBy({
        by: ['status'],
        _count: true,
        where: { deletedAt: null },
      }),
      db.stock.count({ where: { createdAt: { gte: startOfToday }, deletedAt: null } }),
      // 2. Sales aggregate
      db.sale.aggregate({ _count: { id: true }, _sum: { totalAmount: true } }),
      db.sale.count({ where: { status: { in: ['RESERVED', 'PREPARING'] } } }),
      db.sale.count({ where: { status: { in: ['DELIVERED', 'COMPLETED'] } } }),
      // 3. Monthly revenue
      db.payment.aggregate({
        _sum: { amount: true },
        where: { paymentDate: { gte: startOfMonth, lte: endOfMonth }, status: 'ACTIVE' },
      }),
      // 4. Recent activity (fetched in parallel)
      db.sale.findMany({
        take: 5,
        orderBy: { createdAt: 'desc' },
        include: { customer: true, stock: { include: { vehicleModel: true } } },
      }),
      db.payment.findMany({
        take: 5,
        orderBy: { createdAt: 'desc' },
        where: { status: 'ACTIVE' },
        include: { customer: true },
      }),
    ]);

    // Parse stock counts from groupBy result
    const stockCounts = Object.fromEntries(stockByStatus.map(s => [s.status, s._count]));
    const totalStock = Object.values(stockCounts).reduce((a, b) => a + b, 0);
    const availableStock = stockCounts['AVAILABLE'] || 0;
    const reservedStock = stockCounts['RESERVED'] || 0;
    const soldStock = stockCounts['SOLD'] || 0;

    const totalSalesObj = salesAgg;

    // Transform and sort activities
    const activities: ActivityItem[] = [
      ...recentSales.map(sale => {
        const amount = Number(sale.totalAmount);
        const description = sale.stock 
          ? `${sale.customer.name} - ${sale.stock.vehicleModel.brand} ${sale.stock.vehicleModel.model}`
          : `${sale.customer.name} - (No Car Assigned)`;
          
        return {
          id: sale.id,
          type: 'SALE' as const,
          title: `การขายใหม่: ${sale.saleNumber}`,
          description,
          amount,
          timestamp: sale.createdAt,
          metadata: { saleId: sale.id }
        };
      }),
      ...recentPayments.map(payment => {
        const amount = Number(payment.amount);
        return {
          id: payment.id,
          type: 'PAYMENT' as const,
          title: `ได้รับชำระเงิน: ${payment.receiptNumber}`,
          description: `${payment.customer.name} (${payment.paymentType})`,
          amount,
          timestamp: payment.createdAt,
          metadata: { paymentId: payment.id }
        };
      })
    ].sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime()).slice(0, 10);

    return {
      stock: {
        total: totalStock,
        available: availableStock,
        reserved: reservedStock,
        sold: soldStock,
        todayInStock
      },
      sales: {
        totalSales: totalSalesObj._count.id,
        totalRevenue: Number(totalSalesObj._sum.totalAmount || 0),
        activeDeals,
        completedDeals
      },
      monthlyRevenue: Number(monthlyRevenueObj._sum.amount || 0),
      recentActivity: activities
    };
  }
}

export const analyticsService = AnalyticsService.getInstance();
