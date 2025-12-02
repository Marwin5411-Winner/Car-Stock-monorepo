import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { interestService } from '../../services/interest.service';
import type { InterestSummary, InterestStats } from '../../services/interest.service';
import { MainLayout } from '../../components/layout';
import { 
  Search, 
  Eye,
  TrendingUp,
  Calendar,
  DollarSign,
  Percent,
  PlayCircle,
  PauseCircle,
  AlertCircle
} from 'lucide-react';

export default function InterestListPage() {
  const [interests, setInterests] = useState<InterestSummary[]>([]);
  const [stats, setStats] = useState<InterestStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'AVAILABLE' | 'RESERVED' | 'PREPARING' | 'SOLD'>('ALL');
  const [calculatingFilter, setCalculatingFilter] = useState<'ALL' | 'ACTIVE' | 'STOPPED'>('ALL');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const limit = 15;

  useEffect(() => {
    fetchInterests();
    fetchStats();
  }, [page, statusFilter, calculatingFilter]);

  useEffect(() => {
    const delayedSearch = setTimeout(() => {
      setPage(1);
      fetchInterests();
    }, 500);

    return () => clearTimeout(delayedSearch);
  }, [searchTerm]);

  const fetchInterests = async () => {
    try {
      setLoading(true);
      const filters: any = { page, limit };
      if (searchTerm) filters.search = searchTerm;
      if (statusFilter !== 'ALL') filters.status = statusFilter;
      if (calculatingFilter === 'ACTIVE') filters.isCalculating = true;
      if (calculatingFilter === 'STOPPED') filters.isCalculating = false;

      const response = await interestService.getAll(filters);
      setInterests(response?.data || []);
      setTotalPages(response?.meta?.totalPages || 1);
      setTotal(response?.meta?.total || 0);
    } catch (error) {
      console.error('Error fetching interest data:', error);
      setInterests([]);
      setTotalPages(1);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const data = await interestService.getStats();
      setStats(data);
    } catch (error) {
      console.error('Error fetching stats:', error);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('th-TH', {
      style: 'currency',
      currency: 'THB',
      minimumFractionDigits: 2,
    }).format(amount);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('th-TH', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const getStatusBadge = (status: string) => {
    const statusConfig: Record<string, { label: string; className: string }> = {
      AVAILABLE: { label: 'พร้อมขาย', className: 'bg-green-100 text-green-800' },
      RESERVED: { label: 'จองแล้ว', className: 'bg-yellow-100 text-yellow-800' },
      PREPARING: { label: 'เตรียมส่งมอบ', className: 'bg-blue-100 text-blue-800' },
      SOLD: { label: 'ขายแล้ว', className: 'bg-gray-100 text-gray-800' },
    };
    const config = statusConfig[status] || { label: status, className: 'bg-gray-100 text-gray-800' };
    return (
      <span className={`px-2 py-1 text-xs font-medium rounded-full ${config.className}`}>
        {config.label}
      </span>
    );
  };

  const getCalculatingBadge = (isCalculating: boolean) => {
    if (isCalculating) {
      return (
        <span className="inline-flex items-center px-2 py-1 text-xs font-medium rounded-full bg-green-100 text-green-800">
          <PlayCircle className="w-3 h-3 mr-1" />
          กำลังคิด
        </span>
      );
    }
    return (
      <span className="inline-flex items-center px-2 py-1 text-xs font-medium rounded-full bg-red-100 text-red-800">
        <PauseCircle className="w-3 h-3 mr-1" />
        หยุดแล้ว
      </span>
    );
  };

  return (
    <MainLayout>
      <div className="mb-6">
        <div className="flex justify-between items-center mb-4">
          <h1 className="text-2xl font-bold text-gray-900">จัดการดอกเบี้ย Stock</h1>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-6">
          <div className="bg-white rounded-lg shadow p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Stock ทั้งหมด</p>
                <p className="text-2xl font-bold text-gray-900">
                  {stats?.totalStocksWithInterest || 0}
                </p>
              </div>
              <div className="p-3 bg-blue-100 rounded-full">
                <TrendingUp className="w-6 h-6 text-blue-600" />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">กำลังคิดดอกเบี้ย</p>
                <p className="text-2xl font-bold text-green-600">
                  {stats?.activeCalculations || 0}
                </p>
              </div>
              <div className="p-3 bg-green-100 rounded-full">
                <PlayCircle className="w-6 h-6 text-green-600" />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">หยุดคิดดอกเบี้ย</p>
                <p className="text-2xl font-bold text-red-600">
                  {stats?.stoppedCalculations || 0}
                </p>
              </div>
              <div className="p-3 bg-red-100 rounded-full">
                <PauseCircle className="w-6 h-6 text-red-600" />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">ดอกเบี้ยสะสมรวม</p>
                <p className="text-xl font-bold text-orange-600">
                  {formatCurrency(stats?.totalAccumulatedInterest || 0)}
                </p>
              </div>
              <div className="p-3 bg-orange-100 rounded-full">
                <DollarSign className="w-6 h-6 text-orange-600" />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">อัตราเฉลี่ย</p>
                <p className="text-2xl font-bold text-purple-600">
                  {stats?.averageRate?.toFixed(2) || '0.00'}%
                </p>
              </div>
              <div className="p-3 bg-purple-100 rounded-full">
                <Percent className="w-6 h-6 text-purple-600" />
              </div>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-lg shadow p-4 mb-6">
          <div className="flex flex-wrap gap-4">
            <div className="flex-1 min-w-64">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                <input
                  type="text"
                  placeholder="ค้นหา VIN, ยี่ห้อ, รุ่น..."
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
            </div>
            <div>
              <select
                className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value as any);
                  setPage(1);
                }}
              >
                <option value="ALL">สถานะทั้งหมด</option>
                <option value="AVAILABLE">พร้อมขาย</option>
                <option value="RESERVED">จองแล้ว</option>
                <option value="PREPARING">เตรียมส่งมอบ</option>
                <option value="SOLD">ขายแล้ว</option>
              </select>
            </div>
            <div>
              <select
                className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                value={calculatingFilter}
                onChange={(e) => {
                  setCalculatingFilter(e.target.value as any);
                  setPage(1);
                }}
              >
                <option value="ALL">ดอกเบี้ยทั้งหมด</option>
                <option value="ACTIVE">กำลังคิดดอกเบี้ย</option>
                <option value="STOPPED">หยุดคิดดอกเบี้ย</option>
              </select>
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    รถยนต์
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    สถานะ
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    วันเริ่มคิดดอกเบี้ย
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    จำนวนวัน
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    อัตราดอกเบี้ย
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    เงินต้น
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    ดอกเบี้ยสะสม
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    สถานะดอกเบี้ย
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    จัดการ
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {loading ? (
                  <tr>
                    <td colSpan={9} className="px-6 py-12 text-center">
                      <div className="flex justify-center items-center">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                        <span className="ml-2 text-gray-500">กำลังโหลด...</span>
                      </div>
                    </td>
                  </tr>
                ) : interests.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-6 py-12 text-center text-gray-500">
                      <AlertCircle className="w-12 h-12 mx-auto mb-2 text-gray-400" />
                      ไม่พบข้อมูล
                    </td>
                  </tr>
                ) : (
                  interests.map((item) => (
                    <tr key={item.stockId} className="hover:bg-gray-50">
                      <td className="px-6 py-4">
                        <div>
                          <div className="font-medium text-gray-900">
                            {item.vehicleModel.brand} {item.vehicleModel.model}
                          </div>
                          <div className="text-sm text-gray-500">
                            {item.vehicleModel.variant} • {item.vehicleModel.year}
                          </div>
                          <div className="text-xs text-gray-400 font-mono">
                            VIN: {item.vin}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        {getStatusBadge(item.status)}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500">
                        <div className="flex items-center">
                          <Calendar className="w-4 h-4 mr-1" />
                          {formatDate(item.interestStartDate)}
                        </div>
                        {item.orderDate && (
                          <div className="text-xs text-gray-400 mt-1">
                            (สั่งซื้อ)
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4 text-right text-sm">
                        <span className="font-medium text-gray-900">{item.daysCount}</span>
                        <span className="text-gray-500"> วัน</span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <span className="font-medium text-purple-600">
                          {item.currentRate.toFixed(2)}%
                        </span>
                        <div className="text-xs text-gray-500">
                          {item.principalBase === 'BASE_COST_ONLY' ? 'ทุนฐาน' : 'ทุนรวม'}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right text-sm text-gray-900">
                        {formatCurrency(item.principalAmount)}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <span className="font-bold text-orange-600">
                          {formatCurrency(item.totalAccumulatedInterest)}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-center">
                        {getCalculatingBadge(item.isCalculating)}
                      </td>
                      <td className="px-6 py-4 text-center">
                        <Link
                          to={`/interest/${item.stockId}`}
                          className="inline-flex items-center px-3 py-1.5 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition-colors"
                        >
                          <Eye className="w-4 h-4 mr-1" />
                          ดูรายละเอียด
                        </Link>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="bg-gray-50 px-6 py-4 border-t border-gray-200">
              <div className="flex items-center justify-between">
                <div className="text-sm text-gray-700">
                  แสดง {(page - 1) * limit + 1} - {Math.min(page * limit, total)} จาก {total} รายการ
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setPage(page - 1)}
                    disabled={page === 1}
                    className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    ก่อนหน้า
                  </button>
                  <span className="px-4 py-2 text-sm text-gray-700">
                    หน้า {page} / {totalPages}
                  </span>
                  <button
                    onClick={() => setPage(page + 1)}
                    disabled={page === totalPages}
                    className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    ถัดไป
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </MainLayout>
  );
}
