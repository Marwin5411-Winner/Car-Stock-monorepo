import { useState } from 'react';
import { X, Wallet, AlertCircle } from 'lucide-react';
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const paymentAmount = parseFloat(amount);
    
    if (!paymentAmount || paymentAmount <= 0) {
      setError('กรุณาระบุจำนวนเงินที่ถูกต้อง');
      return;
    }
    
    if (paymentAmount > debtSummary.remainingDebt) {
      setError(`จำนวนเงิน (${formatCurrency(paymentAmount)}) มากกว่าหนี้คงเหลือ (${formatCurrency(debtSummary.remainingDebt)})`);
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
    setAmount(debtSummary.remainingDebt.toString());
  };

  if (!isOpen) return null;

  const paymentAmountNum = parseFloat(amount) || 0;
  const remainingAfterPayment = debtSummary.remainingDebt - paymentAmountNum;
  const isFullPayment = paymentAmountNum > 0 && remainingAfterPayment === 0;

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

          {/* Debt Summary */}
          <div className="p-4 bg-gray-50 border-b">
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <p className="text-xs text-gray-500">หนี้ทั้งหมด</p>
                <p className="font-semibold text-gray-900">{formatCurrency(debtSummary.debtAmount)}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">จ่ายไปแล้ว</p>
                <p className="font-semibold text-green-600">{formatCurrency(debtSummary.paidDebtAmount)}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">คงเหลือ</p>
                <p className="font-bold text-orange-600">{formatCurrency(debtSummary.remainingDebt)}</p>
              </div>
            </div>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="p-4 space-y-4">
            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-700">
                <AlertCircle className="w-5 h-5 flex-shrink-0" />
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
                  max={debtSummary.remainingDebt}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  required
                />
                <button
                  type="button"
                  onClick={handlePayFull}
                  className="px-3 py-2 text-sm bg-orange-100 text-orange-700 rounded-lg hover:bg-orange-200"
                >
                  จ่ายทั้งหมด
                </button>
              </div>
              {paymentAmountNum > 0 && (
                <p className="mt-1 text-xs text-gray-500">
                  หลังจ่าย: {formatCurrency(Math.max(0, remainingAfterPayment))} คงเหลือ
                  {isFullPayment && (
                    <span className="ml-2 text-green-600 font-medium">🎉 ปิดหนี้!</span>
                  )}
                </p>
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
            {isFullPayment && (
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
