import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { stockService } from '../../services/stock.service';
import type { Stock, StockStats } from '../../services/stock.service';
import { MainLayout } from '../../components/layout';
import { Plus, Search, Edit, Trash2, Package, Car, Calendar, DollarSign, TrendingUp } from 'lucide-react';
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

export default function StockListPage() {
  const [stocks, setStocks] = useState<Stock[]>([]);
  const [stats, setStats] = useState<StockStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'AVAILABLE' | 'RESERVED' | 'PREPARING' | 'SOLD'>('ALL');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const limit = 10;

  useEffect(() => {
    fetchStocks();
    fetchStats();
  }, [page, statusFilter]);

  useEffect(() => {
    const delayedSearch = setTimeout(() => {
      setPage(1);
      fetchStocks();
    }, 500);

    return () => clearTimeout(delayedSearch);
  }, [searchTerm]);

  const fetchStocks = async () => {
    try {
      setLoading(true);
      const filters: any = { page, limit };
      if (searchTerm) filters.search = searchTerm;
      if (statusFilter !== 'ALL') filters.status = statusFilter;

      const response = await stockService.getAll(filters);

      // Safely access response properties with fallbacks
      setStocks(response?.data || []);
      setTotalPages(response?.meta?.totalPages || 1);
      setTotal(response?.meta?.total || 0);
    } catch (error) {
      console.error('Error fetching stock:', error);
      // Set safe defaults on error
      setStocks([]);
      setTotalPages(1);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const data = await stockService.getStats();
      setStats(data);
    } catch (error) {
      console.error('Error fetching stats:', error);
    }
  };

  const handleDelete = async (id: string, vin: string) => {
    if (!window.confirm(`คุณต้องการลบ Stock VIN "${vin}" หรือไม่?`)) {
      return;
    }

    try {
      await stockService.delete(id);
      fetchStocks();
      fetchStats();
    } catch (error) {
      console.error('Error deleting stock:', error);
      alert('ไม่สามารถลบ Stock ได้');
    }
  };

  return (
    <MainLayout>
      <div className="mb-6">
        <div className="flex justify-between items-center mb-4">
          <h1 className="text-2xl font-bold text-gray-900">จัดการ Stock</h1>
          <Link
            to="/stock/new"
            className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Plus className="w-5 h-5 mr-2" />
            เพิ่ม Stock ใหม่
          </Link>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-4">
          <div className="bg-white rounded-lg shadow p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Stock ทั้งหมด</p>
                <p className="text-2xl font-bold text-gray-900">{stats?.totalStock || 0}</p>
              </div>
              <Package className="h-8 w-8 text-blue-600" />
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">พร้อมขาย</p>
                <p className="text-2xl font-bold text-green-600">{stats?.availableStock || 0}</p>
              </div>
              <Car className="h-8 w-8 text-green-600" />
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">จองแล้ว</p>
                <p className="text-2xl font-bold text-yellow-600">{stats?.reservedStock || 0}</p>
              </div>
              <Calendar className="h-8 w-8 text-yellow-600" />
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">ขายแล้ว</p>
                <p className="text-2xl font-bold text-gray-600">{stats?.soldStock || 0}</p>
              </div>
              <DollarSign className="h-8 w-8 text-gray-600" />
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">มูลค่ารวม</p>
                <p className="text-xl font-bold text-purple-600">
                  {stats ? new Intl.NumberFormat('th-TH', {
                    style: 'currency',
                    currency: 'THB',
                    notation: 'compact',
                  }).format(stats.totalValue) : '--'}
                </p>
              </div>
              <TrendingUp className="h-8 w-8 text-purple-600" />
            </div>
          </div>
        </div>

        <div className="flex gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="ค้นหา Stock (VIN, ยี่ห้อ, รุ่น, สี)"
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <select
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
          >
            <option value="ALL">สถานะทั้งหมด</option>
            <option value="AVAILABLE">พร้อมขาย</option>
            <option value="RESERVED">จองแล้ว</option>
            <option value="PREPARING">เตรียมขาย</option>
            <option value="SOLD">ขายแล้ว</option>
          </select>
        </div>
      </div>

      {loading ? (
        <TableContainer>
          <TableLoading />
        </TableContainer>
      ) : (
        <>
          <TableContainer>
            <TableWrapper>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Stock</TableHead>
                    <TableHead>รถยนต์</TableHead>
                    <TableHead>สี</TableHead>
                    <TableHead>วันที่เข้า</TableHead>
                    <TableHead>ดอกเบี้ยสะสม</TableHead>
                    <TableHead>สถานะ</TableHead>
                    <TableHead className="text-right">จัดการ</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(stocks || []).map((stock) => (
                    <TableRow key={stock.id}>
                      <TableCell>
                        <div className="text-sm font-medium text-gray-900">{stock.vin}</div>
                        {stock.parkingSlot && (
                          <div className="text-sm text-gray-500">Slot: {stock.parkingSlot}</div>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="text-sm font-medium text-gray-900">
                          {stock.vehicleModel.brand} {stock.vehicleModel.model} {stock.vehicleModel.variant || ''}
                        </div>
                        <div className="text-sm text-gray-500">
                          ปี {stock.vehicleModel.year}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm text-gray-900">
                          {stock.exteriorColor}
                        </div>
                        {stock.interiorColor && (
                          <div className="text-sm text-gray-500">
                            ใน: {stock.interiorColor}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-gray-900">
                        {new Date(stock.arrivalDate).toLocaleDateString('th-TH')}
                      </TableCell>
                      <TableCell className="text-gray-900">
                        {new Intl.NumberFormat('th-TH', {
                          style: 'currency',
                          currency: 'THB',
                        }).format(stock.accumulatedInterest)}
                      </TableCell>
                      <TableCell>
                        <span
                          className={`px-2.5 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${stock.status === 'AVAILABLE'
                              ? 'bg-green-100 text-green-800'
                              : stock.status === 'RESERVED'
                                ? 'bg-yellow-100 text-yellow-800'
                                : stock.status === 'PREPARING'
                                  ? 'bg-blue-100 text-blue-800'
                                  : 'bg-gray-100 text-gray-800'
                            }`}
                        >
                          {stock.status === 'AVAILABLE' && 'พร้อมขาย'}
                          {stock.status === 'RESERVED' && 'จองแล้ว'}
                          {stock.status === 'PREPARING' && 'เตรียมขาย'}
                          {stock.status === 'SOLD' && 'ขายแล้ว'}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Link
                            to={`/stock/${stock.id}`}
                            className="inline-flex items-center justify-center p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                            title="ดูรายละเอียด"
                          >
                            ดู
                          </Link>
                          <Link
                            to={`/stock/${stock.id}/edit`}
                            className="inline-flex items-center justify-center p-2 text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                            title="แก้ไข"
                          >
                            <Edit className="h-4 w-4" />
                          </Link>
                          {stock.status !== 'SOLD' && (
                            <button
                              onClick={() => handleDelete(stock.id, stock.vin)}
                              className="inline-flex items-center justify-center p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                              title="ลบ"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableWrapper>

            {stocks.length === 0 && (
              <TableEmpty
                icon={<Package className="h-12 w-12" />}
                title="ไม่พบ Stock"
                description="เริ่มต้นด้วยการเพิ่ม Stock ใหม่"
              />
            )}

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
        </>
      )}
    </MainLayout>
  );
}
