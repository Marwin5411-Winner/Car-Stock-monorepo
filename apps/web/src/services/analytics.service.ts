import { api } from '../lib/api';

export interface DashboardStats {
  stock: {
    total: number;
    available: number;
    reserved: number;
    sold: number;
    todayInStock: number;
  };
  sales: {
    totalSales: number;
    totalRevenue: number;
    activeDeals: number;
    completedDeals: number;
  };
  monthlyRevenue: number;
  recentActivity: ActivityItem[];
}

export interface ActivityItem {
  id: string;
  type: 'SALE' | 'PAYMENT' | 'STOCK_IN';
  title: string;
  description: string;
  amount?: number;
  timestamp: string; // API returns Date as string
  metadata?: any;
}

class AnalyticsService {
  private baseUrl = '/api/analytics';

  async getDashboardStats(): Promise<DashboardStats> {
    const response = await api.get<{ success: boolean; data: DashboardStats }>(`${this.baseUrl}/dashboard`);
    return response.data;
  }
}

export const analyticsService = new AnalyticsService();
