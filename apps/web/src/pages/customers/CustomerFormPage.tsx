import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { customerService } from '../../services/customer.service';
import { MainLayout } from '../../components/layout';
import { ArrowLeft, Save } from 'lucide-react';
import { PROVINCES } from '../../constants/provinces';
import { SearchSelect, type SearchSelectOption } from '../../components/ui/search-select';

export default function CustomerFormPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isEdit = !!id;

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<{ taxId?: string }>({});

  const [formData, setFormData] = useState({
    type: 'INDIVIDUAL' as 'INDIVIDUAL' | 'COMPANY',
    salesType: 'NORMAL_SALES' as 'NORMAL_SALES' | 'FLEET_SALES',
    name: '',
    phone: '',
    email: '',
    taxId: '',
    houseNumber: '',
    street: '',
    subdistrict: '',
    district: '',
    province: '',
    postalCode: '',
  });

  useEffect(() => {
    if (isEdit && id) {
      fetchCustomer(id);
    }
  }, [id, isEdit]);

  const validateTaxId = (taxId: string): string | undefined => {
    if (!taxId) return undefined;
    const digitRegex = /^\d{13}$/;
    if (!digitRegex.test(taxId)) {
      return 'เลขประจำตัวผู้เสียภาษีต้องเป็นตัวเลข 13 หลักเท่านั้น';
    }
    return undefined;
  };

  const fetchCustomer = async (customerId: string) => {
    try {
      setLoading(true);
      const customer = await customerService.getById(customerId);
      setFormData({
        type: customer.type,
        salesType: customer.salesType,
        name: customer.name,
        phone: customer.phone,
        email: customer.email || '',
        taxId: customer.taxId || '',
        houseNumber: customer.houseNumber,
        street: customer.street || '',
        subdistrict: customer.subdistrict,
        district: customer.district,
        province: customer.province,
        postalCode: customer.postalCode || '',
      });
    } catch (error) {
      console.error('Error fetching customer:', error);
      alert('ไม่สามารถโหลดข้อมูลลูกค้าได้');
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;

    if (name === 'taxId') {
      const sanitizedValue = value.replace(/\D/g, '').slice(0, 13);
      setFormData((prev) => ({
        ...prev,
        [name]: sanitizedValue,
      }));

      const error = validateTaxId(sanitizedValue);
      setErrors((prev) => ({
        ...prev,
        taxId: error,
      }));
    } else {
      setFormData((prev) => ({
        ...prev,
        [name]: value,
      }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    const taxIdError = validateTaxId(formData.taxId);
    if (taxIdError) {
      setErrors({ taxId: taxIdError });
      setSaving(false);
      return;
    }

    try {
      const data = {
        type: formData.type,
        salesType: formData.salesType,
        name: formData.name,
        phone: formData.phone,
        email: formData.email || undefined,
        taxId: formData.taxId || undefined,
        houseNumber: formData.houseNumber,
        street: formData.street || undefined,
        subdistrict: formData.subdistrict,
        district: formData.district,
        province: formData.province,
        postalCode: formData.postalCode || undefined,
      };

      if (isEdit && id) {
        await customerService.update(id, data);
        alert('อัปเดตข้อมูลลูกค้าสำเร็จ');
      } else {
        await customerService.create(data);
        alert('เพิ่มลูกค้าใหม่สำเร็จ');
      }
      navigate('/customers');
    } catch (error) {
      console.error('Error saving customer:', error);
      alert('ไม่สามารถบันทึกข้อมูลลูกค้าได้');
    } finally {
      setSaving(false);
    }
  };

  // Convert provinces to SearchSelect options
  const provinceOptions: SearchSelectOption[] = useMemo(() => {
    return PROVINCES.map((province) => ({
      value: province,
      label: province,
    }));
  }, []);

  const handleProvinceSelect = (value: string) => {
    setFormData((prev) => ({
      ...prev,
      province: value,
    }));
  };

  if (loading) {
    return (
      <MainLayout>
        <div className="text-center py-12">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <p className="mt-2 text-gray-700">กำลังโหลด...</p>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="mb-6">
        <button
          onClick={() => navigate('/customers')}
          className="inline-flex items-center text-gray-700 hover:text-gray-900 mb-4"
        >
          <ArrowLeft className="w-5 h-5 mr-2" />
          กลับ
        </button>
        <h1 className="text-2xl font-bold text-gray-900">
          {isEdit ? 'แก้ไขข้อมูลลูกค้า' : 'เพิ่มลูกค้าใหม่'}
        </h1>
      </div>

      <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              ประเภทลูกค้า <span className="text-red-500">*</span>
            </label>
            <select
              name="type"
              value={formData.type}
              onChange={handleChange}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900"
            >
              <option value="INDIVIDUAL">บุคคลธรรมดา</option>
              <option value="COMPANY">นิติบุคคล</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              ประเภทการขาย <span className="text-red-500">*</span>
            </label>
            <select
              name="salesType"
              value={formData.salesType}
              onChange={handleChange}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900"
            >
              <option value="NORMAL_SALES">ขายปกติ</option>
              <option value="FLEET_SALES">ขายแบบ Fleets</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              ชื่อ-นามสกุล <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              name="name"
              value={formData.name}
              onChange={handleChange}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              เบอร์โทรศัพท์ <span className="text-red-500">*</span>
            </label>
            <input
              type="tel"
              name="phone"
              value={formData.phone}
              onChange={handleChange}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              อีเมล
            </label>
            <input
              type="email"
              name="email"
              value={formData.email}
              onChange={handleChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              เลขประจำตัวผู้เสียภาษี
            </label>
            <input
              type="text"
              name="taxId"
              value={formData.taxId}
              onChange={handleChange}
              maxLength={13}
              className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 ${
                errors.taxId ? 'border-red-500' : 'border-gray-300'
              }`}
            />
            {errors.taxId && (
              <p className="mt-1 text-sm text-red-600">{errors.taxId}</p>
            )}
          </div>

        </div>

        <div className="mt-8">
          <h2 className="text-lg font-medium text-gray-900 mb-4">ที่อยู่</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                บ้านเลขที่ <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                name="houseNumber"
                value={formData.houseNumber}
                onChange={handleChange}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                ถนน
              </label>
              <input
                type="text"
                name="street"
                value={formData.street}
                onChange={handleChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                แขวง/ตำบล <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                name="subdistrict"
                value={formData.subdistrict}
                onChange={handleChange}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                เขต/อำเภอ <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                name="district"
                value={formData.district}
                onChange={handleChange}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900"
              />
            </div>

            <div>
              <SearchSelect
                value={formData.province}
                onChange={handleProvinceSelect}
                options={provinceOptions}
                label="จังหวัด"
                required
                placeholder="เลือกจังหวัด"
                emptyMessage="ไม่พบจังหวัด"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                รหัสไปรษณีย์
              </label>
              <input
                type="text"
                name="postalCode"
                value={formData.postalCode}
                onChange={handleChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900"
              />
            </div>
          </div>
        </div>

        <div className="mt-8 flex justify-end gap-4">
          <button
            type="button"
            onClick={() => navigate('/customers')}
            className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
          >
            ยกเลิก
          </button>
          <button
            type="submit"
            disabled={saving}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
          >
            <Save className="w-5 h-5 mr-2" />
            {saving ? 'กำลังบันทึก...' : 'บันทึก'}
          </button>
        </div>
      </form>
    </MainLayout>
  );
}
