import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { stockService } from '../../services/stock.service';
import type { Stock } from '../../services/stock.service';
import { MainLayout } from '../../components/layout';
import { 
  ArrowLeft, 
  Edit, 
  Car, 
  Calendar, 
  Package, 
  DollarSign, 
  TrendingUp,
  Hash,
  MapPin,
  Palette,
  RefreshCw,
  AlertTriangle
} from 'lucide-react';

const STATUS_LABELS: Record<string, string> = {
  AVAILABLE: 'พร้อมขาย',
  RESERVED: 'จองแล้ว',
  PREPARING: 'เตรียมส่งมอบ',
  SOLD: 'ขายแล้ว',
};

const STATUS_COLORS: Record<string, string> = {
  AVAILABLE: 'bg-green-100 text-green-800',
  RESERVED: 'bg-yellow-100 text-yellow-800',
  PREPARING: 'bg-blue-100 text-blue-800',
  SOLD: 'bg-gray-100 text-gray-800',
};

export default function StockDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [stock, setStock] = useState<Stock | null>(null);
  const [loading, setLoading] = useState(true);
  const [recalculating, setRecalculating] = useState(false);

  useEffect(() => {
    if (id) {
      fetchStock(id);
    }
  }, [id]);

  const fetchStock = async (stockId: string) => {
    try {
      setLoading(true);
      const data = await stockService.getById(stockId);
      setStock(data);
    } catch (error) {
      console.error('Error fetching stock:', error);
      alert('ไม่สามารถโหลดข้อมูล Stock ได้');
      navigate('/stock');
    } finally {
      setLoading(false);
    }
  };

  const handleRecalculateInterest = async () => {
    if (!stock) return;
    
    try {
      setRecalculating(true);
      const updated = await stockService.recalculateInterest(stock.id);
      setStock(updated);
      alert('คำนวณดอกเบี้ยใหม่สำเร็จ');
    } catch (error) {
      console.error('Error recalculating interest:', error);
      alert('ไม่สามารถคำนวณดอกเบี้ยใหม่ได้');
    } finally {
      setRecalculating(false);
    }
  };

  const handleStatusChange = async (newStatus: string) => {
    if (!stock) return;
    
    const confirmMsg = `คุณต้องการเปลี่ยนสถานะเป็น "${STATUS_LABELS[newStatus]}" หรือไม่?`;
    if (!window.confirm(confirmMsg)) return;

    try {
      const updated = await stockService.updateStatus(stock.id, newStatus);
      setStock(updated);
      alert('เปลี่ยนสถานะสำเร็จ');
    } catch (error) {
      console.error('Error updating status:', error);
      alert('ไม่สามารถเปลี่ยนสถานะได้');
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('th-TH', {
      style: 'currency',
      currency: 'THB',
    }).format(amount);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('th-TH', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  if (loading) {
    return (
      <MainLayout>
        <div className="text-center py-12">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <p className="mt-2 text-gray-600">กำลังโหลด...</p>
        </div>
      </MainLayout>
    );
  }

  if (!stock) {
    return (
      <MainLayout>
        <div className="text-center py-12">
          <Package className="mx-auto h-12 w-12 text-gray-400" />
          <p className="mt-2 text-gray-600">ไม่พบข้อมูล Stock</p>
          <Link 
            to="/stock" 
            className="mt-4 inline-flex items-center text-blue-600 hover:text-blue-800"
          >
            <ArrowLeft className="w-4 h-4 mr-1" />
            กลับไปหน้ารายการ Stock
          </Link>
        </div>
      </MainLayout>
    );
  }

  const totalCost = stock.baseCost + stock.transportCost + stock.accessoryCost + stock.otherCosts;
  const totalWithInterest = totalCost + stock.accumulatedInterest;

  return (
    <MainLayout>
      <div className="mb-6">
        <button
          onClick={() => navigate('/stock')}
          className="inline-flex items-center text-gray-600 hover:text-gray-900 mb-4"
        >
          <ArrowLeft className="w-5 h-5 mr-2" />
          กลับ
        </button>
        <div className="flex justify-between items-start">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-gray-900">{stock.vin}</h1>
              <span className={`inline-flex px-3 py-1 text-sm font-semibold rounded-full ${STATUS_COLORS[stock.status]}`}>
                {STATUS_LABELS[stock.status]}
              </span>
            </div>
            <p className="text-gray-600 mt-1">
              {stock.vehicleModel.brand} {stock.vehicleModel.model} {stock.vehicleModel.variant} ({stock.vehicleModel.year})
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleRecalculateInterest}
              disabled={recalculating}
              className="inline-flex items-center px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 disabled:opacity-50"
            >
              <RefreshCw className={`w-5 h-5 mr-2 ${recalculating ? 'animate-spin' : ''}`} />
              คำนวณดอกเบี้ยใหม่
            </button>
            <Link
              to={`/stock/${stock.id}/edit`}
              className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              <Edit className="w-5 h-5 mr-2" />
              แก้ไข
            </Link>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content - Left Side */}
        <div className="lg:col-span-2 space-y-6">
          {/* Vehicle Information */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-medium text-gray-900 mb-4 flex items-center">
              <Car className="h-5 w-5 mr-2 text-blue-600" />
              ข้อมูลรถยนต์
            </h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-gray-500">VIN</p>
                <p className="text-gray-900 font-mono">{stock.vin}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">หมายเลขเครื่องยนต์</p>
                <p className="text-gray-900 font-mono">{stock.engineNumber || '-'}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">หมายเลขมอเตอร์ 1</p>
                <p className="text-gray-900 font-mono">{stock.motorNumber1 || '-'}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">หมายเลขมอเตอร์ 2</p>
                <p className="text-gray-900 font-mono">{stock.motorNumber2 || '-'}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">ยี่ห้อ/รุ่น</p>
                <p className="text-gray-900">
                  {stock.vehicleModel.brand} {stock.vehicleModel.model}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-500">รุ่นย่อย</p>
                <p className="text-gray-900">{stock.vehicleModel.variant || '-'}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">ปี</p>
                <p className="text-gray-900">{stock.vehicleModel.year}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">ประเภท</p>
                <p className="text-gray-900">{stock.vehicleModel.type}</p>
              </div>
            </div>
          </div>

          {/* Colors & Location */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-medium text-gray-900 mb-4 flex items-center">
              <Palette className="h-5 w-5 mr-2 text-purple-600" />
              สี & ตำแหน่ง
            </h2>
            <div className="grid grid-cols-2 gap-4">
              <div className="flex items-start">
                <Palette className="h-5 w-5 text-gray-400 mt-1 mr-3" />
                <div>
                  <p className="text-sm text-gray-500">สีภายนอก</p>
                  <p className="text-gray-900">{stock.exteriorColor}</p>
                </div>
              </div>
              <div className="flex items-start">
                <Palette className="h-5 w-5 text-gray-400 mt-1 mr-3" />
                <div>
                  <p className="text-sm text-gray-500">สีภายใน</p>
                  <p className="text-gray-900">{stock.interiorColor || '-'}</p>
                </div>
              </div>
              <div className="flex items-start">
                <MapPin className="h-5 w-5 text-gray-400 mt-1 mr-3" />
                <div>
                  <p className="text-sm text-gray-500">ช่องจอด</p>
                  <p className="text-gray-900">{stock.parkingSlot || '-'}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Cost Breakdown */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-medium text-gray-900 mb-4 flex items-center">
              <DollarSign className="h-5 w-5 mr-2 text-green-600" />
              รายละเอียดต้นทุน
            </h2>
            <div className="space-y-3">
              <div className="flex justify-between py-2 border-b border-gray-100">
                <span className="text-gray-600">ต้นทุนฐาน</span>
                <span className="text-gray-900 font-medium">{formatCurrency(stock.baseCost)}</span>
              </div>
              <div className="flex justify-between py-2 border-b border-gray-100">
                <span className="text-gray-600">ค่าขนส่ง</span>
                <span className="text-gray-900 font-medium">{formatCurrency(stock.transportCost)}</span>
              </div>
              <div className="flex justify-between py-2 border-b border-gray-100">
                <span className="text-gray-600">ค่าอุปกรณ์เสริม</span>
                <span className="text-gray-900 font-medium">{formatCurrency(stock.accessoryCost)}</span>
              </div>
              <div className="flex justify-between py-2 border-b border-gray-100">
                <span className="text-gray-600">ค่าใช้จ่ายอื่นๆ</span>
                <span className="text-gray-900 font-medium">{formatCurrency(stock.otherCosts)}</span>
              </div>
              <div className="flex justify-between py-2 border-b border-gray-200 bg-gray-50 -mx-6 px-6">
                <span className="text-gray-700 font-medium">ต้นทุนรวม</span>
                <span className="text-gray-900 font-bold">{formatCurrency(totalCost)}</span>
              </div>
              <div className="flex justify-between py-2 border-b border-gray-100">
                <span className="text-gray-600 flex items-center">
                  <TrendingUp className="h-4 w-4 mr-1 text-orange-500" />
                  ดอกเบี้ยสะสม
                </span>
                <span className="text-orange-600 font-medium">{formatCurrency(stock.accumulatedInterest)}</span>
              </div>
              <div className="flex justify-between py-3 bg-blue-50 -mx-6 px-6 rounded-b-lg">
                <span className="text-blue-700 font-semibold">ต้นทุนรวม + ดอกเบี้ย</span>
                <span className="text-blue-900 font-bold text-lg">{formatCurrency(totalWithInterest)}</span>
              </div>
            </div>
          </div>

          {/* Dates */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-medium text-gray-900 mb-4 flex items-center">
              <Calendar className="h-5 w-5 mr-2 text-blue-600" />
              วันที่สำคัญ
            </h2>
            <div className="grid grid-cols-2 gap-4">
              <div className="flex items-start">
                <Calendar className="h-5 w-5 text-gray-400 mt-1 mr-3" />
                <div>
                  <p className="text-sm text-gray-500">วันที่รถเข้า</p>
                  <p className="text-gray-900">{formatDate(stock.arrivalDate)}</p>
                </div>
              </div>
              <div className="flex items-start">
                <Calendar className="h-5 w-5 text-gray-400 mt-1 mr-3" />
                <div>
                  <p className="text-sm text-gray-500">วันที่สร้างรายการ</p>
                  <p className="text-gray-900">{formatDate(stock.createdAt)}</p>
                </div>
              </div>
              {stock.daysInStock !== undefined && (
                <div className="flex items-start">
                  <Hash className="h-5 w-5 text-gray-400 mt-1 mr-3" />
                  <div>
                    <p className="text-sm text-gray-500">จำนวนวันใน Stock</p>
                    <p className="text-gray-900">{stock.daysInStock} วัน</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Sidebar */}
        <div className="space-y-6">
          {/* Price Summary */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-medium text-gray-900 mb-4">ราคา</h2>
            <div className="space-y-4">
              <div>
                <p className="text-sm text-gray-500">ราคาขายที่คาดหวัง</p>
                <p className="text-2xl font-bold text-green-600">
                  {stock.expectedSalePrice ? formatCurrency(stock.expectedSalePrice) : '-'}
                </p>
              </div>
              {stock.actualSalePrice && (
                <div className="pt-4 border-t border-gray-200">
                  <p className="text-sm text-gray-500">ราคาขายจริง</p>
                  <p className="text-2xl font-bold text-blue-600">
                    {formatCurrency(stock.actualSalePrice)}
                  </p>
                </div>
              )}
              {stock.expectedSalePrice && (
                <div className="pt-4 border-t border-gray-200">
                  <p className="text-sm text-gray-500">กำไรที่คาดหวัง</p>
                  <p className={`text-xl font-bold ${stock.expectedSalePrice - totalWithInterest >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {formatCurrency(stock.expectedSalePrice - totalWithInterest)}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Status Change */}
          {stock.status !== 'SOLD' && (
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-medium text-gray-900 mb-4">เปลี่ยนสถานะ</h2>
              <div className="space-y-2">
                {stock.status === 'AVAILABLE' && (
                  <>
                    <button
                      onClick={() => handleStatusChange('RESERVED')}
                      className="w-full px-4 py-2 bg-yellow-500 text-white rounded-lg hover:bg-yellow-600"
                    >
                      จองรถ
                    </button>
                  </>
                )}
                {stock.status === 'RESERVED' && (
                  <>
                    <button
                      onClick={() => handleStatusChange('PREPARING')}
                      className="w-full px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
                    >
                      เตรียมส่งมอบ
                    </button>
                    <button
                      onClick={() => handleStatusChange('AVAILABLE')}
                      className="w-full px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600"
                    >
                      ยกเลิกการจอง
                    </button>
                  </>
                )}
                {stock.status === 'PREPARING' && (
                  <>
                    <button
                      onClick={() => handleStatusChange('SOLD')}
                      className="w-full px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600"
                    >
                      ขายแล้ว
                    </button>
                    <button
                      onClick={() => handleStatusChange('RESERVED')}
                      className="w-full px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600"
                    >
                      กลับไปจอง
                    </button>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Quick Actions */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-medium text-gray-900 mb-4">การดำเนินการ</h2>
            <div className="space-y-2">
              {stock.status === 'AVAILABLE' && (
                <Link
                  to={`/sales/new?stockId=${stock.id}`}
                  className="block w-full px-4 py-2 bg-blue-600 text-white text-center rounded-lg hover:bg-blue-700"
                >
                  สร้างใบสั่งขาย
                </Link>
              )}
              <Link
                to={`/stock/${stock.id}/edit`}
                className="block w-full px-4 py-2 border border-gray-300 text-gray-700 text-center rounded-lg hover:bg-gray-50"
              >
                แก้ไขข้อมูล
              </Link>
            </div>
          </div>

          {/* Warning if old stock */}
          {stock.daysInStock && stock.daysInStock > 90 && (
            <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
              <div className="flex items-start">
                <AlertTriangle className="h-5 w-5 text-orange-500 mt-0.5 mr-2" />
                <div>
                  <h3 className="text-sm font-medium text-orange-800">Stock ค้างนาน</h3>
                  <p className="text-sm text-orange-700 mt-1">
                    รถคันนี้อยู่ใน Stock มานาน {stock.daysInStock} วัน ดอกเบี้ยสะสมอาจสูง
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </MainLayout>
  );
}
