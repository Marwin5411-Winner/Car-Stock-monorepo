import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { stockService } from '../../services/stock.service';
import { vehicleService } from '../../services/vehicle.service';
import { useMutationHandler, useErrorHandler } from '../../hooks/useErrorHandler';
import { MainLayout } from '../../components/layout';
import { ArrowLeft } from 'lucide-react';
import { SearchSelect, type SearchSelectOption } from '../../components/ui/search-select';
import { PriceSourceModal, type PriceSource } from '../../components/PriceSourceModal';

interface VehicleModel {
  id: string;
  brand: string;
  model: string;
  variant?: string;
  year: number;
  price: string | number;
  standardCost: string | number;
  primaryColor?: string;
}

export default function StockFormPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isEdit = !!id;

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [vehicles, setVehicles] = useState<VehicleModel[]>([]);
  const [priceModalOpen, setPriceModalOpen] = useState(false);
  const [pendingVehicle, setPendingVehicle] = useState<VehicleModel | null>(null);

  const { execute: executeMutation, fieldErrors, clearFieldErrors } = useMutationHandler(
    isEdit ? 'แก้ไขข้อมูลสต็อกสำเร็จ' : 'เพิ่มสต็อกสำเร็จ',
    { onSuccess: () => navigate('/stock') }
  );
  const { execute: executeQuery } = useErrorHandler({ showToast: true });

  const [formData, setFormData] = useState({
    vin: '',
    engineNumber: '',
    motorNumber1: '',
    motorNumber2: '',
    vehicleModelId: '',
    exteriorColor: '',
    interiorColor: '',
    arrivalDate: new Date().toISOString().split('T')[0],
    orderDate: '',
    parkingSlot: '',
    status: 'AVAILABLE' as 'AVAILABLE' | 'RESERVED' | 'PREPARING' | 'SOLD' | 'DEMO',
    baseCost: '' as number | '',
    transportCost: '' as number | '',
    accessoryCost: '' as number | '',
    otherCosts: '' as number | '',
    financeProvider: '',
    interestRate: '' as number | '',
    interestPrincipalBase: 'TOTAL_COST' as 'BASE_COST_ONLY' | 'TOTAL_COST',
    expectedSalePrice: '' as number | '',
    notes: '',
  });

  useEffect(() => {
    fetchVehicles();
    if (isEdit && id) {
      fetchStock(id);
    }
  }, [id, isEdit]);

  const fetchVehicles = async () => {
    await executeQuery(
      vehicleService.getAll({ limit: 100 }).then((response) => {
        setVehicles(response.data);
      })
    );
  };

  const fetchStock = async (stockId: string) => {
    setLoading(true);
    await executeQuery(
      stockService.getById(stockId).then((stock) => {
        setFormData({
          vin: stock.vin,
          engineNumber: stock.engineNumber || '',
          motorNumber1: stock.motorNumber1 || '',
          motorNumber2: stock.motorNumber2 || '',
          vehicleModelId: stock.vehicleModel.id,
          exteriorColor: stock.exteriorColor,
          interiorColor: stock.interiorColor || '',
          arrivalDate: new Date(stock.arrivalDate).toISOString().split('T')[0],
          orderDate: stock.orderDate ? new Date(stock.orderDate).toISOString().split('T')[0] : '',
          parkingSlot: stock.parkingSlot || '',
          status: stock.status,
          baseCost: Number(stock.baseCost),
          transportCost: Number(stock.transportCost),
          accessoryCost: Number(stock.accessoryCost),
          otherCosts: Number(stock.otherCosts),
          financeProvider: stock.financeProvider || '',
          interestRate: Number(stock.interestRate) * 100,
          interestPrincipalBase: stock.interestPrincipalBase,
          expectedSalePrice: stock.expectedSalePrice ? Number(stock.expectedSalePrice) : '',
          notes: stock.notes || '',
        });
      })
    );
    setLoading(false);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: ['baseCost', 'transportCost', 'accessoryCost', 'otherCosts', 'interestRate', 'expectedSalePrice'].includes(name)
        ? (value === '' ? '' : Number(value))
        : value,
    }));
  };

  // Convert vehicles to SearchSelect options
  const vehicleOptions: SearchSelectOption<VehicleModel>[] = useMemo(() => {
    return vehicles.map((vehicle) => ({
      value: vehicle.id,
      label: `${vehicle.brand} ${vehicle.model} ${vehicle.variant || ''} (${vehicle.year})`.trim(),
      data: vehicle,
    }));
  }, [vehicles]);

  const handleVehicleSelect = (value: string) => {
    const selectedVehicle = vehicles.find((v) => v.id === value);

    setFormData((prev) => {
      const updates: Partial<typeof prev> = {
        vehicleModelId: value,
      };

      // Set exteriorColor from primaryColor if current value is empty
      if (selectedVehicle && !prev.exteriorColor && selectedVehicle.primaryColor) {
        updates.exteriorColor = selectedVehicle.primaryColor;
      }

      return { ...prev, ...updates };
    });

    if (!selectedVehicle) return;

    // Edit mode: existing stock has prices → open modal to let user choose
    if (isEdit && (formData.baseCost || formData.expectedSalePrice)) {
      setPendingVehicle(selectedVehicle);
      setPriceModalOpen(true);
    } else {
      // Create mode or no existing prices: auto-fill from VehicleModel
      setFormData((prev) => ({
        ...prev,
        baseCost: !prev.baseCost || prev.baseCost === 0 ? Number(selectedVehicle.standardCost) || 0 : prev.baseCost,
        expectedSalePrice: prev.expectedSalePrice === undefined || prev.expectedSalePrice === 0 || prev.expectedSalePrice === ''
          ? Number(selectedVehicle.price) || ''
          : prev.expectedSalePrice,
      }));
    }
  };

  const handlePriceSourceSelect = (source: PriceSource) => {
    if (!pendingVehicle) return;

    if (source === 'model') {
      setFormData((prev) => ({
        ...prev,
        baseCost: Number(pendingVehicle.standardCost) || 0,
        expectedSalePrice: Number(pendingVehicle.price) || '',
      }));
    }
    // source === 'stock': keep existing form values (no changes needed)
    setPendingVehicle(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    clearFieldErrors();

    const data = {
      ...formData,
      baseCost: formData.baseCost === '' ? 0 : Number(formData.baseCost),
      transportCost: formData.transportCost === '' ? 0 : Number(formData.transportCost),
      accessoryCost: formData.accessoryCost === '' ? 0 : Number(formData.accessoryCost),
      otherCosts: formData.otherCosts === '' ? 0 : Number(formData.otherCosts),
      interestRate: formData.interestRate === '' ? 0 : Number(formData.interestRate) / 100,
      expectedSalePrice: formData.expectedSalePrice === '' ? undefined : Number(formData.expectedSalePrice),
      orderDate: formData.orderDate ? new Date(formData.orderDate) : undefined,
      arrivalDate: new Date(formData.arrivalDate),
    };

    await executeMutation(
      isEdit && id ? stockService.update(id, data) : stockService.create(data)
    );
    setSaving(false);
  };

  if (loading) {
    return (
      <MainLayout>
        <div className="text-center py-12">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <p className="mt-2 text-gray-600">กำลังโหลด...</p>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="mb-6">
        <button
          onClick={() => navigate('/stock')}
          className="inline-flex items-center text-gray-600 hover:text-gray-900 mb-4"
        >
          <ArrowLeft className="w-5 h-5 mr-2" />
          กลับ
        </button>
        <h1 className="text-2xl font-bold text-gray-900">
          {isEdit ? 'แก้ไขข้อมูล Stock' : 'เพิ่ม Stock ใหม่'}
        </h1>
      </div>

      <form id="stock-form" onSubmit={handleSubmit}>
        <div className="max-w-5xl mx-auto space-y-8">
          {/* Vehicle Information Section */}
          <section className="bg-white rounded-lg shadow p-6 space-y-6">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold text-gray-900">ข้อมูลรถยนต์</h2>
                <p className="text-sm text-gray-500 mt-1">ระบุข้อมูลพื้นฐานของรถและรายละเอียดการผลิต</p>
              </div>
            </div>

            <div className="grid gap-6 lg:grid-cols-3">
              <div className="space-y-2 md:col-span-2">
                <SearchSelect
                  value={formData.vehicleModelId}
                  onChange={handleVehicleSelect}
                  options={vehicleOptions}
                  label="รุ่นรถ"
                  required
                  placeholder="ค้นหาหรือเลือกรุ่นรถ..."
                  emptyMessage="ไม่พบข้อมูล"
                />
              </div>

              <div className="space-y-2 md:col-span-2 lg:col-span-1">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <label htmlFor="orderDate" className="block text-sm font-medium text-gray-700">
                      วันที่สั่งซื้อ
                    </label>
                    <input
                      type="date"
                      id="orderDate"
                      name="orderDate"
                      value={formData.orderDate}
                      onChange={handleChange}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900"
                    />
                  </div>
                  <div className="space-y-2">
                    <label htmlFor="arrivalDate" className="block text-sm font-medium text-gray-700">
                      วันที่เข้าสต็อก <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="date"
                      id="arrivalDate"
                      name="arrivalDate"
                      value={formData.arrivalDate}
                      onChange={handleChange}
                      required
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900"
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="grid gap-6 md:grid-cols-2">
              <div className="space-y-2">
                <label htmlFor="vin" className="block text-sm font-medium text-gray-700">
                  หมายเลข VIN / เลขตัวถัง <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  id="vin"
                  name="vin"
                  value={formData.vin}
                  onChange={(e) => { handleChange(e); clearFieldErrors(); }}
                  placeholder="JTMHU09J704567123"
                  required
                  className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 ${fieldErrors.vin ? 'border-red-500' : 'border-gray-300'}`}
                />
                {fieldErrors.vin ? (
                  <p className="text-sm text-red-500 mt-1">{fieldErrors.vin}</p>
                ) : (
                  <p className="text-xs text-gray-500 mt-1">กรอกหมายเลข VIN หรือเลขตัวถัง</p>
                )}
              </div>

              <div className="space-y-2">
                <label htmlFor="engineNumber" className="block text-sm font-medium text-gray-700">
                  หมายเลขเครื่องยนต์
                </label>
                <input
                  type="text"
                  id="engineNumber"
                  name="engineNumber"
                  value={formData.engineNumber}
                  onChange={(e) => { handleChange(e); clearFieldErrors(); }}
                  placeholder="1GD-FTV-0123456"
                  className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 ${fieldErrors.enginenumber ? 'border-red-500' : 'border-gray-300'}`}
                />
                {fieldErrors.enginenumber && <p className="text-sm text-red-500 mt-1">{fieldErrors.enginenumber}</p>}
              </div>
            </div>

            <div className="grid gap-6 md:grid-cols-2">
              <div className="space-y-2">
                <label htmlFor="motorNumber1" className="block text-sm font-medium text-gray-700">
                  หมายเลขมอเตอร์ 1 (EV/Hybrid)
                </label>
                <input
                  type="text"
                  id="motorNumber1"
                  name="motorNumber1"
                  value={formData.motorNumber1}
                  onChange={handleChange}
                  placeholder="MOT1-12345678"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900"
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="motorNumber2" className="block text-sm font-medium text-gray-700">
                  หมายเลขมอเตอร์ 2 (EV/Hybrid)
                </label>
                <input
                  type="text"
                  id="motorNumber2"
                  name="motorNumber2"
                  value={formData.motorNumber2}
                  onChange={handleChange}
                  placeholder="MOT2-12345678"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900"
                />
              </div>
            </div>

            <div className="grid gap-6 md:grid-cols-3">
              <div className="space-y-2">
                <label htmlFor="exteriorColor" className="block text-sm font-medium text-gray-700">
                  สีภายนอก <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  id="exteriorColor"
                  name="exteriorColor"
                  value={formData.exteriorColor}
                  onChange={handleChange}
                  placeholder="Pearl White"
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900"
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="interiorColor" className="block text-sm font-medium text-gray-700">
                  สีภายใน
                </label>
                <input
                  type="text"
                  id="interiorColor"
                  name="interiorColor"
                  value={formData.interiorColor}
                  onChange={handleChange}
                  placeholder="Black/Brown Leather"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900"
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="parkingSlot" className="block text-sm font-medium text-gray-700">
                  จุดจอดรถ
                </label>
                <input
                  type="text"
                  id="parkingSlot"
                  name="parkingSlot"
                  value={formData.parkingSlot}
                  onChange={handleChange}
                  placeholder="เช่น A-12"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900"
                />
              </div>
            </div>

            <div className="grid gap-6 md:grid-cols-2">
              <div className="space-y-2">
                <label htmlFor="status" className="block text-sm font-medium text-gray-700">
                  สถานะ <span className="text-red-500">*</span>
                </label>
                <select
                  id="status"
                  name="status"
                  value={formData.status}
                  onChange={handleChange}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900"
                >
                  <option value="AVAILABLE">พร้อมขาย</option>
                  <option value="RESERVED">จองแล้ว</option>
                  <option value="PREPARING">เตรียมขาย</option>
                  <option value="DEMO">รถ Demo</option>
                  <option value="SOLD">ขายแล้ว</option>
                </select>
              </div>
            </div>
          </section>

          {/* Cost Information Section */}
          <section className="bg-white rounded-lg shadow p-6 space-y-6">
            <div>
              <h2 className="text-xl font-semibold text-gray-900">ข้อมูลต้นทุน</h2>
              <p className="text-sm text-gray-500 mt-1">ระบุต้นทุนและค่าใช้จ่ายต่าง ๆ</p>
            </div>

            <div className="grid gap-6 md:grid-cols-2">
              <div className="space-y-2">
                <label htmlFor="baseCost" className="block text-sm font-medium text-gray-700">
                  ต้นทุนฐาน (บาท) <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  id="baseCost"
                  name="baseCost"
                  value={formData.baseCost}
                  onChange={handleChange}
                  step="0.01"
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900"
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="transportCost" className="block text-sm font-medium text-gray-700">
                  ค่าขนส่ง (บาท)
                </label>
                <input
                  type="number"
                  id="transportCost"
                  name="transportCost"
                  value={formData.transportCost}
                  onChange={handleChange}
                  step="0.01"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900"
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="accessoryCost" className="block text-sm font-medium text-gray-700">
                  ค่าอุปกรณ์เสริม (บาท)
                </label>
                <input
                  type="number"
                  id="accessoryCost"
                  name="accessoryCost"
                  value={formData.accessoryCost}
                  onChange={handleChange}
                  step="0.01"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900"
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="otherCosts" className="block text-sm font-medium text-gray-700">
                  ค่าใช้จ่ายอื่น ๆ (บาท)
                </label>
                <input
                  type="number"
                  id="otherCosts"
                  name="otherCosts"
                  value={formData.otherCosts}
                  onChange={handleChange}
                  step="0.01"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900"
                />
              </div>
            </div>
          </section>

          {/* Interest Configuration Section */}
          <section className="bg-white rounded-lg shadow p-6 space-y-6">
            <div>
              <h2 className="text-xl font-semibold text-gray-900">การตั้งค่าดอกเบี้ย</h2>
              <p className="text-sm text-gray-500 mt-1">ระบุอัตราดอกเบี้ยและฐานการคำนวณ</p>
            </div>

            <div className="grid gap-6 md:grid-cols-2">
              <div className="space-y-2">
                <label htmlFor="interestRate" className="block text-sm font-medium text-gray-700">
                  อัตราดอกเบี้ย (% ต่อปี) <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  id="interestRate"
                  name="interestRate"
                  value={formData.interestRate}
                  onChange={handleChange}
                  step="0.01"
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900"
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="interestPrincipalBase" className="block text-sm font-medium text-gray-700">
                  ฐานการคำนวณดอกเบี้ย <span className="text-red-500">*</span>
                </label>
                <select
                  id="interestPrincipalBase"
                  name="interestPrincipalBase"
                  value={formData.interestPrincipalBase}
                  onChange={handleChange}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900"
                >
                  <option value="BASE_COST_ONLY">ต้นทุนฐานเท่านั้น</option>
                  <option value="TOTAL_COST">ต้นทุนรวมทั้งหมด</option>
                </select>
                <p className="text-xs text-gray-500 mt-1">
                  <strong>ต้นทุนฐานเท่านั้น:</strong> คำนวณดอกเบี้ยจากราคาต้นทุนพื้นฐาน (Base Cost) เท่านั้น<br />
                  <strong>ต้นทุนรวมทั้งหมด:</strong> คำนวณดอกเบี้ยจากต้นทุนรวม (Base + ขนส่ง + อุปกรณ์ + อื่นๆ)
                </p>
              </div>

              <div className="space-y-2 md:col-span-2">
                <label htmlFor="financeProvider" className="block text-sm font-medium text-gray-700">
                  ผู้ให้บริการสินเชื่อ
                </label>
                <input
                  type="text"
                  id="financeProvider"
                  name="financeProvider"
                  value={formData.financeProvider}
                  onChange={handleChange}
                  placeholder="เช่น SCB Floor Plan (สัญญา: FP2024-0015)"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900"
                />
                <p className="text-xs text-gray-500 mt-1">
                  💡 <strong>หมายเหตุ:</strong> ถ้าไม่ได้กรอกช่องนี้ จะถือว่ารถคันนี้ไม่ได้จัดไฟแนนซ์หรือไม่กู้มาซื้อ (ซื้อเงินสด)
                </p>
              </div>
            </div>
          </section>

          {/* Sale Information & Notes Section */}
          <section className="bg-white rounded-lg shadow p-6 space-y-6">
            <div>
              <h2 className="text-xl font-semibold text-gray-900">ข้อมูลการขาย & หมายเหตุ</h2>
              <p className="text-sm text-gray-500 mt-1">ระบุราคาขายและข้อมูลเพิ่มเติม</p>
            </div>

            <div className="space-y-2">
              <label htmlFor="expectedSalePrice" className="block text-sm font-medium text-gray-700">
                ราคาขายคาดการณ์ (บาท)
              </label>
              <input
                type="number"
                id="expectedSalePrice"
                name="expectedSalePrice"
                value={formData.expectedSalePrice}
                onChange={handleChange}
                step="0.01"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900"
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="notes" className="block text-sm font-medium text-gray-700">
                หมายเหตุ
              </label>
              <textarea
                id="notes"
                name="notes"
                value={formData.notes}
                onChange={handleChange}
                rows={4}
                placeholder="ข้อมูลเพิ่มเติมเกี่ยวกับรถคันนี้..."
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900"
              />
            </div>

            {/* Form Actions */}
            <div className="flex flex-wrap justify-end gap-3 pt-6 border-t border-gray-200">
              <button
                type="button"
                onClick={() => navigate('/stock')}
                className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
              >
                ยกเลิก
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? 'กำลังบันทึก...' : isEdit ? 'อัพเดทข้อมูล' : 'บันทึกสต็อก'}
              </button>
            </div>
          </section>
        </div>
      </form>

      {/* Price Source Selection Modal (edit mode - when changing VehicleModel) */}
      {pendingVehicle && (
        <PriceSourceModal
          open={priceModalOpen}
          onClose={() => {
            setPriceModalOpen(false);
            setPendingVehicle(null);
          }}
          vehicleModel={{
            brand: pendingVehicle.brand,
            model: pendingVehicle.model,
            variant: pendingVehicle.variant,
            year: pendingVehicle.year,
            price: Number(pendingVehicle.price),
          }}
          stock={{
            exteriorColor: formData.exteriorColor || '-',
            vin: formData.vin || '-',
            expectedSalePrice: formData.expectedSalePrice === '' ? undefined : Number(formData.expectedSalePrice),
          }}
          onSelect={handlePriceSourceSelect}
        />
      )}
    </MainLayout>
  );
}
