import type { CampaignClaimRow } from '@car-stock/shared/types';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { MainLayout } from '../../components/layout';
import { exportMultiSheet } from '../../components/reports/exportUtils';
import { useToast } from '../../components/toast';
import { campaignService } from '../../services/campaign.service';
import { reportService } from '../../services/report.service';
import { vehicleService } from '../../services/vehicle.service';

const fmt = (n: number | null | undefined): string =>
  n == null || n === 0 ? '' : n.toLocaleString('th-TH', { minimumFractionDigits: 2 });

const fmtDate = (iso: string | null): string => (iso ? iso.split('T')[0] : '');

const pad2 = (n: number): string => String(n).padStart(2, '0');
const toDateInputValue = (d: Date): string => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

export function CampaignClaimReportPage(): React.ReactElement {
  const { addToast } = useToast();
  const now = new Date();
  const [startDate, setStartDate] = useState(() =>
    toDateInputValue(new Date(now.getFullYear(), now.getMonth(), 1))
  );
  const [endDate, setEndDate] = useState(() =>
    toDateInputValue(new Date(now.getFullYear(), now.getMonth() + 1, 0))
  );
  const [brand, setBrand] = useState('');
  const [campaignId, setCampaignId] = useState('');

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

  const { data: campaignsPage } = useQuery({
    queryKey: ['campaigns-for-claim-filter'],
    queryFn: () => campaignService.getAll({ limit: 200 }),
  });
  const campaignOptions = useMemo(() => {
    const list = campaignsPage?.data ?? [];
    return list.filter((c) => c.vehicleModels.some((vm) => vm.brand === brand));
  }, [campaignsPage, brand]);

  // Selecting a brand can drop the previously chosen campaign out of the
  // (brand-scoped) option list — reset back to "ทั้งหมด" rather than keep an
  // invalid, invisible selection.
  useEffect(() => {
    if (campaignId && !campaignOptions.some((c) => c.id === campaignId)) {
      setCampaignId('');
    }
  }, [campaignId, campaignOptions]);

  const validRange = startDate <= endDate;

  const { data, isLoading, error } = useQuery({
    queryKey: ['campaign-claims', startDate, endDate, brand, campaignId],
    queryFn: () =>
      reportService.getCampaignClaimReport({
        startDate,
        endDate,
        brand,
        campaignId: campaignId || undefined,
      }),
    enabled: !!brand && validRange,
  });

  const handleExportExcel = () => {
    if (!data) return;
    const toRow = (r: CampaignClaimRow) => {
      const base: Record<string, string | number> = {
        ลำดับ: r.no,
        'ชื่อ - สกุล': r.customerName,
        แบบรถ: r.modelName,
        เลขเครื่อง: r.engineNumber,
        เลขตัวรถ: r.vin,
        ไฟแนนท์: r.financeProvider,
        วันที่ขาย: fmtDate(r.saleDate),
        ราคาขาย: r.salePrice,
      };
      data.expenseColumns.forEach((name, j) => {
        base[name] = r.cells[j] ?? '';
      });
      base['รวม/คัน'] = r.total;
      base.วันที่แจ้งขาย = fmtDate(r.notifyDate);
      return base;
    };
    try {
      exportMultiSheet({
        sheets: [{ name: 'เบิกแคมเปญ', data: data.rows.map(toRow) }],
        filename: `campaign-claims_${brand}_${startDate}_to_${endDate}`,
      });
      addToast('ดาวน์โหลด Excel สำเร็จ', 'success');
    } catch {
      addToast('ดาวน์โหลด Excel ไม่สำเร็จ', 'error');
    }
  };

  const handleDownloadPdf = async () => {
    try {
      const blob = await reportService.getCampaignClaimReportPdf({
        startDate,
        endDate,
        brand,
        campaignId: campaignId || undefined,
      });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `campaign-claims-${brand}-${startDate}_to_${endDate}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      addToast('ดาวน์โหลด PDF สำเร็จ', 'success');
    } catch {
      addToast('ดาวน์โหลด PDF ไม่สำเร็จ', 'error');
    }
  };

  const expenseColumns = data?.expenseColumns ?? [];

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
              <label className="text-sm font-medium">วันที่เริ่ม:</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="border border-gray-300 rounded-md px-3 py-1.5 text-sm"
              />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium">ถึงวันที่:</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="border border-gray-300 rounded-md px-3 py-1.5 text-sm"
              />
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
              <label className="text-sm font-medium">แคมเปญ:</label>
              <select
                value={campaignId}
                onChange={(e) => setCampaignId(e.target.value)}
                className="border border-gray-300 rounded-md px-3 py-1.5 text-sm"
              >
                <option value="">ทั้งหมด</option>
                {campaignOptions.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
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

        {!validRange && (
          <div className="p-6 text-red-600">ช่วงวันที่ไม่ถูกต้อง: วันที่เริ่มต้องไม่เกินวันที่สิ้นสุด</div>
        )}
        {validRange && isLoading && <div className="p-6 animate-pulse">กำลังโหลด...</div>}
        {validRange && error != null && <div className="p-6 text-red-600">ไม่สามารถโหลดรายงานได้</div>}

        {validRange && data && (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
              <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
                <p className="text-sm text-blue-600 font-medium">จำนวนรถ</p>
                <p className="text-2xl font-bold text-blue-900">{data.summary.totalCars}</p>
              </div>
              <div className="bg-emerald-50 rounded-lg p-4 border border-emerald-200">
                <p className="text-sm text-emerald-600 font-medium">ยอดเบิกรวมทั้งสิ้น</p>
                <p className="text-2xl font-bold text-emerald-900">
                  {data.summary.grandTotal.toLocaleString('th-TH', { minimumFractionDigits: 2 })}
                </p>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-gray-50">
                  <tr>
                    {[
                      'ลำดับ',
                      'ชื่อ-สกุล',
                      'แบบรถ',
                      'เลขเครื่อง',
                      'เลขตัวรถ',
                      'ไฟแนนท์',
                      'วันที่ขาย',
                      'ราคาขาย',
                    ].map((h) => (
                      <th key={h} className="px-2 py-2 text-left font-medium whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                    {expenseColumns.map((h) => (
                      <th key={h} className="px-2 py-2 text-right font-medium whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                    <th className="px-2 py-2 text-right font-medium whitespace-nowrap">รวม/คัน</th>
                    <th className="px-2 py-2 text-left font-medium whitespace-nowrap">วันที่แจ้งขาย</th>
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
                      {r.cells.map((c, j) => (
                        <td key={expenseColumns[j]} className="px-2 py-1 text-right">
                          {fmt(c)}
                        </td>
                      ))}
                      <td className="px-2 py-1 text-right font-semibold">{fmt(r.total)}</td>
                      <td className="px-2 py-1">{fmtDate(r.notifyDate)}</td>
                    </tr>
                  ))}
                  {data.rows.length === 0 && (
                    <tr>
                      <td
                        colSpan={10 + expenseColumns.length}
                        className="px-2 py-6 text-center text-gray-500"
                      >
                        ไม่มีรายการเบิกแคมเปญในเดือนนี้
                      </td>
                    </tr>
                  )}
                  {data.rows.length > 0 && (
                    <tr className="bg-gray-50 font-semibold">
                      <td className="px-2 py-2" colSpan={8}>
                        รวมทั้งสิ้น ({data.summary.totalCars} คัน)
                      </td>
                      {data.summary.columnTotals.map((t, j) => (
                        <td key={expenseColumns[j]} className="px-2 py-2 text-right">
                          {fmt(t)}
                        </td>
                      ))}
                      <td className="px-2 py-2 text-right">{fmt(data.summary.grandTotal)}</td>
                      <td className="px-2 py-2" />
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-gray-500 mt-2">
              หมายเหตุ: คอลัมน์ค่าใช้จ่ายมาจากรายการที่ตั้งไว้ในแต่ละรุ่นของแคมเปญ; คันที่รุ่นไม่มีรายการนั้นจะเว้นว่าง
            </p>
          </>
        )}
      </div>
    </MainLayout>
  );
}
