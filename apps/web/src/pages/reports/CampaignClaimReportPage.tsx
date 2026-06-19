import type { CampaignClaimRow } from '@car-stock/shared/types';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { MainLayout } from '../../components/layout';
import { exportMultiSheet } from '../../components/reports/exportUtils';
import { useToast } from '../../components/toast';
import { reportService } from '../../services/report.service';
import { vehicleService } from '../../services/vehicle.service';

const MONTH_NAMES_TH = [
  'มกราคม',
  'กุมภาพันธ์',
  'มีนาคม',
  'เมษายน',
  'พฤษภาคม',
  'มิถุนายน',
  'กรกฎาคม',
  'สิงหาคม',
  'กันยายน',
  'ตุลาคม',
  'พฤศจิกายน',
  'ธันวาคม',
];

// เป้าขาย (Retail Sales) tiers — fraction of DNP.
const TIER_OPTIONS = [
  { value: 0.005, label: '0.5%' },
  { value: 0.01, label: '1.0%' },
  { value: 0.015, label: '1.5%' },
];

const fmt = (n: number | null | undefined): string =>
  n == null || n === 0 ? '' : n.toLocaleString('th-TH', { minimumFractionDigits: 2 });

const fmtDate = (iso: string | null): string => (iso ? iso.split('T')[0] : '');

