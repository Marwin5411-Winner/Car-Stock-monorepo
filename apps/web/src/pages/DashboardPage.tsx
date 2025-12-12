import React, { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { MainLayout } from '../components/layout';
import { Button } from '../components/ui/button';
import { analyticsService, type DashboardStats } from '../services/analytics.service';
import {
  Car,
  DollarSign,
  TrendingUp,
  Users,
  ShoppingCart,
  CreditCard,
  PlusCircle,
  Clock,
  ArrowRight
} from 'lucide-react';

export const DashboardPage: React.FC = () => {
  const navigate = useNavigate();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    try {
      setLoading(true);
      const data = await analyticsService.getDashboardStats();
      setStats(data);
    } catch (error) {
      console.error('Error fetching dashboard stats:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('th-TH', {
      style: 'currency',
      currency: 'THB',
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const formatDate = (dateString: string) => {
    return new Intl.DateTimeFormat('th-TH', {
      dateStyle: 'medium',
      timeStyle: 'short'
    }).format(new Date(dateString));
  };

  if (loading) {
    return (
      <MainLayout>
        <div className="flex justify-center items-center h-screen">
          <div className="text-xl text-gray-600">กำลังโหลด...</div>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="mb-8">
        <h2 className="text-3xl font-bold text-gray-900 mb-2">Dashboard</h2>
        <p className="text-gray-600">ยินดีต้อนรับสู่ระบบจัดการขายรถยนต์ VBeyond</p>
      </div>

      {/* Main Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {/* Total Sales */}
        <div className="bg-white rounded-lg shadow p-6 border-l-4 border-blue-500">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-sm font-medium text-gray-500 mb-1">ยอดขายทั้งหมด</p>
              <h3 className="text-2xl font-bold text-gray-900">{stats?.sales.totalSales || 0} คัน</h3>
            </div>
            <div className="p-2 bg-blue-100 rounded-lg">
              <ShoppingCart className="h-6 w-6 text-blue-600" />
            </div>
          </div>
          <p className="text-sm text-gray-500 mt-2">
            รอส่งมอบ: <span className="font-semibold text-blue-600">{stats?.sales.activeDeals || 0}</span>
          </p>
        </div>

        {/* Total Revenue */}
        <div className="bg-white rounded-lg shadow p-6 border-l-4 border-green-500">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-sm font-medium text-gray-500 mb-1">รายได้รวม</p>
              <h3 className="text-2xl font-bold text-gray-900">{formatCurrency(stats?.sales.totalRevenue || 0)}</h3>
            </div>
            <div className="p-2 bg-green-100 rounded-lg">
              <DollarSign className="h-6 w-6 text-green-600" />
            </div>
          </div>
          <p className="text-sm text-gray-500 mt-2">
            สำเร็จแล้ว: <span className="font-semibold text-green-600">{stats?.sales.completedDeals || 0}</span>
          </p>
        </div>

        {/* Monthly Revenue */}
        <div className="bg-white rounded-lg shadow p-6 border-l-4 border-purple-500">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-sm font-medium text-gray-500 mb-1">ยอดรับชำระเดือนนี้</p>
              <h3 className="text-2xl font-bold text-gray-900">{formatCurrency(stats?.monthlyRevenue || 0)}</h3>
            </div>
            <div className="p-2 bg-purple-100 rounded-lg">
              <TrendingUp className="h-6 w-6 text-purple-600" />
            </div>
          </div>
          <p className="text-sm text-gray-500 mt-2">
            จากการชำระเงินจริง
          </p>
        </div>

        {/* Stock Status */}
        <div className="bg-white rounded-lg shadow p-6 border-l-4 border-orange-500">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-sm font-medium text-gray-500 mb-1">รถในคลัง</p>
              <h3 className="text-2xl font-bold text-gray-900">{stats?.stock.total || 0} คัน</h3>
            </div>
            <div className="p-2 bg-orange-100 rounded-lg">
              <Car className="h-6 w-6 text-orange-600" />
            </div>
          </div>
          <p className="text-sm text-gray-500 mt-2">
            เข้าใหม่วันนี้: <span className="font-semibold text-orange-600">{stats?.stock.todayInStock || 0}</span>
          </p>
          <div className="flex gap-3 mt-2 text-sm">
            <span className="text-green-600">ว่าง: {stats?.stock.available || 0}</span>
            <span className="text-orange-600">จอง: {stats?.stock.reserved || 0}</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Recent Activity */}
        <div className="lg:col-span-2 bg-white rounded-lg shadow">
          <div className="p-6 border-b border-gray-100 flex justify-between items-center">
            <h3 className="text-lg font-semibold text-gray-900 flex items-center">
              <Clock className="h-5 w-5 mr-2 text-gray-500" />
              กิจกรรมล่าสุด
            </h3>
            <Link to="/sales" className="text-sm text-blue-600 hover:text-blue-700 flex items-center">
              ดูทั้งหมด <ArrowRight className="h-4 w-4 ml-1" />
            </Link>
          </div>
          <div className="p-6">
            <div className="flow-root">
              <ul className="-mb-8">
                {stats?.recentActivity.map((activity, activityIdx) => (
                  <li key={activity.id}>
                    <div className="relative pb-8">
                      {activityIdx !== stats.recentActivity.length - 1 ? (
                        <span className="absolute top-4 left-4 -ml-px h-full w-0.5 bg-gray-200" aria-hidden="true" />
                      ) : null}
                      <div className="relative flex space-x-3">
                        <div>
                          <span className={`h-8 w-8 rounded-full flex items-center justify-center ring-8 ring-white ${activity.type === 'SALE' ? 'bg-blue-500' : 'bg-green-500'
                            }`}>
                            {activity.type === 'SALE' ? (
                              <ShoppingCart className="h-5 w-5 text-white" aria-hidden="true" />
                            ) : (
                              <CreditCard className="h-5 w-5 text-white" aria-hidden="true" />
                            )}
                          </span>
                        </div>
                        <div className="min-w-0 flex-1 pt-1.5 flex justify-between space-x-4">
                          <div>
                            <p className="text-sm text-gray-900">
                              {activity.title} <span className="font-medium text-gray-500">({formatCurrency(activity.amount || 0)})</span>
                            </p>
                            <p className="text-sm text-gray-500">{activity.description}</p>
                          </div>
                          <div className="text-right text-sm whitespace-nowrap text-gray-500">
                            <time dateTime={activity.timestamp}>{formatDate(activity.timestamp)}</time>
                          </div>
                        </div>
                      </div>
                    </div>
                  </li>
                ))}
                {(!stats?.recentActivity || stats.recentActivity.length === 0) && (
                  <p className="text-center text-gray-500 py-4">ไม่มีกิจกรรมล่าสุด</p>
                )}
              </ul>
            </div>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="bg-white rounded-lg shadow">
          <div className="p-6 border-b border-gray-100">
            <h3 className="text-lg font-semibold text-gray-900">การดำเนินการด่วน</h3>
          </div>
          <div className="p-6">
            <div className="space-y-4">
              <Button
                variant="outline"
                className="w-full justify-start h-12 text-base"
                onClick={() => navigate('/sales/new')}
              >
                <PlusCircle className="h-5 w-5 mr-3 text-blue-600" />
                สร้างรายการขายใหม่
              </Button>
              <Button
                variant="outline"
                className="w-full justify-start h-12 text-base"
                onClick={() => navigate('/payments/new')}
              >
                <CreditCard className="h-5 w-5 mr-3 text-green-600" />
                บันทึกการรับเงิน
              </Button>
              <Button
                variant="outline"
                className="w-full justify-start h-12 text-base"
                onClick={() => navigate('/customers/new')}
              >
                <Users className="h-5 w-5 mr-3 text-purple-600" />
                เพิ่มลูกค้าใหม่
              </Button>
              <Button
                variant="outline"
                className="w-full justify-start h-12 text-base"
                onClick={() => navigate('/stock/new')}
              >
                <Car className="h-5 w-5 mr-3 text-orange-600" />
                เพิ่มรถเข้าคลัง
              </Button>
            </div>
          </div>
        </div>
      </div>
    </MainLayout>
  );
};
