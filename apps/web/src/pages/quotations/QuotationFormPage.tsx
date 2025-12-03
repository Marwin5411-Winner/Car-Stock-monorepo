import { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { quotationService, type CreateQuotationData, type UpdateQuotationData } from '../../services/quotation.service';
import { customerService, type Customer } from '../../services/customer.service';
import { vehicleService, type VehicleModel } from '../../services/vehicle.service';
import { MainLayout } from '../../components/layout';
import { 
  ArrowLeft, 
  User, 
  Car, 
  DollarSign,
  Calendar,
  Save,
  FileText
} from 'lucide-react';
import { AsyncSearchSelect, SearchSelect, type SearchSelectOption } from '../../components/ui/search-select';

interface FormData {
  customerId: string;
  vehicleModelId: string;
  preferredExtColor: string;
  preferredIntColor: string;
  quotedPrice: number;
  discountAmount: number;
  validUntil: string;
  notes: string;
}

export default function QuotationFormPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isEditing = Boolean(id);
  
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [vehicleModels, setVehicleModels] = useState<VehicleModel[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [selectedVehicle, setSelectedVehicle] = useState<VehicleModel | null>(null);
  
  // Calculate default valid until (14 days from now)
  const getDefaultValidUntil = () => {
    const date = new Date();
    date.setDate(date.getDate() + 14);
    return date.toISOString().split('T')[0];
  };
  
  const [formData, setFormData] = useState<FormData>({
    customerId: '',
    vehicleModelId: '',
    preferredExtColor: '',
    preferredIntColor: '',
    quotedPrice: 0,
    discountAmount: 0,
    validUntil: getDefaultValidUntil(),
    notes: '',
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    fetchVehicleModels();
  }, []);

  useEffect(() => {
    if (id) {
      fetchQuotation(id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const fetchVehicleModels = async () => {
    try {
      const response = await vehicleService.getAll({ limit: 100 });
      setVehicleModels(response.data);
    } catch (error) {
      console.error('Error fetching vehicle models:', error);
    }
  };

  const fetchQuotation = async (quotationId: string) => {
    try {
      setLoading(true);
      const quotation = await quotationService.getById(quotationId);
      
      setFormData({
        customerId: quotation.customer.id,
        vehicleModelId: quotation.vehicleModel?.id || '',
        preferredExtColor: quotation.preferredExtColor || '',
        preferredIntColor: quotation.preferredIntColor || '',
        quotedPrice: quotation.quotedPrice,
        discountAmount: quotation.discountAmount || 0,
        validUntil: quotation.validUntil ? new Date(quotation.validUntil).toISOString().split('T')[0] : getDefaultValidUntil(),
        notes: quotation.notes || '',
      });
      
      setSelectedCustomer(quotation.customer as Customer);
      if (quotation.vehicleModel) {
        setSelectedVehicle(quotation.vehicleModel as VehicleModel);
      }
    } catch (error) {
      console.error('Error fetching quotation:', error);
      alert('ไม่สามารถโหลดข้อมูลใบเสนอราคาได้');
      navigate('/quotations');
    } finally {
      setLoading(false);
    }
  };

  // Async customer search for SearchSelect
  const loadCustomerOptions = useCallback(async (query: string): Promise<SearchSelectOption<Customer>[]> => {
    try {
      const response = await customerService.getAll({ search: query, limit: 10 });
      return response.data.map((customer: Customer) => ({
        value: customer.id,
        label: customer.name,
        description: `${customer.code} • ${customer.phone}`,
        data: customer,
      }));
    } catch (error) {
      console.error('Error searching customers:', error);
      return [];
    }
  }, []);

  const handleCustomerSelect = (value: string, option?: SearchSelectOption<Customer>) => {
    if (option?.data) {
      setSelectedCustomer(option.data);
      setFormData({ ...formData, customerId: value });
    } else {
      setSelectedCustomer(null);
      setFormData({ ...formData, customerId: '' });
    }
  };

  // Convert vehicle models to SearchSelect options
  const vehicleModelOptions: SearchSelectOption<VehicleModel>[] = useMemo(() => {
    return vehicleModels.map((vm) => ({
      value: vm.id,
      label: `${vm.brand} ${vm.model} ${vm.variant || ''} (${vm.year})`.trim(),
      description: vm.price ? `฿${vm.price.toLocaleString()}` : undefined,
      data: vm,
    }));
  }, [vehicleModels]);

  const handleVehicleModelSelect = (value: string, option?: SearchSelectOption<VehicleModel>) => {
    const vehicle = option?.data || null;
    setSelectedVehicle(vehicle);
    setFormData({
      ...formData,
      vehicleModelId: value,
      quotedPrice: Number(vehicle?.price) || formData.quotedPrice,
    });
  };

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.customerId) {
      newErrors.customerId = 'กรุณาเลือกลูกค้า';
    }

    if (!formData.vehicleModelId) {
      newErrors.vehicleModelId = 'กรุณาเลือกรุ่นรถ';
    }

    if (formData.quotedPrice <= 0) {
      newErrors.quotedPrice = 'กรุณาระบุราคาเสนอ';
    }

    if (!formData.validUntil) {
      newErrors.validUntil = 'กรุณาระบุวันหมดอายุ';
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
      
      const data: CreateQuotationData | UpdateQuotationData = {
        customerId: formData.customerId,
        vehicleModelId: formData.vehicleModelId || undefined,
        preferredExtColor: formData.preferredExtColor || undefined,
        preferredIntColor: formData.preferredIntColor || undefined,
        quotedPrice: formData.quotedPrice,
        discountAmount: formData.discountAmount || undefined,
        validUntil: new Date(formData.validUntil),
        notes: formData.notes || undefined,
      };

      if (isEditing && id) {
        await quotationService.update(id, data);
        alert('แก้ไขข้อมูลสำเร็จ');
      } else {
        await quotationService.create(data as CreateQuotationData);
        alert('สร้างใบเสนอราคาสำเร็จ');
      }
      
      navigate('/quotations');
    } catch (error) {
      console.error('Error saving quotation:', error);
      alert('เกิดข้อผิดพลาดในการบันทึกข้อมูล');
    } finally {
      setSaving(false);
    }
  };

  // Calculate final price
  const finalPrice = formData.quotedPrice - formData.discountAmount;

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
            onClick={() => navigate('/quotations')}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ArrowLeft className="h-5 w-5 text-gray-600" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              {isEditing ? 'แก้ไขใบเสนอราคา' : 'สร้างใบเสนอราคาใหม่'}
            </h1>
            <p className="text-sm text-gray-700 mt-1">
              สร้างใบเสนอราคาให้ลูกค้า เมื่อลูกค้ายอมรับสามารถแปลงเป็นการขายได้
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
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
            />

            {/* Selected Customer Info */}
            {selectedCustomer && (
              <div className="mt-4 p-4 bg-gray-50 rounded-lg">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="font-medium">{selectedCustomer.name}</p>
                    <p className="text-sm text-gray-700">{selectedCustomer.code}</p>
                    <p className="text-sm text-gray-700">{selectedCustomer.phone}</p>
                    {selectedCustomer.email && (
                      <p className="text-sm text-gray-700">{selectedCustomer.email}</p>
                    )}
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
            
            <div className="grid grid-cols-1 gap-4">
              {/* Vehicle Model Selection */}
              <div>
                <SearchSelect<VehicleModel>
                  value={formData.vehicleModelId}
                  onChange={handleVehicleModelSelect}
                  options={vehicleModelOptions}
                  label="รุ่นรถยนต์"
                  required
                  placeholder="-- เลือกรุ่นรถ --"
                  error={errors.vehicleModelId}
                  emptyMessage="ไม่พบรุ่นรถ"
                />
              </div>

              {/* Preferred Colors */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-black mb-1">
                    สีภายนอกที่ต้องการ
                  </label>
                  <input
                    type="text"
                    value={formData.preferredExtColor}
                    onChange={(e) => setFormData({ ...formData, preferredExtColor: e.target.value })}
                    placeholder="เช่น ดำ, ขาว, เงิน"
                    className="w-full px-4 py-2 bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-black mb-1">
                    สีภายในที่ต้องการ
                  </label>
                  <input
                    type="text"
                    value={formData.preferredIntColor}
                    onChange={(e) => setFormData({ ...formData, preferredIntColor: e.target.value })}
                    placeholder="เช่น ดำ, น้ำตาล"
                    className="w-full px-4 py-2 bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900"
                  />
                </div>
              </div>
            </div>

            {/* Selected Vehicle Info */}
            {selectedVehicle && (
              <div className="mt-4 p-4 bg-blue-50 rounded-lg">
                <p className="font-medium text-blue-800">
                  {selectedVehicle.brand} {selectedVehicle.model}
                  {selectedVehicle.variant && ` ${selectedVehicle.variant}`}
                </p>
                <p className="text-sm text-blue-600">ปี: {selectedVehicle.year}</p>
                <p className="text-sm text-blue-600">
                  ราคาตั้ง: ฿{selectedVehicle.price?.toLocaleString()}
                </p>
              </div>
            )}
          </div>

          {/* Pricing Info */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold mb-4 flex items-center text-black">
              <DollarSign className="h-5 w-5 mr-2 text-blue-600" />
              ข้อมูลราคา
            </h2>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-black mb-1">
                  ราคาเสนอ (บาท) <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  value={formData.quotedPrice}
                  onChange={(e) => setFormData({ ...formData, quotedPrice: parseFloat(e.target.value) || 0 })}
                  min="0"
                  step="0.01"
                  className={`w-full px-4 py-2 bg-white border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900 ${
                    errors.quotedPrice ? 'border-red-500' : 'border-gray-300'
                  }`}
                />
                {errors.quotedPrice && (
                  <p className="text-red-500 text-sm mt-1">{errors.quotedPrice}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-black mb-1">
                  ส่วนลด (บาท)
                </label>
                <input
                  type="number"
                  value={formData.discountAmount}
                  onChange={(e) => setFormData({ ...formData, discountAmount: parseFloat(e.target.value) || 0 })}
                  min="0"
                  step="0.01"
                  className="w-full px-4 py-2 bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-black mb-1">
                  ราคาสุทธิ (บาท)
                </label>
                <div className="w-full px-4 py-2 bg-green-50 border border-green-200 rounded-lg text-lg font-semibold text-green-700">
                  ฿{finalPrice.toLocaleString()}
                </div>
              </div>
            </div>
          </div>

          {/* Validity */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold mb-4 flex items-center text-black">
              <Calendar className="h-5 w-5 mr-2 text-blue-600" />
              ระยะเวลา
            </h2>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-black mb-1">
                  วันหมดอายุใบเสนอราคา <span className="text-red-500">*</span>
                </label>
                <input
                  type="date"
                  value={formData.validUntil}
                  onChange={(e) => setFormData({ ...formData, validUntil: e.target.value })}
                  min={new Date().toISOString().split('T')[0]}
                  className={`w-full px-4 py-2 bg-white border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900 ${
                    errors.validUntil ? 'border-red-500' : 'border-gray-300'
                  }`}
                />
                {errors.validUntil && (
                  <p className="text-red-500 text-sm mt-1">{errors.validUntil}</p>
                )}
              </div>
            </div>
          </div>

          {/* Notes */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold mb-4 flex items-center text-black">
              <FileText className="h-5 w-5 mr-2 text-blue-600" />
              หมายเหตุ
            </h2>
            
            <textarea
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              rows={4}
              placeholder="หมายเหตุเพิ่มเติม เช่น เงื่อนไขพิเศษ, ของแถม..."
              className="w-full px-4 py-2 bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900"
            />
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-4">
            <button
              type="button"
              onClick={() => navigate('/quotations')}
              className="px-6 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              ยกเลิก
            </button>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
            >
              <Save className="h-5 w-5 mr-2" />
              {saving ? 'กำลังบันทึก...' : isEditing ? 'บันทึกการแก้ไข' : 'สร้างใบเสนอราคา'}
            </button>
          </div>
        </form>
      </div>
    </MainLayout>
  );
}
