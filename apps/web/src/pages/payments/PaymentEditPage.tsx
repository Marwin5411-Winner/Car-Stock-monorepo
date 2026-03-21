import { ArrowLeft, Save } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { MainLayout } from '../../components/layout';
import { useErrorHandler, useMutationHandler } from '../../hooks/useErrorHandler';
import { paymentService } from '../../services/payment.service';
import type { Payment, PaymentMethod, PaymentType } from '../../services/payment.service';

const PAYMENT_TYPE_OPTIONS: { value: PaymentType; label: string }[] = [
  { value: 'DEPOSIT', label: 'เงินจอง' },
  { value: 'DOWN_PAYMENT', label: 'เงินดาวน์' },
  { value: 'FINANCE_PAYMENT', label: 'ยอดไฟแนนซ์' },
  { value: 'OTHER_EXPENSE', label: 'ค่าใช้จ่ายอื่น' },
  { value: 'MISCELLANEOUS', label: 'รายการทั่วไป' },
];

const PAYMENT_METHOD_OPTIONS: { value: PaymentMethod; label: string }[] = [
  { value: 'CASH', label: 'เงินสด' },
  { value: 'BANK_TRANSFER', label: 'โอนเงิน' },
  { value: 'CHEQUE', label: 'เช็ค' },
  { value: 'CREDIT_CARD', label: 'บัตรเครดิต' },
];

interface FormData {
  description: string;
  paymentDate: string;
  paymentType: PaymentType;
  amount: number;
  paymentMethod: PaymentMethod;
  referenceNumber: string;
  notes: string;
}

export default function PaymentEditPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { execute: executeQuery } = useErrorHandler({ showToast: true });
  const { execute: executeSave } = useMutationHandler('บันทึกการแก้ไขสำเร็จ');

  const [payment, setPayment] = useState<Payment | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState<FormData>({
    description: '',
    paymentDate: '',
    paymentType: 'DEPOSIT',
    amount: 0,
    paymentMethod: 'CASH',
    referenceNumber: '',
    notes: '',
  });

  useEffect(() => {
    if (id) fetchPayment(id);
  }, [id]);

  const fetchPayment = async (paymentId: string) => {
    setLoading(true);
    const result = await executeQuery(paymentService.getById(paymentId));
    if (result) {
      setPayment(result);
      setFormData({
        description: result.description || '',
        paymentDate: result.paymentDate ? result.paymentDate.split('T')[0] : '',
        paymentType: result.paymentType,
        amount: result.amount,
        paymentMethod: result.paymentMethod,
        referenceNumber: result.referenceNumber || '',
        notes: result.notes || '',
      });
    } else {
      navigate('/payments');
    }
    setLoading(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id) return;

    setSaving(true);
    const result = await executeSave(
      paymentService.update(id, {
        ...formData,
        paymentDate: formData.paymentDate,
      })
    );
    if (result) {
      navigate(`/payments/${id}`);
    }
    setSaving(false);
  };

  const inputClass =
    'w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500';
  const labelClass = 'block text-sm font-medium text-gray-700 mb-1';

  if (loading) {
    return (
      <MainLayout>
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin h-8 w-8 border-4 border-blue-500 rounded-full border-t-transparent" />
        </div>
      </MainLayout>
    );
  }

  if (!payment) return null;

  return (
    <MainLayout>
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center gap-4 mb-6">
          <button
            onClick={() => navigate(`/payments/${id}`)}
            className="p-2 hover:bg-gray-100 rounded-lg"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">แก้ไขใบเสร็จ</h1>
            <p className="text-gray-500">{payment.receiptNumber}</p>
          </div>
        </div>

        <form
          onSubmit={handleSubmit}
          className="bg-white rounded-xl shadow-sm border p-6 space-y-5"
        >
          <div>
            <label className={labelClass}>รายการ</label>
            <input
              type="text"
              className={inputClass}
              value={formData.description}
              onChange={(e) => setFormData((prev) => ({ ...prev, description: e.target.value }))}
              placeholder="รายละเอียดการชำระเงิน"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>วันที่ชำระ</label>
              <input
                type="date"
                className={inputClass}
                value={formData.paymentDate}
                onChange={(e) => setFormData((prev) => ({ ...prev, paymentDate: e.target.value }))}
              />
            </div>
            <div>
              <label className={labelClass}>จำนวนเงิน (บาท)</label>
              <input
                type="number"
                className={inputClass}
                value={formData.amount || ''}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    amount: Number.parseFloat(e.target.value) || 0,
                  }))
                }
                min="0"
                step="0.01"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>ประเภท</label>
              <select
                className={inputClass}
                value={formData.paymentType}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, paymentType: e.target.value as PaymentType }))
                }
              >
                {PAYMENT_TYPE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass}>วิธีชำระ</label>
              <select
                className={inputClass}
                value={formData.paymentMethod}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    paymentMethod: e.target.value as PaymentMethod,
                  }))
                }
              >
                {PAYMENT_METHOD_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className={labelClass}>เลขที่อ้างอิง</label>
            <input
              type="text"
              className={inputClass}
              value={formData.referenceNumber}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, referenceNumber: e.target.value }))
              }
              placeholder="เลขที่เช็ค, เลขอ้างอิงโอนเงิน"
            />
          </div>

          <div>
            <label className={labelClass}>หมายเหตุ</label>
            <textarea
              className={inputClass}
              rows={3}
              value={formData.notes}
              onChange={(e) => setFormData((prev) => ({ ...prev, notes: e.target.value }))}
            />
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t">
            <button
              type="button"
              onClick={() => navigate(`/payments/${id}`)}
              className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              ยกเลิก
            </button>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              <Save className="h-4 w-4 mr-2" />
              {saving ? 'กำลังบันทึก...' : 'บันทึก'}
            </button>
          </div>
        </form>
      </div>
    </MainLayout>
  );
}
