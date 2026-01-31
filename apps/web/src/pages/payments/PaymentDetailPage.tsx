import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { paymentService } from '../../services/payment.service';
import type { Payment, PaymentType, PaymentMethod, PaymentStatus } from '../../services/payment.service';
import { MainLayout } from '../../components/layout';
import {
  ArrowLeft,
  CreditCard,
  User,
  FileText,
  Ban,
  Printer,
  CheckCircle,
  XCircle
} from 'lucide-react';

const PAYMENT_TYPE_LABELS: Record<PaymentType, string> = {
  DEPOSIT: 'เงินจอง',
  DOWN_PAYMENT: 'เงินดาวน์',
  FINANCE_PAYMENT: 'ยอดไฟแนนซ์',
  OTHER_EXPENSE: 'ค่าใช้จ่ายอื่น',
  MISCELLANEOUS: 'รายการทั่วไป',
};

const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  CASH: 'เงินสด',
  BANK_TRANSFER: 'โอนเงิน',
  CHEQUE: 'เช็ค',
  CREDIT_CARD: 'บัตรเครดิต',
};

const STATUS_COLORS: Record<PaymentStatus, string> = {
  ACTIVE: 'bg-green-100 text-green-800 border-green-300',
  VOIDED: 'bg-red-100 text-red-800 border-red-300',
};

const STATUS_LABELS: Record<PaymentStatus, string> = {
  ACTIVE: 'ใช้งาน',
  VOIDED: 'ยกเลิก',
};

const STATUS_ICONS: Record<PaymentStatus, React.ReactNode> = {
  ACTIVE: <CheckCircle className="h-5 w-5" />,
  VOIDED: <XCircle className="h-5 w-5" />,
};

