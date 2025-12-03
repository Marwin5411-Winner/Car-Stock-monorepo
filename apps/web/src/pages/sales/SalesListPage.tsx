import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { salesService } from '../../services/sales.service';
import type { Sale, SalesStats, SaleStatus, SaleType, SaleFilters } from '../../services/sales.service';
import { MainLayout } from '../../components/layout';
import { 
  Plus, 
  Search, 
  Eye, 
  ShoppingCart, 
  Clock, 
  CheckCircle, 
  Truck,
  Package,
  DollarSign,
  TrendingUp
} from 'lucide-react';
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
  TableContainer,
  TableWrapper,
  TableEmpty,
  TableLoading,
  TablePagination,
} from '@/components/ui/table';

// Updated status labels - removed INQUIRY and QUOTED (now handled by Quotation module)
const STATUS_LABELS: Record<SaleStatus, string> = {
  RESERVED: 'จองแล้ว',
  PREPARING: 'เตรียมส่งมอบ',
  DELIVERED: 'ส่งมอบแล้ว',
  COMPLETED: 'เสร็จสิ้น',
  CANCELLED: 'ยกเลิก',
};

const STATUS_COLORS: Record<SaleStatus, string> = {
  RESERVED: 'bg-yellow-100 text-yellow-800',
  PREPARING: 'bg-purple-100 text-purple-800',
  DELIVERED: 'bg-indigo-100 text-indigo-800',
  COMPLETED: 'bg-green-100 text-green-800',
  CANCELLED: 'bg-red-100 text-red-800',
};

const TYPE_LABELS: Record<SaleType, string> = {
  RESERVATION_SALE: 'ขายผ่านการจอง',
  DIRECT_SALE: 'ขายตรง',
};

