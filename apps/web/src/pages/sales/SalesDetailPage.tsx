import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { salesService } from '../../services/sales.service';
import { stockService, type Stock } from '../../services/stock.service';
import type { Sale, SaleStatus } from '../../services/sales.service';
import { MainLayout } from '../../components/layout';
import { api } from '../../lib/api';
import {
  ArrowLeft,
  Edit,
  User,
  Car,
  Calendar,
  DollarSign,
  FileText,
  Clock,
  CreditCard,
  History,
  Download,
  Printer,
  CheckCircle,
  XCircle,
  AlertCircle,
  Truck,
  Package,
  Plus,
  RefreshCw,
  X,
  Loader2
} from 'lucide-react';

// Updated status labels - removed INQUIRY and QUOTED (now handled by Quotation module)
const STATUS_LABELS: Record<SaleStatus, string> = {
  RESERVED: 'จองแล้ว',
  PREPARING: 'เตรียมส่งมอบ',
  DELIVERED: 'ส่งมอบแล้ว',
  COMPLETED: 'เสร็จสิ้น',
  CANCELLED: 'ยกเลิก',
};

const STATUS_COLORS: Record<SaleStatus, string> = {
  RESERVED: 'bg-yellow-100 text-yellow-800 border-yellow-300',
  PREPARING: 'bg-purple-100 text-purple-800 border-purple-300',
  DELIVERED: 'bg-indigo-100 text-indigo-800 border-indigo-300',
  COMPLETED: 'bg-green-100 text-green-800 border-green-300',
  CANCELLED: 'bg-red-100 text-red-800 border-red-300',
};

const STATUS_ICONS: Record<SaleStatus, React.ReactNode> = {
  RESERVED: <Clock className="h-4 w-4" />,
  PREPARING: <Package className="h-4 w-4" />,
  DELIVERED: <Truck className="h-4 w-4" />,
  COMPLETED: <CheckCircle className="h-4 w-4" />,
  CANCELLED: <XCircle className="h-4 w-4" />,
};

const PAYMENT_TYPE_LABELS: Record<string, string> = {
  DEPOSIT: 'เงินจอง',
  DOWN_PAYMENT: 'เงินดาวน์',
  FINANCE_PAYMENT: 'ยอดไฟแนนซ์',
  OTHER_EXPENSE: 'ค่าใช้จ่ายอื่น',
};

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  CASH: 'เงินสด',
  BANK_TRANSFER: 'โอนเงิน',
  CHEQUE: 'เช็ค',
  CREDIT_CARD: 'บัตรเครดิต',
};

const PAYMENT_STATUS_COLORS: Record<string, string> = {
  ACTIVE: 'bg-green-100 text-green-800',
  VOIDED: 'bg-red-100 text-red-800',
};

type TabType = 'overview' | 'documents' | 'payments' | 'history';

// Document type definitions with their API endpoints
type DocumentType =
  | 'contract'
  | 'deposit-receipt'
  | 'sales-confirmation'
  | 'sales-record'
  | 'delivery-receipt'
  | 'thank-you-letter';

interface DocumentConfig {
  id: DocumentType;
  title: string;
  description: string;
  endpoint: string;
  getAvailable: (sale: Sale) => boolean;
  restricted?: boolean;
  // For deposit-receipt, we need paymentId instead of saleId
  usePaymentId?: boolean;
}

const DOCUMENT_CONFIGS: DocumentConfig[] = [
  {
    id: 'contract',
    title: 'สัญญาจองรถยนต์',
    description: 'สัญญาหลักระหว่างผู้จำหน่ายและลูกค้า',
    endpoint: '/api/pdf/contract',
    getAvailable: (sale) => ['RESERVED', 'PREPARING', 'DELIVERED', 'COMPLETED'].includes(sale.status),
  },
  {
    id: 'deposit-receipt',
    title: 'ใบรับเงินมัดจำ',
    description: 'ใบรับเงินมัดจำ',
    endpoint: '/api/pdf/deposit-receipt',
    getAvailable: (sale) => sale.depositAmount > 0 && !!sale.payments?.some(p => p.paymentType === 'DEPOSIT' && p.status === 'ACTIVE'),
    usePaymentId: true,
  },
  {
    id: 'sales-confirmation',
    title: 'หนังสือยืนยันการซื้อ-ขาย',
    description: 'สำหรับกรมการขนส่งทางบก',
    endpoint: '/api/pdf/sales-confirmation',
    getAvailable: (sale) => ['PREPARING', 'DELIVERED', 'COMPLETED'].includes(sale.status),
  },
  {
    id: 'sales-record',
    title: 'ใบบันทึกการขาย',
    description: 'รายละเอียดราคาสำหรับบัญชี',
    endpoint: '/api/pdf/sales-record',
    getAvailable: (sale) => ['DELIVERED', 'COMPLETED'].includes(sale.status),
    restricted: true,
  },

  {
    id: 'delivery-receipt',
    title: 'ใบปล่อยรถ/ใบรับรถ',
    description: 'หลักฐานการส่งมอบรถ',
    endpoint: '/api/pdf/delivery-receipt',
    getAvailable: (sale) => ['DELIVERED', 'COMPLETED'].includes(sale.status),
  },
  {
    id: 'thank-you-letter',
    title: 'หนังสือขอบคุณ',
    description: 'หนังสือขอบคุณพร้อมยืนยันของแถม',
    endpoint: '/api/pdf/thank-you-letter',
    getAvailable: (sale) => ['DELIVERED', 'COMPLETED'].includes(sale.status),
  },
];

