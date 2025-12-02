import { useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { interestService } from '../../services/interest.service';
import type { InterestDetail } from '../../services/interest.service';
import { MainLayout } from '../../components/layout';
import {
  ArrowLeft,
  Save,
  Percent,
  Calendar,
  DollarSign,
  AlertCircle,
  Info,
} from 'lucide-react';

export default function InterestEditPage() {
  const { stockId } = useParams<{ stockId: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  
  const isResume = searchParams.get('resume') === 'true';
  const isInitialize = searchParams.get('initialize') === 'true';

  const [detail, setDetail] = useState<InterestDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [annualRate, setAnnualRate] = useState('');
  const [principalBase, setPrincipalBase] = useState<'BASE_COST_ONLY' | 'TOTAL_COST'>('BASE_COST_ONLY');
  const [effectiveDate, setEffectiveDate] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (stockId) {
      fetchDetail();
    }
  }, [stockId]);

  const fetchDetail = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await interestService.getById(stockId!);
      setDetail(data);

      // Pre-fill form
      if (data.summary.currentRate > 0) {
        setAnnualRate(data.summary.currentRate.toString());
      }
      setPrincipalBase(data.stock.interestPrincipalBase);
      
      // Set effective date to today
      const today = new Date().toISOString().split('T')[0];
      setEffectiveDate(today);
    } catch (err) {
      console.error('Error fetching interest detail:', err);
      setError('ไม่สามารถโหลดข้อมูลได้');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const rate = parseFloat(annualRate);
    if (isNaN(rate) || rate < 0 || rate > 100) {
      alert('กรุณากรอกอัตราดอกเบี้ยให้ถูกต้อง (0-100%)');
      return;
    }

    try {
      setSubmitting(true);

      if (isInitialize) {
        // Initialize new interest period
        await interestService.initialize(stockId!, {
          annualRate: rate,
          principalBase,
          startDate: effectiveDate || undefined,
          notes: notes || undefined,
        });
      } else if (isResume) {
        // Resume interest calculation
        await interestService.resumeCalculation(stockId!, {
          annualRate: rate,
          principalBase,
          notes: notes || undefined,
        });
      } else {
        // Update interest rate
        await interestService.updateRate(stockId!, {
          annualRate: rate,
          principalBase,
          effectiveDate: effectiveDate || undefined,
          notes: notes || undefined,
        });
      }

      navigate(`/interest/${stockId}`);
    } catch (err) {
      console.error('Error updating interest:', err);
      alert('ไม่สามารถบันทึกข้อมูลได้');
    } finally {
      setSubmitting(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('th-TH', {
      style: 'currency',
      currency: 'THB',
      minimumFractionDigits: 2,
    }).format(amount);
  };

  const getPageTitle = () => {
    if (isInitialize) return 'เริ่มคิดดอกเบี้ย';
    if (isResume) return 'เริ่มคิดดอกเบี้ยใหม่';
    return 'แก้ไขอัตราดอกเบี้ย';
  };

  const calculatePrincipalAmount = () => {
    if (!detail) return 0;
    if (principalBase === 'BASE_COST_ONLY') {
      return detail.stock.baseCost;
    }
    return detail.stock.totalCost;
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

  const { stock, summary } = detail;

  return (
    <MainLayout>
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="flex items-center mb-6">
          <button
            onClick={() => navigate(`/interest/${stockId}`)}
            className="mr-4 p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{getPageTitle()}</h1>
            <p className="text-gray-500">
              {stock.vehicleModel.brand} {stock.vehicleModel.model} {stock.vehicleModel.variant}
            </p>
          </div>
        </div>

        {/* Vehicle Info Card */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
          <div className="flex items-start">
            <Info className="w-5 h-5 text-blue-600 mt-0.5 mr-3" />
            <div>
              <h3 className="font-medium text-blue-900">ข้อมูลรถยนต์</h3>
              <div className="mt-2 text-sm text-blue-800 space-y-1">
                <p>VIN: <span className="font-mono">{stock.vin}</span></p>
                <p>
                  วันเริ่มคิดดอกเบี้ย: {new Date(stock.interestStartDate).toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' })}
                  {stock.orderDate && <span className="ml-1 text-blue-600">(สั่งซื้อ)</span>}
                </p>
                <p>ต้นทุนฐาน: {formatCurrency(stock.baseCost)}</p>
                <p>ต้นทุนรวม: {formatCurrency(stock.totalCost)}</p>
                {!isInitialize && !isResume && (
                  <p>ดอกเบี้ยสะสมปัจจุบัน: <span className="font-medium text-orange-600">{formatCurrency(summary.totalAccumulatedInterest)}</span></p>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow p-6">
          <div className="space-y-6">
            {/* Annual Rate */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <Percent className="w-4 h-4 inline mr-1" />
                อัตราดอกเบี้ยต่อปี (%) <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                max="100"
                value={annualRate}
                onChange={(e) => setAnnualRate(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="เช่น 7.50"
                required
              />
              <p className="mt-1 text-sm text-gray-500">
                กรอกอัตราดอกเบี้ยต่อปี เช่น 7.5 สำหรับ 7.5% ต่อปี
              </p>
            </div>

            {/* Principal Base */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <DollarSign className="w-4 h-4 inline mr-1" />
                ฐานเงินต้นในการคำนวณ
              </label>
              <div className="space-y-3">
                <label className="flex items-start p-4 border rounded-lg cursor-pointer hover:bg-gray-50 transition-colors">
                  <input
                    type="radio"
                    name="principalBase"
                    value="BASE_COST_ONLY"
                    checked={principalBase === 'BASE_COST_ONLY'}
                    onChange={(e) => setPrincipalBase(e.target.value as any)}
                    className="mt-1 mr-3"
                  />
                  <div>
                    <div className="font-medium text-gray-900">ทุนฐานเท่านั้น</div>
                    <div className="text-sm text-gray-500">
                      คำนวณจากราคาทุนฐาน: {formatCurrency(stock.baseCost)}
                    </div>
                  </div>
                </label>
                <label className="flex items-start p-4 border rounded-lg cursor-pointer hover:bg-gray-50 transition-colors">
                  <input
                    type="radio"
                    name="principalBase"
                    value="TOTAL_COST"
                    checked={principalBase === 'TOTAL_COST'}
                    onChange={(e) => setPrincipalBase(e.target.value as any)}
                    className="mt-1 mr-3"
                  />
                  <div>
                    <div className="font-medium text-gray-900">ต้นทุนรวม</div>
                    <div className="text-sm text-gray-500">
                      คำนวณจากต้นทุนรวม: {formatCurrency(stock.totalCost)}
                    </div>
                  </div>
                </label>
              </div>
            </div>

            {/* Effective Date (only for update, not resume) */}
            {!isResume && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  <Calendar className="w-4 h-4 inline mr-1" />
                  วันที่เริ่มใช้อัตราใหม่
                </label>
                <input
                  type="date"
                  value={effectiveDate}
                  onChange={(e) => setEffectiveDate(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
                <p className="mt-1 text-sm text-gray-500">
                  {isInitialize 
                    ? 'หากไม่ระบุ จะใช้วันที่เข้าสต็อกเป็นวันเริ่มต้น'
                    : 'หากไม่ระบุ จะใช้วันนี้เป็นวันเริ่มต้น'
                  }
                </p>
              </div>
            )}

            {/* Notes */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                หมายเหตุ
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="เช่น เปลี่ยนอัตราตามนโยบายใหม่..."
              />
            </div>

            {/* Preview */}
            {annualRate && (
              <div className="bg-gray-50 rounded-lg p-4">
                <h4 className="font-medium text-gray-900 mb-2">ตัวอย่างการคำนวณ</h4>
                <div className="text-sm text-gray-600 space-y-1">
                  <p>
                    เงินต้น: {formatCurrency(calculatePrincipalAmount())}
                  </p>
                  <p>
                    อัตราดอกเบี้ย: {parseFloat(annualRate).toFixed(2)}% ต่อปี
                  </p>
                  <p>
                    ดอกเบี้ยต่อวัน: ≈ {formatCurrency(calculatePrincipalAmount() * (parseFloat(annualRate) / 100) / 365)}
                  </p>
                  <p>
                    ดอกเบี้ยต่อเดือน (30 วัน): ≈ {formatCurrency(calculatePrincipalAmount() * (parseFloat(annualRate) / 100) / 365 * 30)}
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="mt-8 flex justify-end gap-4">
            <button
              type="button"
              onClick={() => navigate(`/interest/${stockId}`)}
              className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
            >
              ยกเลิก
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              <Save className="w-4 h-4 mr-2" />
              {submitting ? 'กำลังบันทึก...' : 'บันทึก'}
            </button>
          </div>
        </form>
      </div>
    </MainLayout>
  );
}
