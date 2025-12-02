import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { stockService } from '../../services/stock.service';
import type { Stock } from '../../services/stock.service';
import { vehicleService } from '../../services/vehicle.service';
import { MainLayout } from '../../components/layout';
import { ArrowLeft } from 'lucide-react';

export default function StockFormPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isEdit = !!id;

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [vehicleSearchTerm, setVehicleSearchTerm] = useState('');
  const [showVehicleDropdown, setShowVehicleDropdown] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);

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
    status: 'AVAILABLE' as 'AVAILABLE' | 'RESERVED' | 'PREPARING' | 'SOLD',
    baseCost: 0,
    transportCost: 0,
    accessoryCost: 0,
    otherCosts: 0,
    financeProvider: '',
    interestRate: 0,
    interestPrincipalBase: 'TOTAL_COST' as 'BASE_COST_ONLY' | 'TOTAL_COST',
    expectedSalePrice: undefined as number | undefined,
    notes: '',
  });

  useEffect(() => {
    fetchVehicles();
    if (isEdit && id) {
      fetchStock(id);
    }
  }, [id, isEdit]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (target && !target.closest('#vehicle-model-dropdown')) {
        setShowVehicleDropdown(false);
        setVehicleSearchTerm('');
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const fetchVehicles = async () => {
    try {
      const response = await vehicleService.getAll({ limit: 100 });
      setVehicles(response.data);
    } catch (error) {
      console.error('Error fetching vehicles:', error);
    }
  };

  const fetchStock = async (stockId: string) => {
    try {
      setLoading(true);
      const stock = await stockService.getById(stockId);
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
        interestRate: Number(stock.interestRate),
        interestPrincipalBase: stock.interestPrincipalBase,
        expectedSalePrice: stock.expectedSalePrice ? Number(stock.expectedSalePrice) : undefined,
        notes: stock.notes || '',
      });
    } catch (error) {
      console.error('Error fetching stock:', error);
      alert('ไม่สามารถโหลดข้อมูล Stock ได้');
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: name === 'expectedSalePrice'
        ? (value === '' ? undefined : Number(value))
        : ['baseCost', 'transportCost', 'accessoryCost', 'otherCosts', 'interestRate'].includes(name)
        ? Number(value)
        : value,
    }));
  };

  const handleVehicleSearch = (value: string) => {
    setVehicleSearchTerm(value);
    setShowVehicleDropdown(true);
    setHighlightedIndex(0);
  };

  const handleSelectVehicle = (vehicleId: string) => {
    setFormData((prev) => ({
      ...prev,
      vehicleModelId: vehicleId,
    }));
    setVehicleSearchTerm('');
    setShowVehicleDropdown(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showVehicleDropdown) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex((prev) => Math.min(prev + 1, filteredVehicles.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex((prev) => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (highlightedIndex >= 0 && highlightedIndex < filteredVehicles.length) {
        handleSelectVehicle(filteredVehicles[highlightedIndex].id);
      }
    } else if (e.key === 'Escape') {
      setShowVehicleDropdown(false);
      setVehicleSearchTerm('');
    }
  };

  const filteredVehicles = vehicles.filter((vehicle) =>
    `${vehicle.brand} ${vehicle.model} ${vehicle.variant || ''} ${vehicle.year}`
      .toLowerCase()
      .includes(vehicleSearchTerm.toLowerCase())
  );

  const highlightText = (text: string, searchTerm: string) => {
    if (!searchTerm) return text;
    const regex = new RegExp(`(${searchTerm})`, 'gi');
    const parts = text.split(regex);
    return parts.map((part, index) =>
      regex.test(part) ? (
        <mark key={index} className="bg-yellow-200 px-1 rounded">
          {part}
        </mark>
      ) : (
        part
      )
    );
  };

  const selectedVehicle = vehicles.find((v) => v.id === formData.vehicleModelId);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    try {
      const data = {
        ...formData,
        orderDate: formData.orderDate ? new Date(formData.orderDate) : undefined,
        arrivalDate: new Date(formData.arrivalDate),
      };

      console.log('Sending data:', data);
      console.log('Data types:', {
        baseCost: typeof data.baseCost,
        transportCost: typeof data.transportCost,
        accessoryCost: typeof data.accessoryCost,
        otherCosts: typeof data.otherCosts,
        interestRate: typeof data.interestRate,
        expectedSalePrice: typeof data.expectedSalePrice,
      });

      if (isEdit && id) {
        await stockService.update(id, data);
        alert('อัปเดตข้อมูล Stock สำเร็จ');
      } else {
        await stockService.create(data);
        alert('เพิ่ม Stock ใหม่สำเร็จ');
      }
      navigate('/stock');
    } catch (error) {
      console.error('Error saving stock:', error);
      alert('ไม่สามารถบันทึกข้อมูล Stock ได้');
    } finally {
      setSaving(false);
    }
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
                <label htmlFor="vehicleModelId" className="block text-sm font-medium text-gray-700">
                  รุ่นรถ <span className="text-red-500">*</span>
                </label>
                <div id="vehicle-model-dropdown" className="relative">
                  <input
                    type="text"
                    value={
                      vehicleSearchTerm
                        ? vehicleSearchTerm
                        : selectedVehicle
                        ? `${selectedVehicle.brand} ${selectedVehicle.model} ${selectedVehicle.variant || ''} (${selectedVehicle.year})`
                        : ''
                    }
                    onChange={(e) => handleVehicleSearch(e.target.value)}
                    onFocus={() => setShowVehicleDropdown(true)}
                    onKeyDown={handleKeyDown}
                    placeholder="ค้นหาหรือเลือกรุ่นรถ..."
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900"
                    required
                  />
                  {showVehicleDropdown && (
                    <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-auto">
                      {filteredVehicles.length > 0 ? (
                        filteredVehicles.map((vehicle, index) => (
                          <div
                            key={vehicle.id}
                            onClick={() => handleSelectVehicle(vehicle.id)}
                            className={`px-3 py-2 cursor-pointer border-b border-gray-100 last:border-b-0 ${
                              index === highlightedIndex ? 'bg-blue-100 font-medium' : 'hover:bg-blue-50'
                            }`}
                          >
                            <div className="text-gray-900">
                              {highlightText(
                                `${vehicle.brand} ${vehicle.model} ${vehicle.variant || ''} (${vehicle.year})`,
                                vehicleSearchTerm
                              )}
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="px-3 py-2 text-gray-500">ไม่พบข้อมูล</div>
                      )}
                    </div>
                  )}
                </div>
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
                  onChange={handleChange}
                  placeholder="JTMHU09J704567123"
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900"
                />
                <p className="text-xs text-gray-500 mt-1">กรอกหมายเลข VIN หรือเลขตัวถัง</p>
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
                  onChange={handleChange}
                  placeholder="1GD-FTV-0123456"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900"
                />
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
    </MainLayout>
  );
}
