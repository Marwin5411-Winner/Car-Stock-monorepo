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
  monthlyRevenue: number; // For the current month
  recentActivity: ActivityItem[];
}

export interface ActivityItem {
  id: string;
  type: 'SALE' | 'PAYMENT' | 'STOCK_IN';
  title: string;
  description: string;
  amount?: number;
  timestamp: Date;
  metadata?: any;
}

export interface SalesTrendItem {
  date: string; // YYYY-MM-DD
  amount: number;
  count: number;
}
