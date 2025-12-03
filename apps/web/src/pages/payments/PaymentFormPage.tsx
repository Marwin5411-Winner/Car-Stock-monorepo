import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { paymentService, type CreatePaymentData, type PaymentType, type PaymentMethod } from '../../services/payment.service';
import { salesService } from '../../services/sales.service';
import { customerService, type Customer } from '../../services/customer.service';
import { MainLayout } from '../../components/layout';
import { 
  ArrowLeft, 
  CreditCard,
  DollarSign,
  Save,
  FileText,
  Calendar,
  User,
  Receipt
} from 'lucide-react';
import { AsyncSearchSelect, type SearchSelectOption } from '../../components/ui/search-select';

// Payment types for sale-related payments
const SALE_PAYMENT_TYPE_OPTIONS: { value: PaymentType; label: string }[] = [
  { value: 'DEPOSIT', label: 'เงินจอง' },
  { value: 'DOWN_PAYMENT', label: 'เงินดาวน์' },
  { value: 'FINANCE_PAYMENT', label: 'ยอดไฟแนนซ์' },
  { value: 'OTHER_EXPENSE', label: 'ค่าใช้จ่ายอื่น' },
];

// Payment types for miscellaneous payments
const MISC_PAYMENT_TYPE_OPTIONS: { value: PaymentType; label: string }[] = [
  { value: 'MISCELLANEOUS', label: 'รายการทั่วไป' },
  { value: 'OTHER_EXPENSE', label: 'ค่าใช้จ่ายอื่น' },
];

const PAYMENT_METHOD_OPTIONS: { value: PaymentMethod; label: string }[] = [
  { value: 'CASH', label: 'เงินสด' },
  { value: 'BANK_TRANSFER', label: 'โอนเงิน' },
  { value: 'CHEQUE', label: 'เช็ค' },
  { value: 'CREDIT_CARD', label: 'บัตรเครดิต' },
];

interface SaleInfo {
  id: string;
  saleNumber: string;
  totalAmount: number;
  paidAmount: number;
  remainingAmount: number;
  status: string;
  customer: {
    id: string;
    code: string;
    name: string;
  };
  stock?: {
    vin: string;
    vehicleModel: {
      brand: string;
      model: string;
      variant?: string;
    };
  };
}

interface CustomerInfo {
  id: string;
  code: string;
  name: string;
}

interface FormData {
  saleId: string;
  customerId: string;
  amount: number;
  paymentDate: string;
  paymentType: PaymentType;
  paymentMethod: PaymentMethod;
  referenceNumber: string;
  description: string;
}

type PaymentMode = 'sale' | 'miscellaneous';