export default function SalesListPage() {
  const [sales, setSales] = useState<Sale[]>([]);
  const [stats, setStats] = useState<SalesStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | SaleStatus>('ALL');
  const [typeFilter, setTypeFilter] = useState<'ALL' | SaleType>('ALL');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const limit = 10;
  const navigate = useNavigate();

  const fetchSales = async () => {
    try {
      setLoading(true);
      const filters: SaleFilters = { page, limit };
      if (searchTerm) filters.search = searchTerm;
      if (statusFilter !== 'ALL') filters.status = statusFilter;
      if (typeFilter !== 'ALL') filters.type = typeFilter;

      const response = await salesService.getAll(filters);
      // Handle response structure - API returns { data: [...], meta: {...} }
      setSales(response.data || []);
      setTotalPages(response.meta?.totalPages || 1);
      setTotal(response.meta?.total || 0);
    } catch (error) {
      console.error('Error fetching sales:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const data = await salesService.getStats();
      setStats(data);
    } catch (error) {
      console.error('Error fetching stats:', error);
    }
  };

  useEffect(() => {
    fetchSales();
    fetchStats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, statusFilter, typeFilter]);

  useEffect(() => {
    const delayedSearch = setTimeout(() => {
      setPage(1);
      fetchSales();
    }, 500);

    return () => clearTimeout(delayedSearch);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchTerm]);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('th-TH', {
      style: 'currency',
      currency: 'THB',
      minimumFractionDigits: 0,
    }).format(amount);
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return '-';
    return new Intl.DateTimeFormat('th-TH', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    }).format(new Date(dateString));
  };

  const getVehicleDisplay = (sale: Sale) => {
    if (sale.stock) {
      const vm = sale.stock.vehicleModel;
      return `${vm.brand} ${vm.model}${vm.variant ? ` ${vm.variant}` : ''}`;
    }
    if (sale.vehicleModel) {
      return `${sale.vehicleModel.brand} ${sale.vehicleModel.model}${sale.vehicleModel.variant ? ` ${sale.vehicleModel.variant}` : ''} (ระบุรุ่น)`;
    }
    return '-';
  };

  return (
    <MainLayout>
      <div className="mb-6">
        <div className="flex justify-between items-center mb-4">
          <h1 className="text-2xl font-bold text-gray-900">จัดการการขาย</h1>
          <Link
            to="/sales/new"
            className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Plus className="w-5 h-5 mr-2" />
            สร้างการขายใหม่
          </Link>
        </div>

        {/* Stats Cards - Updated for new flow without INQUIRY/QUOTED */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4 mb-4">
          <div className="bg-white rounded-lg shadow p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-gray-700">ทั้งหมด</p>
                <p className="text-xl font-bold text-gray-900">{stats?.totalSales || 0}</p>
              </div>
              <ShoppingCart className="h-6 w-6 text-blue-600" />
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-gray-700">จองแล้ว</p>
                <p className="text-xl font-bold text-yellow-600">{stats?.reservedSales || 0}</p>
              </div>
              <Clock className="h-6 w-6 text-yellow-600" />
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-gray-700">เตรียมส่ง</p>
                <p className="text-xl font-bold text-purple-600">{stats?.preparingSales || 0}</p>
              </div>
              <Package className="h-6 w-6 text-purple-600" />
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-gray-700">ส่งมอบแล้ว</p>
                <p className="text-xl font-bold text-indigo-600">{stats?.deliveredSales || 0}</p>
              </div>
              <Truck className="h-6 w-6 text-indigo-600" />
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-gray-700">เสร็จสิ้น</p>
                <p className="text-xl font-bold text-green-600">{stats?.completedSales || 0}</p>
              </div>
              <CheckCircle className="h-6 w-6 text-green-600" />
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-gray-700">ยอดรวม</p>
                <p className="text-lg font-bold text-blue-600">
                  {stats ? new Intl.NumberFormat('th-TH', {
                    notation: 'compact',
                    compactDisplay: 'short',
                  }).format(stats.totalRevenue) : '--'}
                </p>
              </div>
              <DollarSign className="h-6 w-6 text-blue-600" />
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-gray-700">ค้างรับ</p>
                <p className="text-lg font-bold text-red-600">
                  {stats ? new Intl.NumberFormat('th-TH', {
                    notation: 'compact',
                    compactDisplay: 'short',
                  }).format(stats.totalRemaining) : '--'}
                </p>
              </div>
              <TrendingUp className="h-6 w-6 text-red-600" />
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="flex gap-4 mb-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="ค้นหาเลขที่ขาย, ชื่อลูกค้า, รหัสลูกค้า..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value as 'ALL' | SaleStatus);
              setPage(1);
            }}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="ALL">ทุกสถานะ</option>
            {Object.entries(STATUS_LABELS).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
          <select
            value={typeFilter}
            onChange={(e) => {
              setTypeFilter(e.target.value as 'ALL' | SaleType);
              setPage(1);
            }}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="ALL">ทุกประเภท</option>
            {Object.entries(TYPE_LABELS).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </div>

        {/* Sales Table */}
        <TableContainer>
          <TableWrapper>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>เลขที่ขาย</TableHead>
                  <TableHead>ลูกค้า</TableHead>
                  <TableHead>รถยนต์</TableHead>
                  <TableHead>ประเภท</TableHead>
                  <TableHead>ยอดรวม</TableHead>
                  <TableHead>ค้างชำระ</TableHead>
                  <TableHead>สถานะ</TableHead>
                  <TableHead>วันที่สร้าง</TableHead>
                  <TableHead className="text-right">จัดการ</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-12">
                      <TableLoading />
                    </TableCell>
                  </TableRow>
                ) : sales.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9}>
                      <TableEmpty
                        icon={<ShoppingCart className="h-12 w-12" />}
                        title="ไม่พบข้อมูลการขาย"
                        description="เริ่มต้นด้วยการสร้างการขายใหม่"
                      />
                    </TableCell>
                  </TableRow>
                ) : (
                  sales.map((sale) => (
                    <TableRow 
                      key={sale.id} 
                      className="cursor-pointer" 
                      onClick={() => navigate(`/sales/${sale.id}`)}
                    >
                      <TableCell>
                        <div className="text-sm font-medium text-blue-600">
                          {sale.saleNumber}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm font-medium text-gray-900">
                          {sale.customer.name}
                        </div>
                        <div className="text-xs text-gray-500">{sale.customer.code}</div>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm text-gray-900">
                          {getVehicleDisplay(sale)}
                        </div>
                        {sale.stock && (
                          <div className="text-xs text-gray-500">VIN: {sale.stock.vin.slice(-8)}</div>
                        )}
                      </TableCell>
                      <TableCell>
                        <span className="text-sm text-gray-700">
                          {TYPE_LABELS[sale.type]}
                        </span>
                      </TableCell>
                      <TableCell className="font-medium text-gray-900">
                        {formatCurrency(sale.totalAmount)}
                      </TableCell>
                      <TableCell>
                        <span className={`text-sm font-medium ${sale.remainingAmount > 0 ? 'text-red-600' : 'text-green-600'}`}>
                          {formatCurrency(sale.remainingAmount)}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span
                          className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${
                            STATUS_COLORS[sale.status]
                          }`}
                        >
                          {STATUS_LABELS[sale.status]}
                        </span>
                      </TableCell>
                      <TableCell className="text-gray-600">
                        {formatDate(sale.createdAt)}
                      </TableCell>
                      <TableCell className="text-right">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate(`/sales/${sale.id}`);
                          }}
                          className="inline-flex items-center justify-center p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                          title="ดูรายละเอียด"
                        >
                          <Eye className="h-4 w-4" />
                        </button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableWrapper>

          {/* Pagination */}
          {totalPages > 1 && (
            <TablePagination
              page={page}
              totalPages={totalPages}
              total={total}
              limit={limit}
              onPageChange={setPage}
            />
          )}
        </TableContainer>
      </div>
    </MainLayout>
  );
}
