import { useState, useMemo } from 'react';
import { X, Wallet, AlertCircle, TrendingUp, Calculator } from 'lucide-react';
import type { DebtSummary, PaymentMethod } from '../../services/interest.service';

interface DebtPaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: {
    amount: number;
    paymentMethod: PaymentMethod;
    paymentDate?: string;
    referenceNumber?: string;
    notes?: string;
  }) => Promise<void>;
  debtSummary: DebtSummary;
  stockInfo: {
    vin: string;
    vehicleModel: {
      brand: string;
      model: string;
      variant: string | null;
      year: number;
    };
  };
}

const PAYMENT_METHODS: { value: PaymentMethod; label: string }[] = [
  { value: 'BANK_TRANSFER', label: 'โอนเงิน' },
  { value: 'CASH', label: 'เงินสด' },
  { value: 'CHEQUE', label: 'เช็ค' },
  { value: 'CREDIT_CARD', label: 'บัตรเครดิต' },
];

export default function DebtPaymentModal({
  isOpen,
  onClose,
  onSubmit,
  debtSummary,
  stockInfo,
}: DebtPaymentModalProps) {
  const [amount, setAmount] = useState<string>('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('BANK_TRANSFER');
  const [paymentDate, setPaymentDate] = useState<string>(
    new Date().toISOString().split('T')[0]
  );
  const [referenceNumber, setReferenceNumber] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('th-TH', {
      style: 'currency',
      currency: 'THB',
      minimumFractionDigits: 2,
    }).format(value);
  };

  const formatNumber = (value: number) => {
    return new Intl.NumberFormat('th-TH', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  };

  // คำนวณ payment allocation (interest-first)
  const paymentAllocation = useMemo(() => {
    const paymentAmount = parseFloat(amount) || 0;
    const accruedInterest = debtSummary.accruedInterest || 0;
    const remainingDebt = debtSummary.remainingDebt;
    
    let interestPaid = 0;
    let principalPaid = 0;
    
    if (paymentAmount >= accruedInterest) {
      interestPaid = accruedInterest;
      principalPaid = paymentAmount - accruedInterest;
    } else {
      interestPaid = paymentAmount;
      principalPaid = 0;
    }
    
    const newRemainingDebt = remainingDebt - principalPaid;
    
    return {
      interestPaid,
      principalPaid,
      newRemainingDebt: Math.max(0, newRemainingDebt),
      isFullPayment: newRemainingDebt <= 0.01,
    };
  }, [amount, debtSummary.accruedInterest, debtSummary.remainingDebt]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const paymentAmount = parseFloat(amount);
    
    if (!paymentAmount || paymentAmount <= 0) {
      setError('กรุณาระบุจำนวนเงินที่ถูกต้อง');
      return;
    }
    
    // ตรวจสอบกับ totalPayoffAmount (เงินต้น + ดอกเบี้ย)
    if (paymentAmount > debtSummary.totalPayoffAmount) {
      setError(`จำนวนเงิน (${formatCurrency(paymentAmount)}) มากกว่ายอดปิดหนี้ (${formatCurrency(debtSummary.totalPayoffAmount)})`);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      
      await onSubmit({
        amount: paymentAmount,
        paymentMethod,
        paymentDate: paymentDate || undefined,
        referenceNumber: referenceNumber || undefined,
        notes: notes || undefined,
      });
      
      // Reset form
      setAmount('');
      setReferenceNumber('');
      setNotes('');
      onClose();
    } catch (err) {
      console.error('Error submitting payment:', err);
      setError('ไม่สามารถบันทึกการจ่ายเงินได้ กรุณาลองใหม่');
    } finally {
      setLoading(false);
    }
  };

  const handlePayFull = () => {
    // จ่ายทั้งหมด = เงินต้น + ดอกเบี้ยสะสม
    setAmount(debtSummary.totalPayoffAmount.toString());
  };

  if (!isOpen) return null;

  const paymentAmountNum = parseFloat(amount) || 0;
  const hasAccruedInterest = (debtSummary.totalAccruedInterest || 0) > 0 || (debtSummary.paidInterestAmount || 0) > 0;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex min-h-full items-center justify-center p-4">
        {/* Backdrop */}
        <div className="fixed inset-0 bg-black/50" onClick={onClose} />
        
        {/* Modal */}
        <div className="relative bg-white rounded-lg shadow-xl w-full max-w-lg">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-100 rounded-full">
                <Wallet className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900">จ่ายหนี้รถ</h3>
                <p className="text-sm text-gray-500">
                  {stockInfo.vehicleModel.brand} {stockInfo.vehicleModel.model} • {stockInfo.vin}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 text-gray-400 hover:text-gray-500 hover:bg-gray-100 rounded-lg"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Debt Summary - แสดงครบทั้ง เงินต้น + ดอกเบี้ย */}
          <div className="p-4 bg-gray-50 border-b space-y-3">
            {/* Principal (เงินต้น) */}
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <p className="text-xs text-gray-500">เงินต้นทั้งหมด</p>
                <p className="font-semibold text-gray-900">{formatCurrency(debtSummary.debtAmount)}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">เงินต้นที่จ่ายแล้ว</p>
                <p className="font-semibold text-green-600">{formatCurrency(debtSummary.paidDebtAmount)}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">เงินต้นคงเหลือ</p>
                <p className="font-semibold text-gray-900">{formatCurrency(debtSummary.remainingDebt)}</p>
              </div>
            </div>
            
            {/* Interest (ดอกเบี้ย) */}
            {hasAccruedInterest && (
              <div className="pt-3 border-t border-gray-200">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-orange-500" />
                    <span className="text-sm font-medium text-gray-700">ดอกเบี้ย</span>
                  </div>
                  <span className="text-sm text-gray-500">
                    อัตรา {debtSummary.currentInterestRate?.toFixed(2) || 0}% ต่อปี
                  </span>
                </div>
                {/* Total Accrued Interest */}
                <div className="bg-purple-50 rounded-lg p-2 mb-2">
                  <div className="flex justify-between items-center">
                    <p className="text-xs text-purple-600">ดอกเบี้ยสะสมรวม</p>
                    <p className="font-bold text-purple-600">{formatCurrency(debtSummary.totalAccruedInterest || 0)}</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4 text-center">
                  <div className="bg-orange-50 rounded-lg p-2">
                    <p className="text-xs text-orange-600">ดอกเบี้ยค้างชำระ</p>
                    <p className="font-bold text-orange-600">{formatCurrency(debtSummary.accruedInterest)}</p>
                  </div>
                  <div className="bg-gray-100 rounded-lg p-2">
                    <p className="text-xs text-gray-600">ดอกเบี้ยที่จ่ายแล้ว</p>
                    <p className="font-semibold text-gray-700">{formatCurrency(debtSummary.paidInterestAmount)}</p>
                  </div>
                </div>
              </div>
            )}

            {/* Total Payoff */}
            <div className="pt-3 border-t border-gray-200">
              <div className="flex items-center justify-between bg-blue-50 rounded-lg p-3">
                <div className="flex items-center gap-2">
                  <Calculator className="w-5 h-5 text-blue-600" />
                  <span className="font-medium text-blue-900">ยอดปิดหนี้ทั้งหมด</span>
                </div>
                <span className="text-xl font-bold text-blue-600">
                  {formatCurrency(debtSummary.totalPayoffAmount)}
                </span>
              </div>
              <p className="text-xs text-gray-500 mt-1 text-center">
                = เงินต้นคงเหลือ ({formatNumber(debtSummary.remainingDebt)}) + ดอกเบี้ยค้าง ({formatNumber(debtSummary.accruedInterest || 0)})
              </p>
            </div>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="p-4 space-y-4">
            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-700">
                <AlertCircle className="w-5 h-5 shrink-0" />
                <p className="text-sm">{error}</p>
              </div>
            )}

            {/* Amount */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                จำนวนเงิน (บาท) <span className="text-red-500">*</span>
              </label>
              <div className="flex gap-2">
                <input
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                  step="0.01"
                  min="0.01"
                  max={debtSummary.totalPayoffAmount}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  required
                />
                <button
                  type="button"
                  onClick={handlePayFull}
                  className="px-3 py-2 text-sm bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 font-medium"
                >
                  ปิดหนี้ทั้งหมด
                </button>
              </div>
              
              {/* Payment Allocation Preview */}
              {paymentAmountNum > 0 && (
                <div className="mt-2 p-2 bg-gray-50 rounded-lg text-xs space-y-1">
                  <p className="font-medium text-gray-700">การจัดสรรการจ่าย (จ่ายดอกเบี้ยก่อน):</p>
                  <div className="flex justify-between">
                    <span className="text-orange-600">→ จ่ายดอกเบี้ย:</span>
                    <span className="font-medium">{formatCurrency(paymentAllocation.interestPaid)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-blue-600">→ ลดเงินต้น:</span>
                    <span className="font-medium">{formatCurrency(paymentAllocation.principalPaid)}</span>
                  </div>
                  <div className="flex justify-between pt-1 border-t border-gray-200">
                    <span className="text-gray-600">เงินต้นคงเหลือ:</span>
                    <span className="font-bold">{formatCurrency(paymentAllocation.newRemainingDebt)}</span>
                  </div>
                  {paymentAllocation.isFullPayment && (
                    <p className="text-green-600 font-medium mt-1">🎉 ปิดหนี้!</p>
                  )}
                </div>
              )}
            </div>

            {/* Payment Method */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                วิธีการจ่าย <span className="text-red-500">*</span>
              </label>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                required
              >
                {PAYMENT_METHODS.map((method) => (
                  <option key={method.value} value={method.value}>
                    {method.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Payment Date */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                วันที่จ่าย
              </label>
              <input
                type="date"
                value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            {/* Reference Number */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                เลขที่อ้างอิง / เลขที่เช็ค
              </label>
              <input
                type="text"
                value={referenceNumber}
                onChange={(e) => setReferenceNumber(e.target.value)}
                placeholder="เช่น เลขที่สลิป, เลขที่เช็ค"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            {/* Notes */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                หมายเหตุ
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="หมายเหตุเพิ่มเติม (ถ้ามี)"
                rows={2}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
              />
            </div>

            {/* Warning for full payment */}
            {paymentAllocation.isFullPayment && (
              <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm">
                <p className="font-medium">✨ การจ่ายครั้งนี้จะปิดหนี้ทั้งหมด</p>
                <p className="mt-1 text-xs">ระบบจะหยุดคิดดอกเบี้ยอัตโนมัติหลังจากปิดหนี้</p>
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium"
              >
                ยกเลิก
              </button>
              <button
                type="submit"
                disabled={loading || !amount}
                className="flex-1 px-4 py-2.5 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
              >
                {loading ? 'กำลังบันทึก...' : 'บันทึกการจ่าย'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