export function CampaignClaimReportPage(): React.ReactElement {
  const { addToast } = useToast();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [brand, setBrand] = useState('');
  const [tier, setTier] = useState(0.01); // เป้าขาย tier (default 1.0%)
  const [constructionCost, setConstructionCost] = useState(0); // ค่าก่อสร้าง รายเดือน (กรอกเอง)

  // Distinct brands from vehicle models.
  const { data: vehiclePage } = useQuery({
    queryKey: ['vehicle-models-for-brands'],
    queryFn: () => vehicleService.getAll({ limit: 200 }),
  });
  const brands = useMemo(() => {
    const list = vehiclePage?.data?.map((v) => v.brand) ?? [];
    return [...new Set(list)].sort();
  }, [vehiclePage]);

  useEffect(() => {
    if (!brand && brands.length > 0) setBrand(brands[0]);
  }, [brand, brands]);

  const { data, isLoading, error } = useQuery({
    queryKey: ['campaign-claims', year, month, brand, tier],
    queryFn: () => reportService.getCampaignClaimReport({ year, month, brand, tier }),
    enabled: !!brand,
  });

  const grandWithConstruction = (data?.summary.subsidyTotals.total ?? 0) + constructionCost;

  const handleExportExcel = () => {
    if (!data) return;
    const toRow = (r: CampaignClaimRow) => ({
      ลำดับ: r.no,
      'ชื่อ - สกุล': r.customerName,
      แบบรถ: r.modelName,
      เลขเครื่อง: r.engineNumber,
      เลขตัวรถ: r.vin,
      ไฟแนนท์: r.financeProvider,
      วันที่ขาย: fmtDate(r.saleDate),
      ราคาขาย: r.salePrice,
      ส่วนลดการขาย: r.promotionDiscount,
      'STOCK LEVEL (MSRP) 0.5%': r.subsidies.stockLevel,
      'After Sales ไม่ร้องเรียน 0.25%': r.subsidies.afterSalesNoComplaint,
      'After Sales Google QR 0.25%': r.subsidies.afterSalesQr,
      'การตลาด MARKETING (DNP) 1%': r.subsidies.marketing,
      'วันที่รับเงิน (MARKETING)': '',
      'FLEET, TEST': '',
      'วันที่รับเงิน (FLEET)': '',
      เป้าขาย: r.subsidies.retailTarget,
      ค่าก่อสร้าง: '',
      รวมรับเงิน: r.subsidies.total,
      วันที่แจ้งขาย: fmtDate(r.notifyDate),
      'ค่าใช้จ่ายในการซื้อ/แลกรถ': '',
    });
    try {
      exportMultiSheet({
        sheets: [{ name: 'เบิกแคมเปญ', data: data.rows.map(toRow) }],
        filename: `campaign-claims_${brand}_${year}-${String(month).padStart(2, '0')}`,
      });
      addToast('ดาวน์โหลด Excel สำเร็จ', 'success');
    } catch {
      addToast('ดาวน์โหลด Excel ไม่สำเร็จ', 'error');
    }
  };

  const handleDownloadPdf = async () => {
    try {
      const blob = await reportService.getCampaignClaimReportPdf({
        year,
        month,
        brand,
        tier,
        constructionCost,
      });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `campaign-claims-${brand}-${year}-${String(month).padStart(2, '0')}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      addToast('ดาวน์โหลด PDF สำเร็จ', 'success');
    } catch {
      addToast('ดาวน์โหลด PDF ไม่สำเร็จ', 'error');
    }
  };

  const headers = [
    'ลำดับ',
    'ชื่อ-สกุล',
    'แบบรถ',
    'เลขเครื่อง',
    'เลขตัวรถ',
    'ไฟแนนท์',
    'วันที่ขาย',
    'ราคาขาย',
    'ส่วนลดการขาย',
    'STOCK LEVEL 0.5%',
    'After Sales ไม่ร้องเรียน',
    'After Sales QR',
    'MARKETING 1%',
    'เป้าขาย',
    'รวมรับเงิน',
    'วันที่แจ้งขาย',
  ];

  return (
    <MainLayout>
      <div className="p-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">
            รายงานเบิกแคมเปญเงินส่งเสริมการขายประจำเดือน
          </h1>
          <p className="text-gray-600 mt-1">รายการเบิกเงินส่งเสริมการขายสำหรับส่งบริษัทรถ (Brand)</p>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-6 print-hide">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium">ปี:</label>
              <input
                type="number"
                value={year}
                onChange={(e) => setYear(Number(e.target.value))}
                className="border border-gray-300 rounded-md px-3 py-1.5 text-sm w-24"
                min={2000}
                max={3000}
              />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium">เดือน:</label>
              <select
                value={month}
                onChange={(e) => setMonth(Number(e.target.value))}
                className="border border-gray-300 rounded-md px-3 py-1.5 text-sm"
              >
                {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                  <option key={m} value={m}>
                    {MONTH_NAMES_TH[m - 1]}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium">ยี่ห้อ:</label>
              <select
                value={brand}
                onChange={(e) => setBrand(e.target.value)}
                className="border border-gray-300 rounded-md px-3 py-1.5 text-sm"
              >
                {brands.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium">เป้าขาย (tier):</label>
              <select
                value={tier}
                onChange={(e) => setTier(Number(e.target.value))}
                className="border border-gray-300 rounded-md px-3 py-1.5 text-sm"
              >
                {TIER_OPTIONS.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label} DNP
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium">ค่าก่อสร้าง (เดือน):</label>
              <input
                type="number"
                value={constructionCost}
                onChange={(e) => setConstructionCost(Number(e.target.value) || 0)}
                className="border border-gray-300 rounded-md px-3 py-1.5 text-sm w-32"
                min={0}
                placeholder="0"
              />
            </div>
            <button
              type="button"
              onClick={handleExportExcel}
              className="bg-green-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-green-700"
            >
              ดาวน์โหลด Excel
            </button>
            <button
              type="button"
              onClick={handleDownloadPdf}
              className="bg-red-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-red-700"
            >
              ดาวน์โหลด PDF
            </button>
          </div>
        </div>

        {isLoading && <div className="p-6 animate-pulse">กำลังโหลด...</div>}
        {error != null && <div className="p-6 text-red-600">ไม่สามารถโหลดรายงานได้</div>}

        {data && (
          <>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
                <p className="text-sm text-blue-600 font-medium">จำนวนรถ</p>
                <p className="text-2xl font-bold text-blue-900">{data.summary.totalCars}</p>
              </div>
              <div className="bg-amber-50 rounded-lg p-4 border border-amber-200">
                <p className="text-sm text-amber-600 font-medium">รวมรับเงิน (subsidy)</p>
                <p className="text-2xl font-bold text-amber-900">
                  {data.summary.subsidyTotals.total.toLocaleString('th-TH', {
                    minimumFractionDigits: 2,
                  })}
                </p>
              </div>
              <div className="bg-emerald-50 rounded-lg p-4 border border-emerald-200">
                <p className="text-sm text-emerald-600 font-medium">ยอดเบิกรวม (รวมค่าก่อสร้าง)</p>
                <p className="text-2xl font-bold text-emerald-900">
                  {grandWithConstruction.toLocaleString('th-TH', { minimumFractionDigits: 2 })}
                </p>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-gray-50">
                  <tr>
                    {headers.map((h) => (
                      <th key={h} className="px-2 py-2 text-left font-medium whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {data.rows.map((r) => (
                    <tr key={r.saleId} className="hover:bg-gray-50">
                      <td className="px-2 py-1">{r.no}</td>
                      <td className="px-2 py-1">{r.customerName}</td>
                      <td className="px-2 py-1">{r.modelName}</td>
                      <td className="px-2 py-1 font-mono">{r.engineNumber}</td>
                      <td className="px-2 py-1 font-mono">{r.vin}</td>
                      <td className="px-2 py-1">{r.financeProvider}</td>
                      <td className="px-2 py-1">{fmtDate(r.saleDate)}</td>
                      <td className="px-2 py-1 text-right">{fmt(r.salePrice)}</td>
                      <td className="px-2 py-1 text-right">{fmt(r.promotionDiscount)}</td>
                      <td className="px-2 py-1 text-right">{fmt(r.subsidies.stockLevel)}</td>
                      <td className="px-2 py-1 text-right">
                        {fmt(r.subsidies.afterSalesNoComplaint)}
                      </td>
                      <td className="px-2 py-1 text-right">{fmt(r.subsidies.afterSalesQr)}</td>
                      <td className="px-2 py-1 text-right">{fmt(r.subsidies.marketing)}</td>
                      <td className="px-2 py-1 text-right">{fmt(r.subsidies.retailTarget)}</td>
                      <td className="px-2 py-1 text-right font-semibold">
                        {fmt(r.subsidies.total)}
                      </td>
                      <td className="px-2 py-1">{fmtDate(r.notifyDate)}</td>
                    </tr>
                  ))}
                  {data.rows.length === 0 && (
                    <tr>
                      <td colSpan={headers.length} className="px-2 py-6 text-center text-gray-500">
                        ไม่มีรายการเบิกแคมเปญในเดือนนี้
                      </td>
                    </tr>
                  )}
                  {data.rows.length > 0 && (
                    <tr className="bg-gray-50 font-semibold">
                      <td className="px-2 py-2" colSpan={9}>
                        รวมทั้งสิ้น ({data.summary.totalCars} คัน)
                      </td>
                      <td className="px-2 py-2 text-right">
                        {fmt(data.summary.subsidyTotals.stockLevel)}
                      </td>
                      <td className="px-2 py-2 text-right">
                        {fmt(data.summary.subsidyTotals.afterSalesNoComplaint)}
                      </td>
                      <td className="px-2 py-2 text-right">
                        {fmt(data.summary.subsidyTotals.afterSalesQr)}
                      </td>
                      <td className="px-2 py-2 text-right">
                        {fmt(data.summary.subsidyTotals.marketing)}
                      </td>
                      <td className="px-2 py-2 text-right">
                        {fmt(data.summary.subsidyTotals.retailTarget)}
                      </td>
                      <td className="px-2 py-2 text-right">
                        {fmt(data.summary.subsidyTotals.total)}
                      </td>
                      <td className="px-2 py-2" />
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-gray-500 mt-2">
              หมายเหตุ: FLEET/TEST, วันที่รับเงิน, ค่าก่อสร้าง (รายคัน) และค่าใช้จ่ายในการซื้อ/แลกรถ
              เป็นช่องกรอกมือในไฟล์ PDF สำหรับยื่นเบิก
            </p>
          </>
        )}
      </div>
    </MainLayout>
  );
}