export default function PaymentFormPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const preSelectedSaleId = searchParams.get('saleId');
  
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  
  // Payment mode: linked to sale or standalone miscellaneous
  const [paymentMode, setPaymentMode] = useState<PaymentMode>(preSelectedSaleId ? 'sale' : 'sale');
  
  // Sale-related state
  const [saleInfo, setSaleInfo] = useState<SaleInfo | null>(null);
  
  // Customer-related state (for miscellaneous payments)
  const [customerInfo, setCustomerInfo] = useState<CustomerInfo | null>(null);
  
  const [formData, setFormData] = useState<FormData>({
    saleId: '',
    customerId: '',
    amount: 0,
    paymentDate: new Date().toISOString().split('T')[0],
    paymentType: 'DEPOSIT',
    paymentMethod: 'CASH',
    referenceNumber: '',
    description: '',
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (preSelectedSaleId) {
      setPaymentMode('sale');
      fetchSaleById(preSelectedSaleId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preSelectedSaleId]);

  // Reset form when switching payment mode
  useEffect(() => {
    if (paymentMode === 'miscellaneous') {
      setSaleInfo(null);
      setFormData(prev => ({
        ...prev,
        saleId: '',
        customerId: customerInfo?.id || '',
        paymentType: 'MISCELLANEOUS',
        amount: 0,
      }));
    } else {
      setCustomerInfo(null);
      setFormData(prev => ({
        ...prev,
        saleId: saleInfo?.id || '',
        customerId: saleInfo?.customer?.id || '',
        paymentType: 'DEPOSIT',
        amount: saleInfo?.remainingAmount || 0,
      }));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paymentMode]);

  const fetchSaleById = async (saleId: string) => {
    try {
      setLoading(true);
      const sale = await salesService.getById(saleId);
      const info: SaleInfo = {
        id: sale.id,
        saleNumber: sale.saleNumber,
        totalAmount: sale.totalAmount,
        paidAmount: sale.paidAmount,
        remainingAmount: sale.remainingAmount,
        status: sale.status,
        customer: sale.customer,
        stock: sale.stock,
      };
      setSaleInfo(info);
      setFormData(prev => ({
        ...prev,
        saleId: sale.id,
        customerId: sale.customer.id,
        amount: sale.remainingAmount > 0 ? sale.remainingAmount : 0,
      }));
    } catch (error) {
      console.error('Error fetching sale:', error);
      alert('ไม่สามารถโหลดข้อมูลการขายได้');
      navigate('/payments');
    } finally {
      setLoading(false);
    }
  };

  // Async sale search for SearchSelect
  const loadSaleOptions = useCallback(async (query: string): Promise<SearchSelectOption<SaleInfo>[]> => {
    try {
      const response = await salesService.getAll({ search: query, limit: 10 });
      return response.data.map(sale => ({
        value: sale.id,
        label: sale.saleNumber,
        description: `${sale.customer.name} - ค้างชำระ ${formatCurrency(sale.remainingAmount)}`,
        data: {
          id: sale.id,
          saleNumber: sale.saleNumber,
          totalAmount: sale.totalAmount,
          paidAmount: sale.paidAmount,
          remainingAmount: sale.remainingAmount,
          status: sale.status,
          customer: sale.customer,
          stock: sale.stock,
        },
      }));
    } catch (error) {
      console.error('Error searching sales:', error);
      return [];
    }
  }, []);

  // Async customer search for SearchSelect
  const loadCustomerOptions = useCallback(async (query: string): Promise<SearchSelectOption<CustomerInfo>[]> => {
    try {
      const response = await customerService.getAll({ search: query, limit: 10 });
      return response.data.map((customer: Customer) => ({
        value: customer.id,
        label: customer.name,
        description: customer.code,
        data: {
          id: customer.id,
          code: customer.code,
          name: customer.name,
        },
      }));
    } catch (error) {
      console.error('Error searching customers:', error);
      return [];
    }
  }, []);

  const handleSaleSelect = (_value: string, option?: SearchSelectOption<SaleInfo>) => {
    if (option?.data) {
      const sale = option.data;
      setSaleInfo(sale);
      setFormData(prev => ({
        ...prev,
        saleId: sale.id,
        customerId: sale.customer.id,
        amount: sale.remainingAmount > 0 ? sale.remainingAmount : 0,
      }));
    } else {
      setSaleInfo(null);
      setFormData(prev => ({
        ...prev,
        saleId: '',
        customerId: '',
        amount: 0,
      }));
    }
  };

  const handleCustomerSelect = (value: string, option?: SearchSelectOption<CustomerInfo>) => {
    if (option?.data) {
      setCustomerInfo(option.data);
      setFormData(prev => ({
        ...prev,
        customerId: value,
      }));
    } else {
      setCustomerInfo(null);
      setFormData(prev => ({
        ...prev,
        customerId: '',
      }));
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('th-TH', {
      style: 'currency',
      currency: 'THB',
    }).format(amount);
  };

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (paymentMode === 'sale' && !formData.saleId) {
      newErrors.saleId = 'กรุณาเลือกการขาย';
    }

    if (paymentMode === 'miscellaneous' && !formData.customerId) {
      newErrors.customerId = 'กรุณาเลือกลูกค้า';
    }

    if (paymentMode === 'miscellaneous' && !formData.description?.trim()) {
      newErrors.description = 'กรุณาระบุรายละเอียดสำหรับรายการทั่วไป';
    }

    if (formData.amount <= 0) {
      newErrors.amount = 'กรุณาระบุจำนวนเงิน';
    }

    if (!formData.paymentDate) {
      newErrors.paymentDate = 'กรุณาระบุวันที่ชำระ';
    }

    if (formData.paymentMethod === 'BANK_TRANSFER' && !formData.referenceNumber) {
      newErrors.referenceNumber = 'กรุณาระบุเลขที่อ้างอิงสำหรับการโอนเงิน';
    }

    if (formData.paymentMethod === 'CHEQUE' && !formData.referenceNumber) {
      newErrors.referenceNumber = 'กรุณาระบุเลขที่เช็ค';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    try {
      setSaving(true);
      const createData: CreatePaymentData = {
        customerId: formData.customerId,
        amount: formData.amount,
        paymentDate: formData.paymentDate,
        paymentType: formData.paymentType,
        paymentMethod: formData.paymentMethod,
        referenceNumber: formData.referenceNumber || undefined,
        description: formData.description || undefined,
      };

      // Only include saleId for sale-linked payments
      if (paymentMode === 'sale' && formData.saleId) {
        createData.saleId = formData.saleId;
      }

      const payment = await paymentService.create(createData);
      alert('บันทึกการชำระเงินสำเร็จ');
      
      // Navigate to payment detail or back to sale
      if (preSelectedSaleId) {
        navigate(`/sales/${preSelectedSaleId}`);
      } else {
        navigate(`/payments/${payment.id}`);
      }
    } catch (error) {
      console.error('Error creating payment:', error);
      alert('ไม่สามารถบันทึกการชำระเงินได้');
    } finally {
      setSaving(false);
    }
  };

  const handleInputChange = (field: keyof FormData, value: string | number) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }));
    }
  };

  const currentPaymentTypeOptions = paymentMode === 'sale' ? SALE_PAYMENT_TYPE_OPTIONS : MISC_PAYMENT_TYPE_OPTIONS;

  if (loading) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center h-64">
          <div className="text-lg text-gray-600">กำลังโหลด...</div>
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
            onClick={() => navigate(-1)}
            className="flex items-center text-gray-600 hover:text-gray-900 mb-4"
          >
            <ArrowLeft className="h-5 w-5 mr-1" />
            กลับ
          </button>
          <h1 className="text-2xl font-bold text-gray-900">
            บันทึกการชำระเงิน
          </h1>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Payment Mode Toggle */}
          {!preSelectedSaleId && (
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-semibold mb-4 flex items-center">
                <Receipt className="h-5 w-5 mr-2 text-blue-600" />
                ประเภทการบันทึก
              </h2>
              <div className="flex gap-4">
                <button
                  type="button"
                  onClick={() => setPaymentMode('sale')}
                  className={`flex-1 py-3 px-4 rounded-lg border-2 transition-colors ${
                    paymentMode === 'sale'
                      ? 'border-blue-500 bg-blue-50 text-blue-700'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <FileText className="h-6 w-6 mx-auto mb-2" />
                  <div className="font-medium">เชื่อมกับการขาย</div>
                  <div className="text-sm text-gray-500">บันทึกการชำระที่เกี่ยวข้องกับรายการขาย</div>
                </button>
                <button
                  type="button"
                  onClick={() => setPaymentMode('miscellaneous')}
                  className={`flex-1 py-3 px-4 rounded-lg border-2 transition-colors ${
                    paymentMode === 'miscellaneous'
                      ? 'border-blue-500 bg-blue-50 text-blue-700'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <DollarSign className="h-6 w-6 mx-auto mb-2" />
                  <div className="font-medium">รายการทั่วไป</div>
                  <div className="text-sm text-gray-500">บันทึกรายรับทั่วไปที่ไม่เกี่ยวกับการขาย</div>
                </button>
              </div>
            </div>
          )}

          {/* Sale Selection (for sale mode) */}
          {paymentMode === 'sale' && (
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-semibold mb-4 flex items-center">
                <FileText className="h-5 w-5 mr-2 text-blue-600" />
                ข้อมูลการขาย
              </h2>

              {!preSelectedSaleId && (
                <div className="mb-4">
                  <AsyncSearchSelect<SaleInfo>
                    value={formData.saleId}
                    onChange={handleSaleSelect}
                    loadOptions={loadSaleOptions}
                    label="ค้นหาการขาย"
                    required
                    placeholder="พิมพ์เลขที่ขาย หรือชื่อลูกค้า..."
                    error={errors.saleId}
                    emptyMessage="ไม่พบการขาย"
                    minSearchLength={2}
                  />
                </div>
              )}

              {/* Sale Info Display */}
              {saleInfo && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-gray-50 rounded-lg">
                  <div>
                    <p className="text-sm text-gray-500">เลขที่ขาย</p>
                    <p className="font-medium">{saleInfo.saleNumber}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">ลูกค้า</p>
                    <p className="font-medium">{saleInfo.customer.name}</p>
                    <p className="text-sm text-gray-500">{saleInfo.customer.code}</p>
                  </div>
                  {saleInfo.stock && (
                    <div className="md:col-span-2">
                      <p className="text-sm text-gray-500">รถยนต์</p>
                      <p className="font-medium">
                        {saleInfo.stock.vehicleModel.brand} {saleInfo.stock.vehicleModel.model}
                        {saleInfo.stock.vehicleModel.variant && ` ${saleInfo.stock.vehicleModel.variant}`}
                      </p>
                      <p className="text-sm text-gray-500">VIN: {saleInfo.stock.vin}</p>
                    </div>
                  )}
                  <div>
                    <p className="text-sm text-gray-500">ยอดรวม</p>
                    <p className="font-semibold text-gray-900">{formatCurrency(saleInfo.totalAmount)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">ชำระแล้ว</p>
                    <p className="font-semibold text-green-600">{formatCurrency(saleInfo.paidAmount)}</p>
                  </div>
                  <div className="md:col-span-2">
                    <p className="text-sm text-gray-500">ค้างชำระ</p>
                    <p className="text-xl font-bold text-red-600">{formatCurrency(saleInfo.remainingAmount)}</p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Customer Selection (for miscellaneous mode) */}
          {paymentMode === 'miscellaneous' && (
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-semibold mb-4 flex items-center">
                <User className="h-5 w-5 mr-2 text-blue-600" />
                ข้อมูลลูกค้า
              </h2>

              <div className="mb-4">
                <AsyncSearchSelect<CustomerInfo>
                  value={formData.customerId}
                  onChange={handleCustomerSelect}
                  loadOptions={loadCustomerOptions}
                  label="ค้นหาลูกค้า"
                  required
                  placeholder="พิมพ์ชื่อลูกค้า หรือรหัสลูกค้า..."
                  error={errors.customerId}
                  emptyMessage="ไม่พบลูกค้า"
                  minSearchLength={2}
                />
              </div>

              {/* Customer Info Display */}
              {customerInfo && (
                <div className="p-4 bg-gray-50 rounded-lg">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-gray-500">รหัสลูกค้า</p>
                      <p className="font-medium">{customerInfo.code}</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-500">ชื่อลูกค้า</p>
                      <p className="font-medium">{customerInfo.name}</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Description for miscellaneous payments */}
              <div className="mt-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  รายละเอียด <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={formData.description}
                  onChange={(e) => handleInputChange('description', e.target.value)}
                  rows={3}
                  placeholder="ระบุรายละเอียดของรายการ เช่น ค่าบริการ, ค่าอุปกรณ์เสริม..."
                  className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 ${
                    errors.description ? 'border-red-500' : 'border-gray-300'
                  }`}
                />
                {errors.description && (
                  <p className="text-sm text-red-500 mt-1">{errors.description}</p>
                )}
              </div>
            </div>
          )}

          {/* Payment Details */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold mb-4 flex items-center">
              <CreditCard className="h-5 w-5 mr-2 text-blue-600" />
              รายละเอียดการชำระเงิน
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Amount */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  จำนวนเงิน (บาท) <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <DollarSign className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-5 w-5" />
                  <input
                    type="number"
                    value={formData.amount || ''}
                    onChange={(e) => handleInputChange('amount', parseFloat(e.target.value) || 0)}
                    className={`w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 ${
                      errors.amount ? 'border-red-500' : 'border-gray-300'
                    }`}
                    min="0"
                    step="0.01"
                  />
                </div>
                {errors.amount && (
                  <p className="text-sm text-red-500 mt-1">{errors.amount}</p>
                )}
              </div>

              {/* Payment Date */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  วันที่ชำระ <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-5 w-5" />
                  <input
                    type="date"
                    value={formData.paymentDate}
                    onChange={(e) => handleInputChange('paymentDate', e.target.value)}
                    className={`w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 ${
                      errors.paymentDate ? 'border-red-500' : 'border-gray-300'
                    }`}
                  />
                </div>
                {errors.paymentDate && (
                  <p className="text-sm text-red-500 mt-1">{errors.paymentDate}</p>
                )}
              </div>

              {/* Payment Type */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  ประเภทการชำระ <span className="text-red-500">*</span>
                </label>
                <select
                  value={formData.paymentType}
                  onChange={(e) => handleInputChange('paymentType', e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  {currentPaymentTypeOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Payment Method */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  วิธีการชำระ <span className="text-red-500">*</span>
                </label>
                <select
                  value={formData.paymentMethod}
                  onChange={(e) => handleInputChange('paymentMethod', e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  {PAYMENT_METHOD_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Reference Number */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  เลขที่อ้างอิง
                  {(formData.paymentMethod === 'BANK_TRANSFER' || formData.paymentMethod === 'CHEQUE') && (
                    <span className="text-red-500"> *</span>
                  )}
                </label>
                <input
                  type="text"
                  value={formData.referenceNumber}
                  onChange={(e) => handleInputChange('referenceNumber', e.target.value)}
                  placeholder={
                    formData.paymentMethod === 'BANK_TRANSFER' ? 'เลขที่รายการโอน' :
                    formData.paymentMethod === 'CHEQUE' ? 'เลขที่เช็ค' :
                    'เลขที่อ้างอิง (ถ้ามี)'
                  }
                  className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 ${
                    errors.referenceNumber ? 'border-red-500' : 'border-gray-300'
                  }`}
                />
                {errors.referenceNumber && (
                  <p className="text-sm text-red-500 mt-1">{errors.referenceNumber}</p>
                )}
              </div>

              {/* Notes (for sale mode, description is already captured for misc mode) */}
              {paymentMode === 'sale' && (
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    หมายเหตุ
                  </label>
                  <textarea
                    value={formData.description}
                    onChange={(e) => handleInputChange('description', e.target.value)}
                    rows={3}
                    placeholder="หมายเหตุเพิ่มเติม (ถ้ามี)"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-4">
            <button
              type="button"
              onClick={() => navigate(-1)}
              className="px-6 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              ยกเลิก
            </button>
            <button
              type="submit"
              disabled={saving || (paymentMode === 'sale' && !formData.saleId) || (paymentMode === 'miscellaneous' && !formData.customerId)}
              className="inline-flex items-center px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Save className="h-5 w-5 mr-2" />
              {saving ? 'กำลังบันทึก...' : 'บันทึกการชำระเงิน'}
            </button>
          </div>
        </form>
      </div>
    </MainLayout>
  );
}
