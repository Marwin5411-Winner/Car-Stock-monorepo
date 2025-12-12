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
    // 1. Stock Stats
    const totalStock = await db.stock.count();
    const availableStock = await db.stock.count({ where: { status: 'AVAILABLE' } });
    const reservedStock = await db.stock.count({ where: { status: 'RESERVED' } });
    const soldStock = await db.stock.count({ where: { status: 'SOLD' } });

    // Calculate Today In-Stock
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayInStock = await db.stock.count({
      where: {
        createdAt: {
          gte: startOfToday
        }
      }
    });

    // 2. Sales Stats
    const totalSalesObj = await db.sale.aggregate({
      _count: { id: true },
      _sum: { totalAmount: true },
    });

    const activeDeals = await db.sale.count({
      where: {
        status: { in: ['RESERVED', 'PREPARING'] }
      }
    });

    const completedDeals = await db.sale.count({
      where: { status: { in: ['DELIVERED', 'COMPLETED'] } }
    });

    // 3. Monthly Revenue (Current Month)
    // now is already declared above
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    // Calculate revenue based on actual payments received in this month
    const monthlyRevenueObj = await db.payment.aggregate({
      _sum: { amount: true },
      where: {
        paymentDate: {
          gte: startOfMonth,
          lte: endOfMonth
        },
        status: 'ACTIVE'
      }
    });

    // 4. Recent Activity (Combine latest Sales and Payments)
    const recentSales = await db.sale.findMany({
      take: 5,
      orderBy: { createdAt: 'desc' },
      include: { customer: true, stock: { include: { vehicleModel: true } } }
    });

    const recentPayments = await db.payment.findMany({
      take: 5,
      orderBy: { createdAt: 'desc' },
      where: { status: 'ACTIVE' },
      include: { customer: true }
    });

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
