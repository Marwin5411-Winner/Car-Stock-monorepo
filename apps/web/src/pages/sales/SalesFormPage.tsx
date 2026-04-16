import { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { salesService, type CreateSaleData, type UpdateSaleData, type PaymentMode } from '../../services/sales.service';
import { usePermission } from '../../hooks/usePermission';
import { useMutationHandler, useErrorHandler } from '../../hooks/useErrorHandler';
import { useToast } from '../../components/toast';
import { customerService, type Customer } from '../../services/customer.service';
import { stockService, type Stock } from '../../services/stock.service';
import { MainLayout } from '../../components/layout';
import {
  ArrowLeft,
  User,
  Car,
  DollarSign,
  Save
} from 'lucide-react';
import { AsyncSearchSelect, SearchSelect, type SearchSelectOption } from '../../components/ui/search-select';
import { PriceSourceModal, type PriceSource } from '../../components/PriceSourceModal';

// Note: This form is now for Direct Sales only
// Reservation Sales should be created via Quotation conversion

const PAYMENT_MODE_OPTIONS: { value: PaymentMode; label: string }[] = [
  { value: 'CASH', label: 'เงินสด' },
  { value: 'FINANCE', label: 'ไฟแนนซ์' },
  { value: 'MIXED', label: 'ผสม' },
];

// Updated form data for Direct Sale only
interface FormData {
  customerId: string;
  stockId: string;
  totalAmount: number;
  depositAmount: number;
  paymentMode: PaymentMode;
  downPayment: number;
  financeAmount: number;
  financeProvider: string;
  carDiscount: number;
  downPaymentDiscount: number;
  interestRate: number;
  numberOfTerms: number;
  monthlyInstallment: number;
  notes: string;
}

export default function SalesFormPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isEditing = Boolean(id);
  const { hasPermission, user } = usePermission();
  const canDiscount = hasPermission('SALE_DISCOUNT');
  const [saleStatus, setSaleStatus] = useState<string | null>(null);
  const isCompletedAsAccountant = isEditing && saleStatus === 'COMPLETED' && user?.role === 'ACCOUNTANT';

  const { addToast } = useToast();
  const { execute: executeMutation, clearFieldErrors } = useMutationHandler(
    isEditing ? 'แก้ไขข้อมูลการขายสำเร็จ' : 'สร้างการขายสำเร็จ',
    { onSuccess: () => navigate('/sales') }
  );
  const { execute: executeQuery } = useErrorHandler({ showToast: true });

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [availableStocks, setAvailableStocks] = useState<Stock[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [selectedStock, setSelectedStock] = useState<Stock | null>(null);
  const [priceModalOpen, setPriceModalOpen] = useState(false);
  const [pendingStock, setPendingStock] = useState<Stock | null>(null);
  
  // Simplified form data for Direct Sale
  const [formData, setFormData] = useState<FormData>({
    customerId: '',
    stockId: '',
    totalAmount: 0,
    depositAmount: 0,
    paymentMode: 'CASH',
    downPayment: 0,
    financeAmount: 0,
    financeProvider: '',
    carDiscount: 0,
    downPaymentDiscount: 0,
    interestRate: 0,
    numberOfTerms: 0,
    monthlyInstallment: 0,
    notes: '',
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    fetchInitialData();
  }, []);

  useEffect(() => {
    if (id) {
      fetchSale(id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const fetchInitialData = async () => {
    setLoading(true);
    await executeQuery(
      stockService.getAvailable().then((stocksRes) => {
        setAvailableStocks(stocksRes);
      })
    );
    setLoading(false);
  };

  const fetchSale = async (saleId: string) => {
    setLoading(true);
    let found = false;
    await executeQuery(
      salesService.getById(saleId).then((sale) => {
        // For editing, we only allow editing Direct Sales
        if (sale.type !== 'DIRECT_SALE') {
          addToast('ไม่สามารถแก้ไขการขายผ่านการจองได้ที่นี่ กรุณาแก้ไขผ่านหน้ารายละเอียดการขาย', 'error');
          return;
        }

        found = true;
        setSaleStatus(sale.status);
        setFormData({
          customerId: sale.customer.id,
          stockId: sale.stock?.id || '',
          totalAmount: Number(sale.totalAmount) || 0,
          depositAmount: Number(sale.depositAmount) || 0,
          paymentMode: sale.paymentMode,
          downPayment: Number(sale.downPayment) || 0,
          financeAmount: Number(sale.financeAmount) || 0,
          financeProvider: sale.financeProvider || '',
          carDiscount: Number(sale.carDiscount) || 0,
          downPaymentDiscount: Number(sale.downPaymentDiscount) || 0,
          interestRate: Number(sale.interestRate) || 0,
          numberOfTerms: Number(sale.numberOfTerms) || 0,
          monthlyInstallment: Number(sale.monthlyInstallment) || 0,
          notes: sale.notes || '',
        });

        setSelectedCustomer(sale.customer as Customer);
        if (sale.stock) {
          setSelectedStock(sale.stock as unknown as Stock);
        }
      })
    );
    if (!found) navigate('/sales');
    setLoading(false);
  };

  // Async customer search for SearchSelect
  const loadCustomerOptions = useCallback(async (query: string): Promise<SearchSelectOption<Customer>[]> => {
    const response = await customerService.getAll({ search: query, limit: 10 });
    return response.data.map((customer: Customer) => ({
      value: customer.id,
      label: customer.name,
      description: `${customer.code} • ${customer.phone}`,
      data: customer,
    }));
  }, []);

  const handleCustomerSelect = (value: string, option?: SearchSelectOption<Customer>) => {
    if (option?.data) {
      setSelectedCustomer(option.data);
      setFormData(prev => ({ ...prev, customerId: value }));
    } else {
      setSelectedCustomer(null);
      setFormData(prev => ({ ...prev, customerId: '' }));
    }
  };

  // Convert stocks to SearchSelect options
  const stockOptions: SearchSelectOption<Stock>[] = useMemo(() => {
    return availableStocks.map((stock) => ({
      value: stock.id,
      label: `${stock.vehicleModel.brand} ${stock.vehicleModel.model} - VIN: ${stock.vin.slice(-8)} (${stock.exteriorColor})`,
      description: stock.expectedSalePrice ? `ราคา: ฿${stock.expectedSalePrice.toLocaleString()}` : undefined,
      data: stock,
    }));
  }, [availableStocks]);

  const handleStockSelect = (value: string, option?: SearchSelectOption<Stock>) => {
    const stock = option?.data || null;
    setSelectedStock(stock);

    if (stock) {
      setFormData((prev) => ({
        ...prev,
        stockId: value,
      }));

      // Open price source modal if both VehicleModel price and Stock expectedSalePrice exist
      if (stock.vehicleModel?.price != null) {
        setPendingStock(stock);
        setPriceModalOpen(true);
      } else {
        // Fallback: auto-fill from stock expectedSalePrice
        setFormData((prev) => ({
          ...prev,
          stockId: value,
          totalAmount: stock.expectedSalePrice || prev.totalAmount,
        }));
      }
    } else {
      setFormData((prev) => ({
        ...prev,
        stockId: '',
      }));
    }
  };

  const handlePriceSourceSelect = (source: PriceSource) => {
    if (!pendingStock) return;

    if (source === 'model') {
      setFormData((prev) => ({
        ...prev,
        totalAmount: Number(pendingStock.vehicleModel.price) || prev.totalAmount,
      }));
    } else {
      setFormData((prev) => ({
        ...prev,
        totalAmount: pendingStock.expectedSalePrice || prev.totalAmount,
      }));
    }
    setPendingStock(null);
  };

  // Removed handleVehicleModelSelect - not needed for Direct Sale

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.customerId) {
      newErrors.customerId = 'กรุณาเลือกลูกค้า';
    }

    // Stock is required for Direct Sale
    if (!formData.stockId) {
      newErrors.stockId = 'กรุณาเลือก Stock สำหรับการขายตรง';
    }

    if (formData.totalAmount <= 0) {
      newErrors.totalAmount = 'กรุณาระบุยอดรวม';
    }

    if (formData.depositAmount > formData.totalAmount) {
      newErrors.depositAmount = 'เงินมัดจำต้องไม่เกินยอดรวม';
    }

    if (formData.paymentMode === 'FINANCE' && !formData.financeProvider) {
      newErrors.financeProvider = 'กรุณาระบุบริษัทไฟแนนซ์';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    setSaving(true);
    clearFieldErrors();

    // Direct Sale data - always DIRECT_SALE type
    const data: CreateSaleData | UpdateSaleData = {
      ...(isCompletedAsAccountant ? {} : {
        type: 'DIRECT_SALE' as const,
        customerId: formData.customerId,
        stockId: formData.stockId,
      }),
      totalAmount: formData.totalAmount,
      depositAmount: formData.depositAmount || undefined,
      paymentMode: formData.paymentMode,
      downPayment: formData.downPayment || undefined,
      financeAmount: formData.financeAmount || undefined,
      financeProvider: formData.financeProvider || undefined,
      carDiscount: formData.carDiscount || undefined,
      downPaymentDiscount: formData.downPaymentDiscount || undefined,
      interestRate: formData.interestRate || undefined,
      numberOfTerms: formData.numberOfTerms || undefined,
      monthlyInstallment: formData.monthlyInstallment || undefined,
      notes: formData.notes || undefined,
    };

    await executeMutation(
      isEditing && id ? salesService.update(id, data) : salesService.create(data as CreateSaleData)
    );
    setSaving(false);
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

  return (
    <MainLayout>
      <div className="mb-6">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <button
            onClick={() => navigate('/sales')}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ArrowLeft className="h-5 w-5 text-gray-700" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              {isEditing ? 'แก้ไขการขาย' : 'สร้างการขายตรง'}
            </h1>
            <p className="text-sm text-gray-700 mt-1">
              สำหรับการขายผ่านการจอง กรุณาสร้างใบเสนอราคาก่อน แล้วแปลงเป็นการขาย
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Sale Type Info */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex items-center gap-2">
              <Car className="h-5 w-5 text-blue-600" />
              <span className="font-medium text-blue-800">ขายตรง (Direct Sale)</span>
            </div>
            <p className="text-sm text-blue-600 mt-1">
              เลือกรถจาก Stock ที่มีอยู่ → รับเงิน → ส่งมอบรถ
            </p>
          </div>

          {/* Customer Selection */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold mb-4 flex items-center text-black">
              <User className="h-5 w-5 mr-2 text-blue-600" />
              ข้อมูลลูกค้า
            </h2>
            
            <AsyncSearchSelect<Customer>
              value={formData.customerId}
              onChange={handleCustomerSelect}
              loadOptions={loadCustomerOptions}
              label="ค้นหาลูกค้า"
              required
              placeholder="พิมพ์ชื่อ, รหัส หรือเบอร์โทรลูกค้า..."
              error={errors.customerId}
              emptyMessage="ไม่พบลูกค้า"
              minSearchLength={2}
              disabled={isCompletedAsAccountant}
            />

            {/* Selected Customer Info */}
            {selectedCustomer && (
              <div className="mt-4 p-4 bg-gray-50 rounded-lg">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="font-medium">{selectedCustomer.name}</p>
                    <p className="text-sm text-gray-700">{selectedCustomer.code}</p>
                    <p className="text-sm text-gray-700">{selectedCustomer.phone}</p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Vehicle Selection */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold mb-4 flex items-center text-black">
              <Car className="h-5 w-5 mr-2 text-blue-600" />
              ข้อมูลรถยนต์
            </h2>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Stock Selection - Required for Direct Sale */}
              <div className="md:col-span-2">
                <SearchSelect<Stock>
                  value={formData.stockId}
                  onChange={handleStockSelect}
                  options={stockOptions}
                  label="เลือก Stock (รถที่มีในสต็อก)"
                  required
                  placeholder="-- เลือก Stock --"
                  error={errors.stockId}
                  emptyMessage="ไม่มี Stock ที่พร้อมขาย"
                  disabled={isCompletedAsAccountant}
                />
                {availableStocks.length === 0 && (
                  <p className="text-yellow-600 text-sm mt-1">ไม่มี Stock ที่พร้อมขาย กรุณาเพิ่ม Stock ก่อน</p>
                )}
              </div>
            </div>

            {/* Selected Stock Info */}
            {selectedStock && (
              <div className="mt-4 p-4 bg-blue-50 rounded-lg">
                <p className="font-medium text-blue-800">
                  {selectedStock.vehicleModel.brand} {selectedStock.vehicleModel.model}
                  {selectedStock.vehicleModel.variant && ` ${selectedStock.vehicleModel.variant}`}
                </p>
                <p className="text-sm text-blue-600">VIN: {selectedStock.vin}</p>
                <p className="text-sm text-blue-600">
                  สี: {selectedStock.exteriorColor}
                  {selectedStock.interiorColor && ` / ${selectedStock.interiorColor}`}
                </p>
              </div>
            )}
          </div>

          {/* Financial Info */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold mb-4 flex items-center text-black">
              <DollarSign className="h-5 w-5 mr-2 text-blue-600" />
              ข้อมูลการเงิน
            </h2>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-black mb-1">
                  ยอดรวม (บาท) <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  value={formData.totalAmount}
                  onChange={(e) => setFormData(prev => ({ ...prev, totalAmount: parseFloat(e.target.value) || 0 }))}
                  min="0"
                  step="0.01"
                  className={`w-full px-4 py-2 bg-white border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900 ${
                    errors.totalAmount ? 'border-red-500' : 'border-gray-300'
                  }`}
                />
                {errors.totalAmount && (
                  <p className="text-red-500 text-sm mt-1">{errors.totalAmount}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-black mb-1">
                  เงินมัดจำ (บาท)
                </label>
                <input
                  type="number"
                  value={formData.depositAmount}
                  onChange={(e) => setFormData(prev => ({ ...prev, depositAmount: parseFloat(e.target.value) || 0 }))}
                  min="0"
                  step="0.01"
                  className={`w-full px-4 py-2 bg-white border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900 ${
                    errors.depositAmount ? 'border-red-500' : 'border-gray-300'
                  }`}
                />
                {errors.depositAmount && (
                  <p className="text-red-500 text-sm mt-1">{errors.depositAmount}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-black mb-1">
                  รูปแบบการชำระ
                </label>
                <select
                  value={formData.paymentMode}
                  onChange={(e) => setFormData(prev => ({ ...prev, paymentMode: e.target.value as PaymentMode }))}
                  className="w-full px-4 py-2 bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900"
                >
                  {PAYMENT_MODE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Finance Details */}
            {formData.paymentMode !== 'CASH' && (
              <div className="space-y-4 mt-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-black mb-1">
                      เงินดาวน์ (บาท)
                    </label>
                    <input
                      type="number"
                      value={formData.downPayment}
                      onChange={(e) => setFormData(prev => ({ ...prev, downPayment: parseFloat(e.target.value) || 0 }))}
                      min="0"
                      step="0.01"
                      className="w-full px-4 py-2 bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-black mb-1">
                      ยอดจัดไฟแนนซ์ (บาท)
                    </label>
                    <input
                      type="number"
                      value={formData.financeAmount}
                      onChange={(e) => setFormData(prev => ({ ...prev, financeAmount: parseFloat(e.target.value) || 0 }))}
                      min="0"
                      step="0.01"
                      className="w-full px-4 py-2 bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-black mb-1">
                      บริษัทไฟแนนซ์ <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={formData.financeProvider}
                      onChange={(e) => setFormData(prev => ({ ...prev, financeProvider: e.target.value }))}
                      placeholder="ชื่อบริษัทไฟแนนซ์"
                      className={`w-full px-4 py-2 bg-white border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900 ${
                        errors.financeProvider ? 'border-red-500' : 'border-gray-300'
                      }`}
                    />
                    {errors.financeProvider && (
                      <p className="text-red-500 text-sm mt-1">{errors.financeProvider}</p>
                    )}
                  </div>
                </div>

                {/* Interest rate and installment */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-black mb-1">
                      อัตราดอกเบี้ย (% ต่อปี)
                    </label>
                    <input
                      type="number"
                      value={formData.interestRate}
                      onChange={(e) => {
                        const rate = parseFloat(e.target.value) || 0;
                        const terms = formData.numberOfTerms;
                        const finance = formData.financeAmount;
                        let installment = formData.monthlyInstallment;
                        if (rate > 0 && terms > 0 && finance > 0) {
                          const years = terms / 12;
                          const totalInterest = finance * (rate / 100) * years;
                          installment = Math.round((finance + totalInterest) / terms);
                        }
                        setFormData(prev => ({ ...prev, interestRate: rate, monthlyInstallment: installment }));
                      }}
                      min="0"
                      step="0.01"
                      placeholder="เช่น 2.49"
                      className="w-full px-4 py-2 bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-black mb-1">
                      จำนวนงวด (เดือน)
                    </label>
                    <input
                      type="number"
                      value={formData.numberOfTerms}
                      onChange={(e) => {
                        const terms = parseInt(e.target.value) || 0;
                        const rate = formData.interestRate;
                        const finance = formData.financeAmount;
                        let installment = formData.monthlyInstallment;
                        if (rate > 0 && terms > 0 && finance > 0) {
                          const years = terms / 12;
                          const totalInterest = finance * (rate / 100) * years;
                          installment = Math.round((finance + totalInterest) / terms);
                        }
                        setFormData(prev => ({ ...prev, numberOfTerms: terms, monthlyInstallment: installment }));
                      }}
                      min="0"
                      step="1"
                      placeholder="เช่น 48"
                      className="w-full px-4 py-2 bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-black mb-1">
                      ค่างวด/เดือน (บาท)
                    </label>
                    <input
                      type="number"
                      value={formData.monthlyInstallment}
                      onChange={(e) => setFormData(prev => ({ ...prev, monthlyInstallment: parseFloat(e.target.value) || 0 }))}
                      min="0"
                      step="0.01"
                      placeholder="คำนวณอัตโนมัติ"
                      className="w-full px-4 py-2 bg-blue-50 border border-blue-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900"
                    />
                    <p className="text-xs text-gray-500 mt-1">คำนวณอัตโนมัติจากยอดจัด × ดอกเบี้ย × ปี ÷ งวด</p>
                  </div>
                </div>
              </div>
            )}

            {/* Discount fields - visible for all payment modes */}
            {canDiscount && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg mt-4">
                <div className="md:col-span-2">
                  <p className="text-xs font-medium text-yellow-700 mb-2">ส่วนลด (สำหรับบัญชี/กรรมการ)</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-black mb-1">
                    ส่วนลดตัวรถ (บาท)
                  </label>
                  <input
                    type="number"
                    value={formData.carDiscount}
                    onChange={(e) => setFormData(prev => ({ ...prev, carDiscount: parseFloat(e.target.value) || 0 }))}
                    min="0"
                    step="0.01"
                    className="w-full px-4 py-2 bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-black mb-1">
                    ส่วนลดเงินดาวน์ (บาท)
                  </label>
                  <input
                    type="number"
                    value={formData.downPaymentDiscount}
                    onChange={(e) => setFormData(prev => ({ ...prev, downPaymentDiscount: parseFloat(e.target.value) || 0 }))}
                    min="0"
                    step="0.01"
                    className="w-full px-4 py-2 bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Notes */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold mb-4 text-black">หมายเหตุ</h2>
            <textarea
              value={formData.notes}
              onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
              rows={3}
              placeholder="หมายเหตุเพิ่มเติม..."
              className="w-full px-4 py-2 bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900"
            />
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-4">
            <button
              type="button"
              onClick={() => navigate('/sales')}
              className="px-6 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              ยกเลิก
            </button>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
            >
              <Save className="h-4 w-4 mr-2" />
              {saving ? 'กำลังบันทึก...' : isEditing ? 'บันทึกการแก้ไข' : 'สร้างการขาย'}
            </button>
          </div>
        </form>
      </div>

      {/* Price Source Selection Modal */}
      {pendingStock && pendingStock.vehicleModel && (
        <PriceSourceModal
          open={priceModalOpen}
          onClose={() => {
            setPriceModalOpen(false);
            setPendingStock(null);
          }}
          vehicleModel={{
            brand: pendingStock.vehicleModel.brand,
            model: pendingStock.vehicleModel.model,
            variant: pendingStock.vehicleModel.variant,
            year: pendingStock.vehicleModel.year,
            price: Number(pendingStock.vehicleModel.price),
          }}
          stock={{
            exteriorColor: pendingStock.exteriorColor,
            vin: pendingStock.vin,
            expectedSalePrice: pendingStock.expectedSalePrice,
          }}
          onSelect={handlePriceSourceSelect}
        />
      )}
    </MainLayout>
  );
}
