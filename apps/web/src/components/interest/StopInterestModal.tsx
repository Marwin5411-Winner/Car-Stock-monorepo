import { AlertCircle, PauseCircle, X } from 'lucide-react';
import { useState } from 'react';
import { isValidStopDate } from '../../pages/interest/interestActions';
import { DatePicker } from '../ui/date-picker';

interface StopInterestModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Resolves true when the stop succeeded, false when it was rejected (modal stays open). */
  onSubmit: (data: { stopDate?: string; notes?: string }) => Promise<boolean>;
  /** ISO date/datetime of the active period start (lower bound); null if none */
  activePeriodStart: string | null;
  stockInfo: {
    vin: string;
    vehicleModel: { brand: string; model: string; variant: string | null; year: number };
  };
}

const todayIso = (): string => new Date().toISOString().split('T')[0];

export default function StopInterestModal({
  isOpen,
  onClose,
  onSubmit,
  activePeriodStart,
  stockInfo,
}: StopInterestModalProps) {
  const [stopDate, setStopDate] = useState<string>(todayIso());
  const [notes, setNotes] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const today = todayIso();
  const minDate = activePeriodStart ? activePeriodStart.slice(0, 10) : undefined;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!stopDate) {
      setError('กรุณาเลือกวันที่หยุดคิดดอกเบี้ย');
      return;
    }
    if (!isValidStopDate(stopDate, activePeriodStart, today)) {
      setError('วันที่หยุดต้องไม่เกินวันนี้ และไม่ก่อนวันเริ่มคิดดอกเบี้ยของงวดปัจจุบัน');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const ok = await onSubmit({ stopDate, notes: notes || undefined });
      if (!ok) return; // stay open; the caller already surfaced the error
      setNotes('');
      onClose();
    } catch {
      setError('ไม่สามารถหยุดคิดดอกเบี้ยได้ กรุณาลองใหม่');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="fixed inset-0 bg-black/50" onClick={onClose} />

        <div className="relative bg-white rounded-lg shadow-xl w-full max-w-md">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-red-100 rounded-full">
                <PauseCircle className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900">หยุดคิดดอกเบี้ย</h3>
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

          {/* Form */}
          <form onSubmit={handleSubmit} className="p-4 space-y-4">
            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-700">
                <AlertCircle className="w-5 h-5 shrink-0" />
                <p className="text-sm">{error}</p>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                วันที่หยุดคิดดอกเบี้ย <span className="text-red-500">*</span>
              </label>
              <DatePicker
                value={stopDate}
                onChange={setStopDate}
                inputClassName="w-full"
                minDate={minDate}
                maxDate={today}
              />
              <p className="mt-1 text-xs text-gray-500">
                เลือกย้อนหลังได้ถึงวันที่เริ่มคิดดอกเบี้ยของงวดปัจจุบัน (ไม่เกินวันนี้)
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">หมายเหตุ</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="เหตุผลที่หยุดคิดดอกเบี้ย (ถ้ามี)"
                rows={2}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
              />
            </div>

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
                disabled={loading}
                className="flex-1 px-4 py-2.5 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
              >
                {loading ? 'กำลังบันทึก...' : 'ยืนยันหยุดคิดดอกเบี้ย'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