export default function PaymentDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [payment, setPayment] = useState<Payment | null>(null);
  const [loading, setLoading] = useState(true);
  const [voiding, setVoiding] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [downloadingBg, setDownloadingBg] = useState(false);
  const [showVoidModal, setShowVoidModal] = useState(false);
  const [voidReason, setVoidReason] = useState('');

  useEffect(() => {
    if (id) {
      fetchPayment(id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const fetchPayment = async (paymentId: string) => {
    try {
      setLoading(true);
      const data = await paymentService.getById(paymentId);
      setPayment(data);
    } catch (error) {
      console.error('Error fetching payment:', error);
      alert('ไม่สามารถโหลดข้อมูลการชำระเงินได้');
      navigate('/payments');
    } finally {
      setLoading(false);
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

  const handleVoid = async () => {
    if (!payment) return;

    if (!voidReason.trim()) {
      alert('กรุณาระบุเหตุผลในการยกเลิก');
      return;
    }

    try {
      setVoiding(true);
      await paymentService.void(payment.id, { voidReason: voidReason.trim() });
      alert('ยกเลิกการชำระเงินสำเร็จ');
      setShowVoidModal(false);
      setVoidReason('');
      // Refresh payment data
      await fetchPayment(payment.id);
    } catch (error) {
      console.error('Error voiding payment:', error);
      alert('ไม่สามารถยกเลิกการชำระเงินได้');
    } finally {
      setVoiding(false);
    }
  };

  const handlePrint = async () => {
    if (!payment) return;
    try {
      setDownloading(true);
      await paymentService.downloadReceipt(payment.id);
    } catch (error) {
      console.error('Error downloading receipt:', error);
      alert('ไม่สามารถดาวน์โหลดใบเสร็จได้');
    } finally {
      setDownloading(false);
    }
  };

  const handlePrintBg = async () => {
    if (!payment) return;
    try {
      setDownloadingBg(true);
      await paymentService.downloadReceiptBg(payment.id);
    } catch (error) {
      console.error('Error downloading receipt:', error);
      alert('ไม่สามารถดาวน์โหลดใบเสร็จได้');
    } finally {
      setDownloadingBg(false);
    }
  };

  if (loading) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center h-64">
          <div className="text-lg text-gray-600">กำลังโหลด...</div>
        </div>
      </MainLayout>
    );
  }

  if (!payment) {
    return (
      <MainLayout>
        <div className="text-center py-12">
          <p className="text-gray-600">ไม่พบข้อมูลการชำระเงิน</p>
          <Link to="/payments" className="text-blue-600 hover:underline mt-4 inline-block">
            กลับไปหน้ารายการ
          </Link>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <button
            onClick={() => navigate('/payments')}
            className="flex items-center text-gray-600 hover:text-gray-900 mb-4"
          >
            <ArrowLeft className="h-5 w-5 mr-1" />
            กลับไปรายการ
          </button>

          <div className="flex justify-between items-start">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">{payment.receiptNumber}</h1>
              <p className="text-gray-500 mt-1">
                บันทึกเมื่อ {formatDateTime(payment.createdAt)}
              </p>
            </div>

            <div className="flex items-center gap-3">
              <span className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full border ${STATUS_COLORS[payment.status]}`}>
                {STATUS_ICONS[payment.status]}
                {STATUS_LABELS[payment.status]}
              </span>

              {payment.status === 'ACTIVE' && (
                <>
                  <button
                    onClick={handlePrintBg}
                    disabled={downloadingBg}
                    className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
                  >
                    <Printer className="h-4 w-4 mr-2" />
                    {downloadingBg ? 'กำลังโหลด...' : 'ใบเสร็จ (ชั่วคราว)'}
                  </button>
                  <button
                    onClick={handlePrint}
                    disabled={downloading}
                    className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
                  >
                    <Printer className="h-4 w-4 mr-2" />
                    {downloading ? 'กำลังโหลด...' : 'พิมพ์ใบเสร็จ'}
                  </button>
                  <button
                    onClick={() => setShowVoidModal(true)}
                    className="inline-flex items-center px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
                  >
                    <Ban className="h-4 w-4 mr-2" />
                    ยกเลิกใบเสร็จ
                  </button>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Void Info Banner */}
        {payment.status === 'VOIDED' && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
            <div className="flex items-start">
              <XCircle className="h-5 w-5 text-red-500 mt-0.5 mr-3" />
              <div>
                <h3 className="font-medium text-red-800">ใบเสร็จนี้ถูกยกเลิกแล้ว</h3>
                <p className="text-sm text-red-700 mt-1">
                  เหตุผล: {payment.voidReason || '-'}
                </p>
                <p className="text-sm text-red-600 mt-1">
                  ยกเลิกเมื่อ: {formatDateTime(payment.voidedAt)}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Main Info Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Payment Info */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold mb-4 flex items-center">
              <CreditCard className="h-5 w-5 mr-2 text-blue-600" />
              ข้อมูลการชำระเงิน
            </h2>
            <dl className="space-y-3">
              <div className="flex justify-between">
                <dt className="text-sm text-gray-500">จำนวนเงิน</dt>
                <dd className="text-lg font-bold text-green-600">{formatCurrency(payment.amount)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-sm text-gray-500">วันที่ชำระ</dt>
                <dd className="text-sm font-medium">{formatDate(payment.paymentDate)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-sm text-gray-500">ประเภท</dt>
                <dd className="text-sm font-medium">{PAYMENT_TYPE_LABELS[payment.paymentType]}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-sm text-gray-500">วิธีชำระ</dt>
                <dd className="text-sm font-medium">{PAYMENT_METHOD_LABELS[payment.paymentMethod]}</dd>
              </div>
              {payment.referenceNumber && (
                <div className="flex justify-between">
                  <dt className="text-sm text-gray-500">เลขที่อ้างอิง</dt>
                  <dd className="text-sm font-mono">{payment.referenceNumber}</dd>
                </div>
              )}
              {payment.issuedBy && (
                <div className="flex justify-between">
                  <dt className="text-sm text-gray-500">ออกโดย</dt>
                  <dd className="text-sm font-medium">{payment.issuedBy}</dd>
                </div>
              )}
            </dl>
          </div>

          {/* Customer Info */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold mb-4 flex items-center">
              <User className="h-5 w-5 mr-2 text-blue-600" />
              ข้อมูลลูกค้า
            </h2>
            <dl className="space-y-3">
              <div>
                <dt className="text-sm text-gray-500">รหัสลูกค้า</dt>
                <dd className="text-sm font-medium">{payment.customer.code}</dd>
              </div>
              <div>
                <dt className="text-sm text-gray-500">ชื่อลูกค้า</dt>
                <dd className="text-sm font-medium">{payment.customer.name}</dd>
              </div>
            </dl>
            <Link
              to={`/customers/${payment.customer.id}`}
              className="text-blue-600 hover:underline text-sm mt-4 inline-block"
            >
              ดูข้อมูลลูกค้าเพิ่มเติม →
            </Link>
          </div>

          {/* Sale Info (only if linked to a sale) */}
          {payment.sale ? (
            <div className="bg-white rounded-lg shadow p-6 md:col-span-2">
              <h2 className="text-lg font-semibold mb-4 flex items-center">
                <FileText className="h-5 w-5 mr-2 text-blue-600" />
                ข้อมูลการขาย
              </h2>
              <dl className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <dt className="text-sm text-gray-500">เลขที่ขาย</dt>
                  <dd className="text-sm font-medium">
                    <Link to={`/sales/${payment.sale.id}`} className="text-blue-600 hover:underline">
                      {payment.sale.saleNumber}
                    </Link>
                  </dd>
                </div>
                {payment.sale.totalAmount !== undefined && (
                  <div>
                    <dt className="text-sm text-gray-500">ยอดรวมการขาย</dt>
                    <dd className="text-sm font-medium">{formatCurrency(payment.sale.totalAmount)}</dd>
                  </div>
                )}
                {payment.sale.remainingAmount !== undefined && (
                  <div>
                    <dt className="text-sm text-gray-500">ยอดค้างชำระ (หลังรายการนี้)</dt>
                    <dd className={`text-sm font-medium ${payment.sale.remainingAmount > 0 ? 'text-red-600' : 'text-green-600'}`}>
                      {formatCurrency(payment.sale.remainingAmount)}
                    </dd>
                  </div>
                )}
              </dl>
            </div>
          ) : (
            <div className="bg-white rounded-lg shadow p-6 md:col-span-2">
              <h2 className="text-lg font-semibold mb-4 flex items-center">
                <FileText className="h-5 w-5 mr-2 text-blue-600" />
                รายละเอียดรายการ
              </h2>
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                <p className="text-yellow-800 font-medium">รายการทั่วไป (ไม่เชื่อมกับการขาย)</p>
                {payment.description && (
                  <p className="text-gray-700 mt-2">{payment.description}</p>
                )}
              </div>
            </div>
          )}

          {/* Description */}
          {payment.description && (
            <div className="bg-white rounded-lg shadow p-6 md:col-span-2">
              <h2 className="text-lg font-semibold mb-4">หมายเหตุ</h2>
              <p className="text-gray-700 whitespace-pre-wrap">{payment.description}</p>
            </div>
          )}
        </div>

        {/* Created By */}
        {payment.createdBy && (
          <div className="mt-4 text-sm text-gray-500">
            สร้างโดย: {payment.createdBy.firstName} {payment.createdBy.lastName} ({payment.createdBy.username})
          </div>
        )}
      </div>

      {/* Void Modal */}
      {showVoidModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-lg max-w-md w-full mx-4 p-6">
            <h3 className="text-lg font-semibold mb-4 flex items-center text-red-600">
              <Ban className="h-5 w-5 mr-2" />
              ยืนยันการยกเลิกใบเสร็จ
            </h3>
            <p className="text-gray-600 mb-4">
              คุณต้องการยกเลิกใบเสร็จเลขที่ <strong>{payment.receiptNumber}</strong> หรือไม่?
            </p>
            <p className="text-sm text-gray-500 mb-4">
              {payment.sale
                ? `การยกเลิกจะทำให้ยอดชำระแล้วของการขายลดลง ${formatCurrency(payment.amount)}`
                : 'การยกเลิกจะทำให้รายการนี้ถูกยกเลิก'
              }
            </p>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                เหตุผลในการยกเลิก <span className="text-red-500">*</span>
              </label>
              <textarea
                value={voidReason}
                onChange={(e) => setVoidReason(e.target.value)}
                rows={3}
                placeholder="ระบุเหตุผลในการยกเลิก..."
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500"
              />
            </div>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowVoidModal(false);
                  setVoidReason('');
                }}
                className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                ยกเลิก
              </button>
              <button
                onClick={handleVoid}
                disabled={voiding || !voidReason.trim()}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {voiding ? 'กำลังยกเลิก...' : 'ยืนยันการยกเลิก'}
              </button>
            </div>
          </div>
        </div>
      )}
    </MainLayout>
  );
}
