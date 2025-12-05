import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { interestService } from '../../services/interest.service';
import type { InterestDetail, DebtSummary, DebtPayment, PaymentMethod } from '../../services/interest.service';
import { MainLayout } from '../../components/layout';
import DebtPaymentModal from '../../components/interest/DebtPaymentModal';
import {
  ArrowLeft,
  Edit,
  PlayCircle,
  PauseCircle,
  Calendar,
  DollarSign,
  Clock,
  AlertCircle,
  TrendingUp,
  History,
  Car,
  Wallet,
  CheckCircle,
  Plus,
  Banknote,
} from 'lucide-react';

export default function InterestDetailPage() {
  const { stockId } = useParams<{ stockId: string }>();
  const navigate = useNavigate();
  const [detail, setDetail] = useState<InterestDetail | null>(null);
  const [debtSummary, setDebtSummary] = useState<DebtSummary | null>(null);
  const [debtPayments, setDebtPayments] = useState<DebtPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [showDebtPaymentModal, setShowDebtPaymentModal] = useState(false);

  useEffect(() => {
    if (stockId) {
      fetchDetail();
      fetchDebtData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stockId]);

  const fetchDetail = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await interestService.getById(stockId!);
      setDetail(data);
    } catch (err) {
      console.error('Error fetching interest detail:', err);
      setError('ไม่สามารถโหลดข้อมูลได้');
    } finally {
      setLoading(false);
    }
  };

  const fetchDebtData = async () => {
    try {
      const [summary, payments] = await Promise.all([
        interestService.getDebtSummary(stockId!),
        interestService.getDebtPayments(stockId!),
      ]);
      setDebtSummary(summary);
      setDebtPayments(payments);
    } catch (err) {
      console.error('Error fetching debt data:', err);
    }
  };

  const handleDebtPayment = async (data: {
    amount: number;
    paymentMethod: PaymentMethod;
    paymentDate?: string;
    referenceNumber?: string;
    notes?: string;
  }) => {
    const result = await interestService.recordDebtPayment(stockId!, data);
    
    // Show success message
    if (result.debtPaidOff) {
      alert('🎉 ปิดหนี้เรียบร้อยแล้ว! ระบบหยุดคิดดอกเบี้ยอัตโนมัติ');
    } else if (result.interestAdjusted) {
      alert('บันทึกการจ่ายเงินเรียบร้อย ดอกเบี้ยจะคิดจากยอดหนี้คงเหลือใหม่');
    } else {
      alert('บันทึกการจ่ายเงินเรียบร้อยแล้ว');
    }
    
    // Refresh data
    await Promise.all([fetchDetail(), fetchDebtData()]);
  };

  const handleStopCalculation = async () => {
    if (!window.confirm('คุณต้องการหยุดคิดดอกเบี้ยสำหรับรถคันนี้หรือไม่?')) {
      return;
    }

    try {
      setActionLoading(true);
      await interestService.stopCalculation(stockId!, 'Stopped by user');
      await fetchDetail();
    } catch (err) {
      console.error('Error stopping calculation:', err);
      alert('ไม่สามารถหยุดคิดดอกเบี้ยได้');
    } finally {
      setActionLoading(false);
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
      month: 'long',
      day: 'numeric',
    });
  };

  const formatShortDate = (dateString: string) => {
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
      <span className={`px-3 py-1 text-sm font-medium rounded-full ${config.className}`}>
        {config.label}
      </span>
    );
  };

  if (loading) {
    return (
      <MainLayout>
        <div className="flex justify-center items-center min-h-96">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
      </MainLayout>
    );
  }

  if (error || !detail) {
    return (
      <MainLayout>
        <div className="text-center py-12">
          <AlertCircle className="w-16 h-16 mx-auto mb-4 text-red-500" />
          <h2 className="text-xl font-semibold text-gray-900 mb-2">
            {error || 'ไม่พบข้อมูล'}
          </h2>
          <button
            onClick={() => navigate('/interest')}
            className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            กลับไปหน้ารายการ
          </button>
        </div>
      </MainLayout>
    );
  }

  const { stock, summary, periods } = detail;

  return (
    <MainLayout>
      <div className="mb-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center">
            <button
              onClick={() => navigate('/interest')}
              className="mr-4 p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                รายละเอียดดอกเบี้ย
              </h1>
              <p className="text-gray-500">
                {stock.vehicleModel.brand} {stock.vehicleModel.model} {stock.vehicleModel.variant}
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            {summary.isCalculating ? (
              <>
                <Link
                  to={`/interest/${stockId}/edit`}
                  className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  <Edit className="w-4 h-4 mr-2" />
                  แก้ไขอัตราดอกเบี้ย
                </Link>
                <button
                  onClick={handleStopCalculation}
                  disabled={actionLoading}
                  className="inline-flex items-center px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
                >
                  <PauseCircle className="w-4 h-4 mr-2" />
                  หยุดคิดดอกเบี้ย
                </button>
              </>
            ) : (
              <Link
                to={`/interest/${stockId}/edit?resume=true`}
                className="inline-flex items-center px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
              >
                <PlayCircle className="w-4 h-4 mr-2" />
                เริ่มคิดดอกเบี้ยใหม่
              </Link>
            )}
          </div>
        </div>

        {/* Vehicle Info Card */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center">
              <div className="p-3 bg-blue-100 rounded-full mr-4">
                <Car className="w-6 h-6 text-blue-600" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-gray-900">
                  {stock.vehicleModel.brand} {stock.vehicleModel.model}
                </h2>
                <p className="text-gray-500">
                  {stock.vehicleModel.variant} • {stock.vehicleModel.year}
                </p>
              </div>
            </div>
            {getStatusBadge(stock.status)}
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className="text-sm text-gray-500">VIN</p>
              <p className="font-mono text-sm font-medium">{stock.vin}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">สี</p>
              <p className="font-medium">{stock.exteriorColor}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">วันเริ่มคิดดอกเบี้ย</p>
              <p className="font-medium">
                {formatDate(stock.interestStartDate)}
                {stock.orderDate && (
                  <span className="ml-1 text-xs text-gray-500">(สั่งซื้อ)</span>
                )}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-500">ไฟแนนซ์</p>
              <p className="font-medium">{stock.financeProvider || '-'}</p>
            </div>
          </div>
        </div>

        {/* Cost & Interest Summary */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          {/* Cost Breakdown */}
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
              <DollarSign className="w-5 h-5 mr-2 text-green-600" />
              รายละเอียดต้นทุน
            </h3>
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-gray-600">ราคาทุนฐาน</span>
                <span className="font-medium">{formatCurrency(stock.baseCost)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">ค่าขนส่ง</span>
                <span className="font-medium">{formatCurrency(stock.transportCost)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">ค่าอุปกรณ์เสริม</span>
                <span className="font-medium">{formatCurrency(stock.accessoryCost)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">ค่าใช้จ่ายอื่นๆ</span>
                <span className="font-medium">{formatCurrency(stock.otherCosts)}</span>
              </div>
              <hr />
              <div className="flex justify-between text-lg">
                <span className="font-semibold text-gray-900">ต้นทุนรวม</span>
                <span className="font-bold text-gray-900">{formatCurrency(stock.totalCost)}</span>
              </div>
            </div>
          </div>

          {/* Interest Summary */}
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
              <TrendingUp className="w-5 h-5 mr-2 text-orange-600" />
              สรุปดอกเบี้ย
            </h3>
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-gray-600">สถานะการคิดดอกเบี้ย</span>
                {summary.isCalculating ? (
                  <span className="inline-flex items-center text-green-600 font-medium">
                    <PlayCircle className="w-4 h-4 mr-1" />
                    กำลังคิด
                  </span>
                ) : (
                  <span className="inline-flex items-center text-red-600 font-medium">
                    <PauseCircle className="w-4 h-4 mr-1" />
                    หยุดแล้ว
                  </span>
                )}
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">อัตราดอกเบี้ยปัจจุบัน</span>
                <span className="font-medium text-purple-600">{summary.currentRate.toFixed(2)}% ต่อปี</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">จำนวนวันรวม</span>
                <span className="font-medium">{summary.totalDays} วัน</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">จำนวน Period</span>
                <span className="font-medium">{summary.periodCount} ครั้ง</span>
              </div>
              <hr />
              <div className="flex justify-between text-lg">
                <span className="font-semibold text-gray-900">ดอกเบี้ยสะสมรวม</span>
                <span className="font-bold text-orange-600">
                  {formatCurrency(summary.totalAccumulatedInterest)}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Debt Management Section */}
        {debtSummary && (
          <div className="bg-white rounded-lg shadow p-6 mb-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900 flex items-center">
                <Wallet className="w-5 h-5 mr-2 text-purple-600" />
                สถานะหนี้รถในสต็อก
              </h3>
              {/* แสดงปุ่มจ่ายหนี้ถ้ามี financeProvider และยังไม่ปิดหนี้ */}
              {(debtSummary.debtStatus === 'ACTIVE' || (debtSummary.hasFinanceProvider && debtSummary.debtStatus !== 'PAID_OFF')) && (
                <button
                  onClick={() => setShowDebtPaymentModal(true)}
                  className="inline-flex items-center px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  จ่ายหนี้
                </button>
              )}
            </div>

            {/* ไม่มี Finance Provider = ซื้อเงินสด */}
            {!debtSummary.hasFinanceProvider ? (
              <div className="text-center py-6 text-gray-500">
                <Banknote className="w-12 h-12 mx-auto mb-2 text-gray-400" />
                <p>ไม่มีหนี้ (ซื้อเงินสด)</p>
              </div>
            ) : debtSummary.debtStatus === 'PAID_OFF' ? (
              <>
                {/* Debt Status Badge - Paid Off */}
                <div className="flex justify-center mb-4">
                  <span className="inline-flex items-center px-4 py-2 bg-green-100 text-green-800 rounded-full text-sm font-medium">
                    <CheckCircle className="w-4 h-4 mr-2" />
                    ปิดหนี้แล้ว {debtSummary.debtPaidOffDate && `(${formatDate(debtSummary.debtPaidOffDate)})`}
                  </span>
                </div>

                {/* Debt Progress Bar - 100% */}
                <div className="mb-4">
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-gray-600">ความคืบหน้าการจ่ายหนี้</span>
                    <span className="font-medium">100%</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-3">
                    <div className="bg-green-500 h-3 rounded-full w-full" />
                  </div>
                </div>

                {/* Debt Details */}
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div className="p-3 bg-gray-50 rounded-lg">
                    <p className="text-xs text-gray-500 mb-1">หนี้เริ่มต้น</p>
                    <p className="font-semibold text-gray-900">{formatCurrency(debtSummary.debtAmount)}</p>
                  </div>
                  <div className="p-3 bg-green-50 rounded-lg">
                    <p className="text-xs text-gray-500 mb-1">จ่ายไปแล้ว</p>
                    <p className="font-semibold text-green-600">{formatCurrency(debtSummary.paidDebtAmount)}</p>
                  </div>
                  <div className="p-3 bg-green-50 rounded-lg">
                    <p className="text-xs text-gray-500 mb-1">คงเหลือ</p>
                    <p className="font-bold text-green-600">{formatCurrency(0)}</p>
                  </div>
                </div>
              </>
            ) : (
              <>
                {/* Debt Status Badge - Active */}
                <div className="flex justify-center mb-4">
                  <span className="inline-flex items-center px-4 py-2 bg-orange-100 text-orange-800 rounded-full text-sm font-medium">
                    <Clock className="w-4 h-4 mr-2" />
                    มีหนี้ค้างชำระ
                  </span>
                </div>

                {/* Debt Progress Bar */}
                <div className="mb-4">
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-gray-600">ความคืบหน้าการจ่ายหนี้</span>
                    <span className="font-medium">
                      {((debtSummary.paidDebtAmount / debtSummary.debtAmount) * 100).toFixed(1)}%
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-3">
                    <div
                      className="bg-green-500 h-3 rounded-full transition-all duration-500"
                      style={{ width: `${(debtSummary.paidDebtAmount / debtSummary.debtAmount) * 100}%` }}
                    />
                  </div>
                </div>

                {/* Debt Details */}
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div className="p-3 bg-gray-50 rounded-lg">
                    <p className="text-xs text-gray-500 mb-1">เงินต้นเริ่มต้น</p>
                    <p className="font-semibold text-gray-900">{formatCurrency(debtSummary.debtAmount)}</p>
                  </div>
                  <div className="p-3 bg-green-50 rounded-lg">
                    <p className="text-xs text-gray-500 mb-1">เงินต้นจ่ายแล้ว</p>
                    <p className="font-semibold text-green-600">{formatCurrency(debtSummary.paidDebtAmount)}</p>
                  </div>
                  <div className="p-3 bg-orange-50 rounded-lg">
                    <p className="text-xs text-gray-500 mb-1">เงินต้นคงเหลือ</p>
                    <p className="font-bold text-orange-600">{formatCurrency(debtSummary.remainingDebt)}</p>
                  </div>
                </div>

                {/* Interest Details */}
                {((debtSummary.totalAccruedInterest || 0) > 0 || debtSummary.paidInterestAmount > 0) && (
                  <div className="mt-4 pt-4 border-t border-gray-200">
                    <h4 className="text-sm font-medium text-gray-700 mb-3 flex items-center">
                      <TrendingUp className="w-4 h-4 mr-1 text-orange-500" />
                      ดอกเบี้ย (อัตรา {debtSummary.currentInterestRate?.toFixed(2) || 0}% ต่อปี)
                    </h4>
                    {/* Total Accrued Interest */}
                    <div className="p-3 bg-purple-50 rounded-lg mb-3">
                      <div className="flex justify-between items-center">
                        <p className="text-xs text-gray-500">ดอกเบี้ยสะสมรวม</p>
                        <p className="font-bold text-purple-600">{formatCurrency(debtSummary.totalAccruedInterest || 0)}</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4 text-center">
                      <div className="p-3 bg-orange-50 rounded-lg">
                        <p className="text-xs text-gray-500 mb-1">ดอกเบี้ยค้างชำระ</p>
                        <p className="font-bold text-orange-600">{formatCurrency(debtSummary.accruedInterest || 0)}</p>
                      </div>
                      <div className="p-3 bg-green-50 rounded-lg">
                        <p className="text-xs text-gray-500 mb-1">ดอกเบี้ยจ่ายแล้ว</p>
                        <p className="font-semibold text-green-600">{formatCurrency(debtSummary.paidInterestAmount || 0)}</p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Total Payoff */}
                <div className="mt-4 pt-4 border-t border-gray-200">
                  <div className="p-4 bg-blue-50 rounded-lg">
                    <div className="flex justify-between items-center">
                      <div>
                        <p className="text-sm text-blue-700 font-medium">ยอดปิดหนี้ทั้งหมด</p>
                        <p className="text-xs text-blue-600">(เงินต้น + ดอกเบี้ยค้างชำระ)</p>
                      </div>
                      <p className="text-xl font-bold text-blue-700">{formatCurrency(debtSummary.totalPayoffAmount || debtSummary.remainingDebt)}</p>
                    </div>
                  </div>
                </div>

                {/* Payment History */}
                {debtPayments.length > 0 && (
                  <div className="mt-4 pt-4 border-t">
                    <h4 className="text-sm font-medium text-gray-700 mb-3">ประวัติการจ่ายหนี้</h4>
                    <div className="space-y-2 max-h-64 overflow-y-auto">
                      {debtPayments.map((payment, index) => (
                        <div key={payment.id} className="p-3 bg-gray-50 rounded-lg text-sm">
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-3">
                              <span className="w-6 h-6 flex items-center justify-center bg-green-100 text-green-600 rounded-full text-xs font-medium">
                                {debtPayments.length - index}
                              </span>
                              <div>
                                <p className="font-bold text-gray-900">{formatCurrency(payment.amount)}</p>
                                <p className="text-xs text-gray-500">
                                  {formatDate(payment.paymentDate)} • {payment.paymentMethod === 'CASH' ? 'เงินสด' : payment.paymentMethod === 'BANK_TRANSFER' ? 'โอนเงิน' : payment.paymentMethod === 'CHEQUE' ? 'เช็ค' : 'บัตรเครดิต'}
                                </p>
                              </div>
                            </div>
                            <div className="text-right text-xs text-gray-500">
                              <p>คงเหลือ: {formatCurrency(payment.principalAfter)}</p>
                            </div>
                          </div>
                          {/* Payment Allocation Details */}
                          {(payment.interestPaid > 0 || payment.principalPaid > 0) && (
                            <div className="flex gap-4 ml-9 pt-2 border-t border-gray-200">
                              <div className="flex items-center gap-1">
                                <span className="text-xs text-orange-600">ดอกเบี้ย:</span>
                                <span className="text-xs font-medium text-orange-700">{formatCurrency(payment.interestPaid || 0)}</span>
                              </div>
                              <div className="flex items-center gap-1">
                                <span className="text-xs text-blue-600">เงินต้น:</span>
                                <span className="text-xs font-medium text-blue-700">{formatCurrency(payment.principalPaid || 0)}</span>
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* Period History */}
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="p-6 border-b border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900 flex items-center">
              <History className="w-5 h-5 mr-2 text-blue-600" />
              ประวัติการเปลี่ยนแปลงอัตราดอกเบี้ย
            </h3>
          </div>

          {periods.length === 0 ? (
            <div className="p-12 text-center text-gray-500">
              <Clock className="w-12 h-12 mx-auto mb-4 text-gray-400" />
              <p>ยังไม่มีประวัติการเปลี่ยนแปลงดอกเบี้ย</p>
              {!summary.isCalculating && stock.status !== 'SOLD' && (
                <Link
                  to={`/interest/${stockId}/edit?initialize=true`}
                  className="mt-4 inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  <PlayCircle className="w-4 h-4 mr-2" />
                  เริ่มคิดดอกเบี้ย
                </Link>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      ลำดับ
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      ช่วงเวลา
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      อัตราดอกเบี้ย
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      ฐานเงินต้น
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      เงินต้น
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      จำนวนวัน
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      ดอกเบี้ย
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      หมายเหตุ
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {periods.map((period, index) => (
                    <tr key={period.id} className={!period.endDate ? 'bg-blue-50' : ''}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {index + 1}
                        {!period.endDate && (
                          <span className="ml-2 px-2 py-0.5 text-xs bg-blue-100 text-blue-800 rounded-full">
                            ปัจจุบัน
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        <div className="flex items-center text-gray-600">
                          <Calendar className="w-4 h-4 mr-2" />
                          {formatShortDate(period.startDate)}
                          <span className="mx-2">→</span>
                          {period.endDate ? formatShortDate(period.endDate) : 'ปัจจุบัน'}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-right">
                        <span className="font-medium text-purple-600">
                          {period.annualRate.toFixed(2)}%
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                        {period.principalBase === 'BASE_COST_ONLY' ? 'ทุนฐาน' : 'ทุนรวม'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-900">
                        {formatCurrency(period.principalAmount)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-900">
                        {period.daysCount} วัน
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-right">
                        <span className="font-medium text-orange-600">
                          {formatCurrency(period.calculatedInterest)}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500 max-w-xs truncate">
                        {period.notes || '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-gray-50">
                  <tr>
                    <td colSpan={5} className="px-6 py-4 text-right font-semibold text-gray-900">
                      รวมทั้งหมด
                    </td>
                    <td className="px-6 py-4 text-right font-semibold text-gray-900">
                      {summary.totalDays} วัน
                    </td>
                    <td className="px-6 py-4 text-right font-bold text-orange-600">
                      {formatCurrency(summary.totalAccumulatedInterest)}
                    </td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Debt Payment Modal - แสดงเมื่อมี financeProvider และยังไม่ปิดหนี้ (รวมถึง NO_DEBT ที่มี finance) */}
      {debtSummary && debtSummary.hasFinanceProvider && debtSummary.debtStatus !== 'PAID_OFF' && (
        <DebtPaymentModal
          isOpen={showDebtPaymentModal}
          onClose={() => setShowDebtPaymentModal(false)}
          onSubmit={handleDebtPayment}
          debtSummary={debtSummary}
          stockInfo={{
            vin: stock.vin,
            vehicleModel: stock.vehicleModel,
          }}
        />
      )}
    </MainLayout>
  );
}