// Updated status flow - removed INQUIRY and QUOTED (now handled by Quotation module)
const STATUS_FLOW: SaleStatus[] = ['RESERVED', 'PREPARING', 'DELIVERED', 'COMPLETED'];

export default function SalesDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';
  const [sale, setSale] = useState<Sale | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [updatingStatus, setUpdatingStatus] = useState(false);

  // Stock assignment modal state
  const [showStockModal, setShowStockModal] = useState(false);
  const [availableStocks, setAvailableStocks] = useState<Stock[]>([]);
  const [loadingStocks, setLoadingStocks] = useState(false);
  const [assigningStock, setAssigningStock] = useState(false);
  const [selectedStockId, setSelectedStockId] = useState<string>('');

  // Document loading state
  const [documentLoading, setDocumentLoading] = useState<DocumentType | null>(null);

  useEffect(() => {
    if (id) {
      fetchSale(id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const fetchSale = async (saleId: string) => {
    try {
      setLoading(true);
      const data = await salesService.getById(saleId);
      setSale(data);
    } catch (error) {
      console.error('Error fetching sale:', error);
      alert('ไม่สามารถโหลดข้อมูลการขายได้');
      navigate('/sales');
    } finally {
      setLoading(false);
    }
  };

  const handleStatusChange = async (newStatus: SaleStatus) => {
    if (!sale) return;

    const confirmMsg = `คุณต้องการเปลี่ยนสถานะเป็น "${STATUS_LABELS[newStatus]}" หรือไม่?`;
    if (!window.confirm(confirmMsg)) return;

    try {
      setUpdatingStatus(true);
      const updated = await salesService.updateStatus(sale.id, newStatus);
      setSale(updated);
      // Refresh to get updated data
      await fetchSale(sale.id);
      alert('เปลี่ยนสถานะสำเร็จ');
    } catch (error) {
      console.error('Error updating status:', error);
      alert('ไม่สามารถเปลี่ยนสถานะได้');
    } finally {
      setUpdatingStatus(false);
    }
  };

  // Stock assignment functions
  const openStockModal = async () => {
    if (!sale) return;

    try {
      setLoadingStocks(true);
      setShowStockModal(true);
      // Fetch available stocks for the same vehicle model
      const vehicleModelId = sale.vehicleModel?.id;
      const stocks = await stockService.getAll({
        vehicleModelId,
        status: 'AVAILABLE',
        limit: 50
      });
      setAvailableStocks(stocks.data || []);
      setSelectedStockId(sale.stock?.id || '');
    } catch (error) {
      console.error('Error fetching stocks:', error);
      alert('ไม่สามารถโหลดรายการสต็อกได้');
      setShowStockModal(false);
    } finally {
      setLoadingStocks(false);
    }
  };

  const closeStockModal = () => {
    setShowStockModal(false);
    setSelectedStockId('');
    setAvailableStocks([]);
  };

  const handleAssignStock = async () => {
    if (!sale || !selectedStockId) return;

    try {
      setAssigningStock(true);
      await salesService.assignStock(sale.id, selectedStockId);
      await fetchSale(sale.id);
      closeStockModal();
      alert('กำหนดสต็อกสำเร็จ');
    } catch (error) {
      console.error('Error assigning stock:', error);
      alert('ไม่สามารถกำหนดสต็อกได้');
    } finally {
      setAssigningStock(false);
    }
  };

  const canChangeStock = (): boolean => {
    if (!sale) return false;
    // Can only change stock before DELIVERED
    return ['RESERVED', 'PREPARING'].includes(sale.status);
  };

  // Get the payment ID for deposit receipt (first active deposit payment)
  const getDepositPaymentId = useCallback((): string | null => {
    if (!sale?.payments) return null;
    const depositPayment = sale.payments.find(
      p => p.paymentType === 'DEPOSIT' && p.status === 'ACTIVE'
    );
    return depositPayment?.id || null;
  }, [sale?.payments]);

  // Handle document download
  const handleDownloadDocument = async (config: DocumentConfig) => {
    if (!sale) return;

    try {
      setDocumentLoading(config.id);

      // Determine the ID to use (saleId or paymentId)
      let endpoint = config.endpoint;
      if (config.usePaymentId) {
        const paymentId = getDepositPaymentId();
        if (!paymentId) {
          alert('ไม่พบข้อมูลการชำระเงินมัดจำ');
          return;
        }
        endpoint = `${config.endpoint}/${paymentId}`;
      } else {
        endpoint = `${config.endpoint}/${sale.id}`;
      }

      const blob = await api.getBlob(endpoint);

      // Create download link
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${config.id}-${sale.saleNumber}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error downloading document:', error);
      alert('ไม่สามารถดาวน์โหลดเอกสารได้');
    } finally {
      setDocumentLoading(null);
    }
  };

  // Handle document print
  const handlePrintDocument = async (config: DocumentConfig) => {
    if (!sale) return;

    try {
      setDocumentLoading(config.id);

      // Determine the ID to use (saleId or paymentId)
      let endpoint = config.endpoint;
      if (config.usePaymentId) {
        const paymentId = getDepositPaymentId();
        if (!paymentId) {
          alert('ไม่พบข้อมูลการชำระเงินมัดจำ');
          return;
        }
        endpoint = `${config.endpoint}/${paymentId}`;
      } else {
        endpoint = `${config.endpoint}/${sale.id}`;
      }

      const blob = await api.getBlob(endpoint);

      // Create blob URL and open in new window for printing
      const url = window.URL.createObjectURL(blob);
      const printWindow = window.open(url, '_blank');

      if (printWindow) {
        printWindow.onload = () => {
          printWindow.focus();
          // Give time for PDF to load before printing
          setTimeout(() => {
            printWindow.print();
          }, 500);
        };
      } else {
        // Fallback: if popup blocked, just open the URL
        window.open(url, '_blank');
      }
    } catch (error) {
      console.error('Error printing document:', error);
      alert('ไม่สามารถพิมพ์เอกสารได้');
    } finally {
      setDocumentLoading(null);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('th-TH', {
      style: 'currency',
      currency: 'THB',
    }).format(amount);
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return '-';
    return new Intl.DateTimeFormat('th-TH', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    }).format(new Date(dateString));
  };

  const formatDateTime = (dateString?: string) => {
    if (!dateString) return '-';
    return new Intl.DateTimeFormat('th-TH', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(dateString));
  };

  const getNextStatuses = (currentStatus: SaleStatus): SaleStatus[] => {
    // Updated status transitions - removed INQUIRY and QUOTED
    const statusTransitions: Record<SaleStatus, SaleStatus[]> = {
      RESERVED: ['PREPARING', 'CANCELLED'],
      PREPARING: ['DELIVERED', 'CANCELLED'],
      DELIVERED: ['COMPLETED', 'CANCELLED'],
      COMPLETED: [],
      CANCELLED: [],
    };
    const statuses = statusTransitions[currentStatus] || [];
    // Only ADMIN can cancel sales
    if (!isAdmin) {
      return statuses.filter(s => s !== 'CANCELLED');
    }
    return statuses;
  };

  const getStatusIndex = (status: SaleStatus): number => {
    return STATUS_FLOW.indexOf(status);
  };

  if (loading) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center h-64">
          <div className="text-lg text-gray-700">กำลังโหลด...</div>
        </div>
      </MainLayout>
    );
  }

  if (!sale) {
    return (
      <MainLayout>
        <div className="text-center py-12">
          <p className="text-gray-700">ไม่พบข้อมูลการขาย</p>
          <Link to="/sales" className="text-blue-600 hover:underline mt-4 inline-block">
            กลับไปหน้ารายการ
          </Link>
        </div>
      </MainLayout>
    );
  }

  const renderOverviewTab = () => (
    <div className="space-y-6">
      {/* Stock Assignment Modal */}
      {showStockModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[80vh] overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b">
              <h3 className="text-lg font-semibold">
                {sale.stock ? 'เปลี่ยน Stock' : 'กำหนด Stock'}
              </h3>
              <button
                onClick={closeStockModal}
                className="p-1 hover:bg-gray-100 rounded"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-4 overflow-y-auto max-h-[60vh]">
              {loadingStocks ? (
                <div className="text-center py-8 text-gray-700">กำลังโหลด...</div>
              ) : availableStocks.length === 0 ? (
                <div className="text-center py-8 text-gray-700">
                  ไม่พบ Stock ที่พร้อมใช้งาน
                </div>
              ) : (
                <div className="space-y-2">
                  {availableStocks.map((stock) => (
                    <label
                      key={stock.id}
                      className={`flex items-center p-3 border rounded-lg cursor-pointer hover:bg-gray-50 ${selectedStockId === stock.id ? 'border-blue-500 bg-blue-50' : 'border-gray-200'
                        }`}
                    >
                      <input
                        type="radio"
                        name="stockId"
                        value={stock.id}
                        checked={selectedStockId === stock.id}
                        onChange={(e) => setSelectedStockId(e.target.value)}
                        className="mr-3"
                      />
                      <div className="flex-1">
                        <div className="font-medium">
                          {stock.vehicleModel.brand} {stock.vehicleModel.model}
                          {stock.vehicleModel.variant && ` ${stock.vehicleModel.variant}`}
                        </div>
                        <div className="text-sm text-gray-700">
                          VIN: {stock.vin} | สี: {stock.exteriorColor}
                        </div>
                      </div>
                    </label>
                  ))}
                </div>
              )}
            </div>
            <div className="flex justify-end gap-2 p-4 border-t">
              <button
                onClick={closeStockModal}
                className="px-4 py-2 text-gray-700 border rounded-lg hover:bg-gray-50"
              >
                ยกเลิก
              </button>
              <button
                onClick={handleAssignStock}
                disabled={!selectedStockId || assigningStock}
                className="px-4 py-2 bg-white border border-gray-300 text-gray-900 rounded-lg hover:bg-gray-50 disabled:opacity-50"
              >
                {assigningStock ? 'กำลังบันทึก...' : 'บันทึก'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Status Pipeline */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold mb-4">สถานะการขาย</h3>
        <div className="flex items-center justify-between mb-4">
          {STATUS_FLOW.map((status, index) => {
            const currentIndex = getStatusIndex(sale.status);
            const isCompleted = sale.status === 'CANCELLED' ? false : index < currentIndex;
            const isCurrent = status === sale.status;

            return (
              <div key={status} className="flex-1 flex items-center">
                <div className="flex flex-col items-center flex-1">
                  <div
                    className={`w-10 h-10 rounded-full flex items-center justify-center border-2 ${isCurrent
                      ? STATUS_COLORS[status]
                      : isCompleted
                        ? 'bg-green-100 text-green-600 border-green-300'
                        : 'bg-gray-100 text-gray-700 border-gray-300'
                      }`}
                  >
                    {isCompleted ? <CheckCircle className="h-5 w-5" /> : STATUS_ICONS[status]}
                  </div>
                  <span className={`text-xs mt-2 text-center ${isCurrent ? 'font-medium text-gray-900' : 'text-gray-700'}`}>
                    {STATUS_LABELS[status]}
                  </span>
                </div>
                {index < STATUS_FLOW.length - 1 && (
                  <div className={`h-1 flex-1 mx-2 ${isCompleted ? 'bg-green-300' : 'bg-gray-200'}`} />
                )}
              </div>
            );
          })}
        </div>

        {/* Status Actions */}
        {sale.status !== 'COMPLETED' && sale.status !== 'CANCELLED' && (
          <div className="flex gap-2 mt-4 pt-4 border-t">
            {getNextStatuses(sale.status).map((nextStatus) => (
              <button
                key={nextStatus}
                onClick={() => handleStatusChange(nextStatus)}
                disabled={updatingStatus}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${nextStatus === 'CANCELLED'
                  ? 'bg-red-100 text-red-700 hover:bg-red-200'
                  : 'bg-blue-100 text-blue-900 hover:bg-blue-200'
                  } disabled:opacity-50`}
              >
                {nextStatus === 'CANCELLED' ? 'ยกเลิก' : `เปลี่ยนเป็น ${STATUS_LABELS[nextStatus]}`}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Main Info Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Customer Info */}
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold mb-4 flex items-center">
            <User className="h-5 w-5 mr-2 text-blue-600" />
            ข้อมูลลูกค้า
          </h3>
          <dl className="space-y-3">
            <div>
              <dt className="text-sm text-gray-700">รหัสลูกค้า</dt>
              <dd className="text-sm font-medium">{sale.customer.code}</dd>
            </div>
            <div>
              <dt className="text-sm text-gray-700">ชื่อ</dt>
              <dd className="text-sm font-medium">{sale.customer.name}</dd>
            </div>
            <div>
              <dt className="text-sm text-gray-700">ประเภท</dt>
              <dd className="text-sm font-medium">
                {sale.customer.type === 'INDIVIDUAL' ? 'บุคคลธรรมดา' : 'นิติบุคคล'}
              </dd>
            </div>
            {sale.customer.phone && (
              <div>
                <dt className="text-sm text-gray-700">โทรศัพท์</dt>
                <dd className="text-sm font-medium">{sale.customer.phone}</dd>
              </div>
            )}
            {sale.customer.email && (
              <div>
                <dt className="text-sm text-gray-700">อีเมล</dt>
                <dd className="text-sm font-medium">{sale.customer.email}</dd>
              </div>
            )}
          </dl>
          <Link
            to={`/customers/${sale.customer.id}`}
            className="text-blue-600 hover:underline text-sm mt-4 inline-block"
          >
            ดูข้อมูลลูกค้าเพิ่มเติม →
          </Link>
        </div>

        {/* Vehicle Info */}
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold mb-4 flex items-center">
            <Car className="h-5 w-5 mr-2 text-blue-600" />
            ข้อมูลรถยนต์
          </h3>
          {sale.stock ? (
            <dl className="space-y-3">
              <div>
                <dt className="text-sm text-gray-700">รุ่นรถ</dt>
                <dd className="text-sm font-medium">
                  {sale.stock.vehicleModel.brand} {sale.stock.vehicleModel.model}
                  {sale.stock.vehicleModel.variant && ` ${sale.stock.vehicleModel.variant}`}
                </dd>
              </div>
              <div>
                <dt className="text-sm text-gray-700">VIN</dt>
                <dd className="text-sm font-mono">{sale.stock.vin}</dd>
              </div>
              {sale.stock.exteriorColor && (
                <div>
                  <dt className="text-sm text-gray-700">สีภายนอก</dt>
                  <dd className="text-sm font-medium">{sale.stock.exteriorColor}</dd>
                </div>
              )}
              {sale.stock.interiorColor && (
                <div>
                  <dt className="text-sm text-gray-700">สีภายใน</dt>
                  <dd className="text-sm font-medium">{sale.stock.interiorColor}</dd>
                </div>
              )}
              <div className="flex items-center gap-4 mt-4">
                <Link
                  to={`/stock/${sale.stock.id}`}
                  className="text-blue-600 hover:underline text-sm"
                >
                  ดูข้อมูล Stock เพิ่มเติม →
                </Link>
                {canChangeStock() && (
                  <button
                    onClick={openStockModal}
                    className="inline-flex items-center text-sm text-orange-600 hover:text-orange-700"
                  >
                    <RefreshCw className="h-4 w-4 mr-1" />
                    เปลี่ยน Stock
                  </button>
                )}
              </div>
            </dl>
          ) : sale.vehicleModel ? (
            <dl className="space-y-3">
              <div>
                <dt className="text-sm text-gray-700">รุ่นรถที่ต้องการ</dt>
                <dd className="text-sm font-medium">
                  {sale.vehicleModel.brand} {sale.vehicleModel.model}
                  {sale.vehicleModel.variant && ` ${sale.vehicleModel.variant}`}
                </dd>
              </div>
              {sale.preferredExtColor && (
                <div>
                  <dt className="text-sm text-gray-700">สีภายนอกที่ต้องการ</dt>
                  <dd className="text-sm font-medium">{sale.preferredExtColor}</dd>
                </div>
              )}
              {sale.preferredIntColor && (
                <div>
                  <dt className="text-sm text-gray-700">สีภายในที่ต้องการ</dt>
                  <dd className="text-sm font-medium">{sale.preferredIntColor}</dd>
                </div>
              )}
              <div className="pt-2 flex items-center gap-4">
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                  <AlertCircle className="h-3 w-3 mr-1" />
                  ยังไม่ได้เลือก Stock
                </span>
                {canChangeStock() && (
                  <button
                    onClick={openStockModal}
                    className="inline-flex items-center text-sm text-blue-600 hover:text-blue-700"
                  >
                    <Plus className="h-4 w-4 mr-1" />
                    กำหนด Stock
                  </button>
                )}
              </div>
            </dl>
          ) : (
            <p className="text-gray-700 text-sm">ยังไม่ได้ระบุรถยนต์</p>
          )}
        </div>

        {/* Financial Info */}
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold mb-4 flex items-center">
            <DollarSign className="h-5 w-5 mr-2 text-blue-600" />
            ข้อมูลการเงิน
          </h3>
          <dl className="space-y-3">
            <div className="flex justify-between">
              <dt className="text-sm text-gray-700">ราคารถ</dt>
              <dd className="text-sm font-medium">{formatCurrency(sale.totalAmount - sale.depositAmount)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-sm text-gray-700">เงินมัดจำ</dt>
              <dd className="text-sm font-medium">{formatCurrency(sale.depositAmount)}</dd>
            </div>
            <div className="flex justify-between border-t pt-2">
              <dt className="text-sm text-gray-700">ยอดรวม</dt>
              <dd className="text-sm font-semibold">{formatCurrency(sale.totalAmount)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-sm text-gray-700">ชำระแล้ว</dt>
              <dd className="text-sm font-medium text-green-600">{formatCurrency(sale.paidAmount)}</dd>
            </div>
            <div className="flex justify-between pt-2 border-t">
              <dt className="text-sm text-gray-700 font-medium">ค้างชำระ</dt>
              <dd className={`text-sm font-bold ${sale.remainingAmount > 0 ? 'text-red-600' : 'text-green-600'}`}>
                {formatCurrency(sale.remainingAmount)}
              </dd>
            </div>
          </dl>

          {/* Payment Mode */}
          <div className="mt-4 pt-4 border-t">
            <p className="text-sm text-gray-700 mb-2">รูปแบบการชำระ</p>
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
              {sale.paymentMode === 'CASH' ? 'เงินสด' : sale.paymentMode === 'FINANCE' ? 'ไฟแนนซ์' : 'ผสม'}
            </span>
            {sale.paymentMode !== 'CASH' && sale.financeProvider && (
              <p className="text-sm text-gray-700 mt-2">
                ไฟแนนซ์: {sale.financeProvider}
              </p>
            )}
          </div>
        </div>

        {/* Dates Info */}
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold mb-4 flex items-center">
            <Calendar className="h-5 w-5 mr-2 text-blue-600" />
            วันที่สำคัญ
          </h3>
          <dl className="space-y-3">
            <div>
              <dt className="text-sm text-gray-700">วันที่สร้าง</dt>
              <dd className="text-sm font-medium">{formatDate(sale.createdAt)}</dd>
            </div>
            {sale.reservedDate && (
              <div>
                <dt className="text-sm text-gray-700">วันที่จอง</dt>
                <dd className="text-sm font-medium">{formatDate(sale.reservedDate)}</dd>
              </div>
            )}
            {sale.hasExpiration && sale.expirationDate && (
              <div>
                <dt className="text-sm text-gray-700">วันหมดอายุการจอง</dt>
                <dd className="text-sm font-medium text-yellow-600">{formatDate(sale.expirationDate)}</dd>
              </div>
            )}
            {sale.deliveryDate && (
              <div>
                <dt className="text-sm text-gray-700">วันที่ส่งมอบ</dt>
                <dd className="text-sm font-medium">{formatDate(sale.deliveryDate)}</dd>
              </div>
            )}
            {sale.completedDate && (
              <div>
                <dt className="text-sm text-gray-700">วันที่เสร็จสิ้น</dt>
                <dd className="text-sm font-medium text-green-600">{formatDate(sale.completedDate)}</dd>
              </div>
            )}
          </dl>
        </div>
      </div>

      {/* Campaign & Notes */}
      {(sale.campaign || sale.notes) && (
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold mb-4">ข้อมูลเพิ่มเติม</h3>
          {sale.campaign && (
            <div className="mb-4">
              <p className="text-sm text-gray-700">แคมเปญ</p>
              <p className="text-sm font-medium">{sale.campaign.name}</p>
              {sale.discountSnapshot && (
                <p className="text-sm text-green-600">ส่วนลด: {formatCurrency(sale.discountSnapshot)}</p>
              )}
              {sale.freebiesSnapshot && (
                <p className="text-sm text-blue-600">ของแถม: {sale.freebiesSnapshot}</p>
              )}
            </div>
          )}
          {sale.notes && (
            <div>
              <p className="text-sm text-gray-700">หมายเหตุ</p>
              <p className="text-sm text-gray-700 whitespace-pre-wrap">{sale.notes}</p>
            </div>
          )}
        </div>
      )}

      {/* Created By */}
      {sale.createdBy && (
        <div className="text-sm text-gray-700">
          สร้างโดย: {sale.createdBy.firstName} {sale.createdBy.lastName} ({sale.createdBy.username})
        </div>
      )}
    </div>
  );

  const renderDocumentsTab = () => (
    <div className="bg-white rounded-lg shadow p-6">
      <h3 className="text-lg font-semibold mb-4">เอกสารที่เกี่ยวข้อง</h3>
      <div className="space-y-4">
        {/* Document list based on status */}
        <div className="border rounded-lg divide-y">
          {DOCUMENT_CONFIGS.map((config) => (
            <DocumentItem
              key={config.id}
              config={config}
              available={config.getAvailable(sale)}
              isLoading={documentLoading === config.id}
              onDownload={() => handleDownloadDocument(config)}
              onPrint={() => handlePrintDocument(config)}
            />
          ))}
        </div>
      </div>
    </div>
  );

  const renderPaymentsTab = () => (
    <div className="space-y-6">
      {/* Payment Summary */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold mb-4">สรุปการชำระเงิน</h3>
        <div className="grid grid-cols-3 gap-4">
          <div className="text-center p-4 bg-blue-50 rounded-lg">
            <p className="text-sm text-gray-700">ยอดรวม</p>
            <p className="text-xl font-bold text-blue-600">{formatCurrency(sale.totalAmount)}</p>
          </div>
          <div className="text-center p-4 bg-green-50 rounded-lg">
            <p className="text-sm text-gray-700">ชำระแล้ว</p>
            <p className="text-xl font-bold text-green-600">{formatCurrency(sale.paidAmount)}</p>
          </div>
          <div className="text-center p-4 bg-red-50 rounded-lg">
            <p className="text-sm text-gray-700">ค้างชำระ</p>
            <p className="text-xl font-bold text-red-600">{formatCurrency(sale.remainingAmount)}</p>
          </div>
        </div>
      </div>

      {/* Payment History */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="px-6 py-4 border-b flex justify-between items-center">
          <h3 className="text-lg font-semibold">ประวัติการชำระเงิน</h3>
          {(user?.role === 'ADMIN' || user?.role === 'ACCOUNTANT') && (
            <Link
              to={`/payments/new?saleId=${sale.id}`}
              className="inline-flex items-center px-3 py-1.5 bg-white border border-gray-300 text-gray-900 rounded-lg hover:bg-gray-50 text-sm"
            >
              <CreditCard className="h-4 w-4 mr-1" />
              บันทึกการชำระเงิน
            </Link>
          )}
        </div>
        {sale.payments && sale.payments.length > 0 ? (
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase">เลขที่ใบเสร็จ</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase">ประเภท</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase">วิธีชำระ</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase">จำนวน</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase">วันที่</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase">สถานะ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {sale.payments.map((payment) => (
                <tr key={payment.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 text-sm font-medium text-blue-600">{payment.receiptNumber}</td>
                  <td className="px-6 py-4 text-sm text-gray-700">{PAYMENT_TYPE_LABELS[payment.paymentType]}</td>
                  <td className="px-6 py-4 text-sm text-gray-700">{PAYMENT_METHOD_LABELS[payment.paymentMethod]}</td>
                  <td className="px-6 py-4 text-sm font-medium">{formatCurrency(payment.amount)}</td>
                  <td className="px-6 py-4 text-sm text-gray-700">{formatDate(payment.paymentDate)}</td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${PAYMENT_STATUS_COLORS[payment.status]}`}>
                      {payment.status === 'ACTIVE' ? 'ใช้งาน' : 'ยกเลิก'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="px-6 py-8 text-center text-gray-700">
            ยังไม่มีการชำระเงิน
          </div>
        )}
      </div>
    </div>
  );

  const renderHistoryTab = () => (
    <div className="bg-white rounded-lg shadow overflow-hidden">
      <div className="px-6 py-4 border-b">
        <h3 className="text-lg font-semibold">ประวัติการเปลี่ยนแปลง</h3>
      </div>
      {sale.history && sale.history.length > 0 ? (
        <div className="p-6">
          <div className="relative">
            {/* Timeline line */}
            <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-gray-200" />

            {/* Timeline items */}
            <div className="space-y-6">
              {sale.history.map((item) => (
                <div key={item.id} className="relative flex items-start ml-8">
                  {/* Timeline dot */}
                  <div className="absolute -left-10 mt-1.5 w-3 h-3 bg-blue-600 rounded-full border-2 border-white" />

                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-900">{item.action}</span>
                      {item.fromStatus && item.toStatus && (
                        <span className="text-xs text-gray-700">
                          {STATUS_LABELS[item.fromStatus as SaleStatus] || item.fromStatus} →{' '}
                          {STATUS_LABELS[item.toStatus as SaleStatus] || item.toStatus}
                        </span>
                      )}
                    </div>
                    {item.notes && (
                      <p className="text-sm text-gray-700 mt-1">{item.notes}</p>
                    )}
                    <p className="text-xs text-gray-700 mt-1">{formatDateTime(item.createdAt)}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="px-6 py-8 text-center text-gray-700">
          ยังไม่มีประวัติการเปลี่ยนแปลง
        </div>
      )}
    </div>
  );

  const tabs: { id: TabType; label: string; icon: React.ReactNode }[] = [
    { id: 'overview', label: 'ภาพรวม', icon: <FileText className="h-4 w-4" /> },
    { id: 'documents', label: 'เอกสาร', icon: <Download className="h-4 w-4" /> },
    { id: 'payments', label: 'การชำระเงิน', icon: <CreditCard className="h-4 w-4" /> },
    { id: 'history', label: 'ประวัติ', icon: <History className="h-4 w-4" /> },
  ];

  return (
    <MainLayout>
      <div className="mb-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate('/sales')}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <ArrowLeft className="h-5 w-5 text-gray-700" />
            </button>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">{sale.saleNumber}</h1>
              <div className="flex items-center gap-2 mt-1">
                <span
                  className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${STATUS_COLORS[sale.status]}`}
                >
                  {STATUS_ICONS[sale.status]}
                  <span className="ml-1">{STATUS_LABELS[sale.status]}</span>
                </span>
                <span className="text-sm text-gray-700">
                  {sale.type === 'RESERVATION_SALE' ? 'ขายผ่านการจอง' : 'ขายตรง'}
                </span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isAdmin && (
              <Link
                to={`/sales/${sale.id}/edit`}
                className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                <Edit className="h-4 w-4 mr-2" />
                แก้ไข
              </Link>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div className="border-b mb-6">
          <nav className="flex gap-4">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-3 border-b-2 transition-colors ${activeTab === tab.id
                  ? 'border-blue-600 text-blue-600 font-medium'
                  : 'border-transparent text-gray-700 hover:text-gray-700 hover:border-gray-300'
                  }`}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        {/* Tab Content */}
        {activeTab === 'overview' && renderOverviewTab()}
        {activeTab === 'documents' && renderDocumentsTab()}
        {activeTab === 'payments' && renderPaymentsTab()}
        {activeTab === 'history' && renderHistoryTab()}
      </div>
    </MainLayout>
  );
}

// Helper component for document items
interface DocumentItemProps {
  config: DocumentConfig;
  available: boolean;
  isLoading: boolean;
  onDownload: () => void;
  onPrint: () => void;
}

function DocumentItem({ config, available, isLoading, onDownload, onPrint }: DocumentItemProps) {
  const { title, description, restricted } = config;

  return (
    <div className={`flex items-center justify-between p-4 ${!available ? 'opacity-50' : ''}`}>
      <div className="flex items-center gap-3">
        <FileText className={`h-5 w-5 ${available ? 'text-blue-600' : 'text-gray-700'}`} />
        <div>
          <p className="text-sm font-medium text-gray-900">{title}</p>
          <p className="text-xs text-gray-700">{description}</p>
          {restricted && (
            <span className="text-xs text-orange-600">จำกัดสิทธิ์การเข้าถึง</span>
          )}
        </div>
      </div>
      {available ? (
        <div className="flex gap-2">
          {isLoading ? (
            <div className="p-2">
              <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
            </div>
          ) : (
            <>
              <button
                onClick={onDownload}
                disabled={isLoading}
                className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors disabled:opacity-50"
                title="ดาวน์โหลด"
              >
                <Download className="h-4 w-4" />
              </button>
              <button
                onClick={onPrint}
                disabled={isLoading}
                className="p-2 text-gray-700 hover:bg-gray-50 rounded-lg transition-colors disabled:opacity-50"
                title="พิมพ์"
              >
                <Printer className="h-4 w-4" />
              </button>
            </>
          )}
        </div>
      ) : (
        <span className="text-xs text-gray-700">ยังไม่พร้อมใช้งาน</span>
      )}
    </div>
  );
}
