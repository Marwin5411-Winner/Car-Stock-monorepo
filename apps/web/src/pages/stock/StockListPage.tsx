import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { stockService } from '../../services/stock.service';
import type { Stock, StockStats } from '../../services/stock.service';
import { MainLayout } from '../../components/layout';
import { Plus, Search, Edit, Trash2, Package, Car, Calendar, DollarSign, TrendingUp } from 'lucide-react';

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
        <div className="text-center py-12">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <p className="mt-2 text-gray-600">กำลังโหลด...</p>
        </div>
      ) : (
        <>
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Stock
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    รถยนต์
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    สี
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    วันที่เข้า
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    ดอกเบี้ยสะสม
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    สถานะ
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    จัดการ
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {(stocks || []).map((stock) => (
                  <tr key={stock.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">{stock.vin}</div>
                      {stock.parkingSlot && (
                        <div className="text-sm text-gray-500">Slot: {stock.parkingSlot}</div>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">
                        {stock.vehicleModel.brand} {stock.vehicleModel.model}
                      </div>
                      <div className="text-sm text-gray-500">
                        ปี {stock.vehicleModel.year}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">
                        {stock.exteriorColor}
                      </div>
                      {stock.interiorColor && (
                        <div className="text-sm text-gray-500">
                          ใน: {stock.interiorColor}
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {new Date(stock.arrivalDate).toLocaleDateString('th-TH')}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {new Intl.NumberFormat('th-TH', {
                        style: 'currency',
                        currency: 'THB',
                      }).format(stock.accumulatedInterest)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span
                        className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                          stock.status === 'AVAILABLE'
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
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <Link
                        to={`/stock/${stock.id}`}
                        className="text-blue-600 hover:text-blue-900 mr-3"
                      >
                        ดู
                      </Link>
                      <Link
                        to={`/stock/${stock.id}/edit`}
                        className="text-indigo-600 hover:text-indigo-900 mr-3"
                      >
                        <Edit className="h-4 w-4 inline" />
                      </Link>
                      {stock.status !== 'SOLD' && (
                        <button
                          onClick={() => handleDelete(stock.id, stock.vin)}
                          className="text-red-600 hover:text-red-900"
                        >
                          <Trash2 className="h-4 w-4 inline" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {stocks.length === 0 && (
              <div className="text-center py-12">
                <Package className="mx-auto h-12 w-12 text-gray-400" />
                <h3 className="mt-2 text-sm font-medium text-gray-900">
                  ไม่พบ Stock
                </h3>
                <p className="mt-1 text-sm text-gray-500">
                  เริ่มต้นด้วยการเพิ่ม Stock ใหม่
                </p>
              </div>
            )}
          </div>

          {totalPages > 1 && (
            <div className="mt-6 flex items-center justify-between">
              <div className="text-sm text-gray-700">
                แสดง {((page - 1) * limit) + 1} ถึง {Math.min(page * limit, total)} จากทั้งหมด {total} รายการ
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage(page - 1)}
                  disabled={page === 1}
                  className="px-4 py-2 border border-gray-300 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
                >
                  ก่อนหน้า
                </button>
                <span className="px-4 py-2 text-sm text-gray-700">
                  หน้า {page} จาก {totalPages}
                </span>
                <button
                  onClick={() => setPage(page + 1)}
                  disabled={page === totalPages}
                  className="px-4 py-2 border border-gray-300 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
                >
                  ถัดไป
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </MainLayout>
  );
}
