import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { salesService, type CreateSaleData, type UpdateSaleData, type PaymentMode } from '../../services/sales.service';
import { customerService, type Customer } from '../../services/customer.service';
import { stockService, type Stock } from '../../services/stock.service';
import { MainLayout } from '../../components/layout';
import { 
  ArrowLeft, 
  User, 
  Car, 
  DollarSign,
  Save,
  X
} from 'lucide-react';

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
  notes: string;
}

export default function SalesFormPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isEditing = Boolean(id);
  
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [availableStocks, setAvailableStocks] = useState<Stock[]>([]);
  const [customerSearch, setCustomerSearch] = useState('');
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [selectedStock, setSelectedStock] = useState<Stock | null>(null);
  
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

  useEffect(() => {
    if (customerSearch.length >= 2) {
      searchCustomers(customerSearch);
    }
  }, [customerSearch]);

  const fetchInitialData = async () => {
    try {
      setLoading(true);
      // Only fetch available stocks for Direct Sale
      const stocksRes = await stockService.getAvailable();
      setAvailableStocks(stocksRes);
    } catch (error) {
      console.error('Error fetching initial data:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchSale = async (saleId: string) => {
    try {
      setLoading(true);
      const sale = await salesService.getById(saleId);
      
      // For editing, we only allow editing Direct Sales
      if (sale.type !== 'DIRECT_SALE') {
        alert('ไม่สามารถแก้ไขการขายผ่านการจองได้ที่นี่ กรุณาแก้ไขผ่านหน้ารายละเอียดการขาย');
        navigate('/sales');
        return;
      }
      
      setFormData({
        customerId: sale.customer.id,
        stockId: sale.stock?.id || '',
        totalAmount: sale.totalAmount,
        depositAmount: sale.depositAmount,
        paymentMode: sale.paymentMode,
        downPayment: sale.downPayment || 0,
        financeAmount: sale.financeAmount || 0,
        financeProvider: sale.financeProvider || '',
        notes: sale.notes || '',
      });
      
      setSelectedCustomer(sale.customer as Customer);
      if (sale.stock) {
        setSelectedStock(sale.stock as unknown as Stock);
      }
    } catch (error) {
      console.error('Error fetching sale:', error);
      alert('ไม่สามารถโหลดข้อมูลการขายได้');
      navigate('/sales');
    } finally {
      setLoading(false);
    }
  };

  const searchCustomers = async (search: string) => {
    try {
      const response = await customerService.getAll({ search, limit: 10 });
      setCustomers(response.data);
      setShowCustomerDropdown(true);
    } catch (error) {
      console.error('Error searching customers:', error);
    }
  };

  const handleCustomerSelect = (customer: Customer) => {
    setSelectedCustomer(customer);
    setFormData({ ...formData, customerId: customer.id });
    setCustomerSearch(customer.name);
    setShowCustomerDropdown(false);
  };

  const handleStockSelect = (stockId: string) => {
    const stock = availableStocks.find(s => s.id === stockId);
    setSelectedStock(stock || null);
    
    if (stock) {
      setFormData({
        ...formData,
        stockId,
        totalAmount: stock.expectedSalePrice || formData.totalAmount,
      });
    } else {
      setFormData({
        ...formData,
        stockId: '',
      });
    }
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

    try {
      setSaving(true);
      
      // Direct Sale data - always DIRECT_SALE type
      const data: CreateSaleData | UpdateSaleData = {
        type: 'DIRECT_SALE',
        customerId: formData.customerId,
        stockId: formData.stockId,
        totalAmount: formData.totalAmount,
        depositAmount: formData.depositAmount || undefined,
        paymentMode: formData.paymentMode,
        downPayment: formData.downPayment || undefined,
        financeAmount: formData.financeAmount || undefined,
        financeProvider: formData.financeProvider || undefined,
        notes: formData.notes || undefined,
      };

      if (isEditing && id) {
        await salesService.update(id, data);
        alert('แก้ไขข้อมูลสำเร็จ');
      } else {
        await salesService.create(data as CreateSaleData);
        alert('สร้างการขายสำเร็จ');
      }
      
      navigate('/sales');
    } catch (error) {
      console.error('Error saving sale:', error);
      alert('เกิดข้อผิดพลาดในการบันทึกข้อมูล');
    } finally {
      setSaving(false);
    }
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
            <div className="relative">
              <label className="block text-sm font-medium text-black mb-1">
                ค้นหาลูกค้า <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={customerSearch}
                onChange={(e) => setCustomerSearch(e.target.value)}
                onFocus={() => customers.length > 0 && setShowCustomerDropdown(true)}
                placeholder="พิมพ์ชื่อ, รหัส หรือเบอร์โทรลูกค้า..."
                className={`w-full px-4 py-2 bg-white border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900 ${
                  errors.customerId ? 'border-red-500' : 'border-gray-300'
                }`}
              />
              {errors.customerId && (
                <p className="text-red-500 text-sm mt-1">{errors.customerId}</p>
              )}
              
              {/* Customer Dropdown */}
              {showCustomerDropdown && customers.length > 0 && (
                <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                  {customers.map((customer) => (
                    <button
                      key={customer.id}
                      type="button"
                      onClick={() => handleCustomerSelect(customer)}
                      className="w-full px-4 py-2 text-left hover:bg-gray-100 flex justify-between items-center"
                    >
                      <div>
                        <p className="font-medium">{customer.name}</p>
                        <p className="text-sm text-gray-700">{customer.code} • {customer.phone}</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Selected Customer Info */}
            {selectedCustomer && (
              <div className="mt-4 p-4 bg-gray-50 rounded-lg">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="font-medium">{selectedCustomer.name}</p>
                    <p className="text-sm text-gray-700">{selectedCustomer.code}</p>
                    <p className="text-sm text-gray-700">{selectedCustomer.phone}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedCustomer(null);
                      setFormData({ ...formData, customerId: '' });
                      setCustomerSearch('');
                    }}
                    className="text-gray-700 hover:text-gray-900"
                  >
                    <X className="h-4 w-4" />
                  </button>
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
              {/* Stock Selection */}
              {/* Stock Selection - Required for Direct Sale */}
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-black mb-1">
                  เลือก Stock (รถที่มีในสต็อก) <span className="text-red-500">*</span>
                </label>
                <select
                  value={formData.stockId}
                  onChange={(e) => handleStockSelect(e.target.value)}
                  className={`w-full px-4 py-2 bg-white border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900 ${
                    errors.stockId ? 'border-red-500' : 'border-gray-300'
                  }`}
                >
                  <option value="">-- เลือก Stock --</option>
                  {availableStocks.map((stock) => (
                    <option key={stock.id} value={stock.id}>
                      {stock.vehicleModel.brand} {stock.vehicleModel.model} - VIN: {stock.vin.slice(-8)} ({stock.exteriorColor})
                    </option>
                  ))}
                </select>
                {errors.stockId && (
                  <p className="text-red-500 text-sm mt-1">{errors.stockId}</p>
                )}
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
                  onChange={(e) => setFormData({ ...formData, totalAmount: parseFloat(e.target.value) || 0 })}
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
                  onChange={(e) => setFormData({ ...formData, depositAmount: parseFloat(e.target.value) || 0 })}
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
                  onChange={(e) => setFormData({ ...formData, paymentMode: e.target.value as PaymentMode })}
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
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
                <div>
                  <label className="block text-sm font-medium text-black mb-1">
                    เงินดาวน์ (บาท)
                  </label>
                  <input
                    type="number"
                    value={formData.downPayment}
                    onChange={(e) => setFormData({ ...formData, downPayment: parseFloat(e.target.value) || 0 })}
                    min="0"
                    step="0.01"
                    className="w-full px-4 py-2 bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-black mb-1">
                    ยอดไฟแนนซ์ (บาท)
                  </label>
                  <input
                    type="number"
                    value={formData.financeAmount}
                    onChange={(e) => setFormData({ ...formData, financeAmount: parseFloat(e.target.value) || 0 })}
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
                    onChange={(e) => setFormData({ ...formData, financeProvider: e.target.value })}
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
            )}
          </div>

          {/* Notes */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold mb-4 text-black">หมายเหตุ</h2>
            <textarea
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
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
    </MainLayout>
  );
}
