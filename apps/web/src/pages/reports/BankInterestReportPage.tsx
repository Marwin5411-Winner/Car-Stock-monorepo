import { ArrowLeft } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MainLayout } from '../../components/layout';
import { exportMultiSheet, formatCurrency, formatDate } from '../../components/reports';
import { useToast } from '../../components/toast';
import {
  type BankInterestReportResponse,
  type BankInterestRow,
  reportService,
} from '../../services/report.service';

/** Add `days` days to a YYYY-MM-DD date string, returning a YYYY-MM-DD string. */
function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00`);
  if (Number.isNaN(d.getTime())) return date;
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

export function BankInterestReportPage(): React.ReactElement {
  const navigate = useNavigate();
  const { addToast } = useToast();

  const today = new Date();
  const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  const [startDate, setStartDate] = useState(firstDayOfMonth.toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(today.toISOString().split('T')[0]);
  // Optional payment due date for the PDF header — defaults to endDate + 1 day.
  const [dueDate, setDueDate] = useState('');

  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<BankInterestReportResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const effectiveDueDate = dueDate || addDays(endDate, 1);

  const fetchReport = async () => {
    if (!startDate || !endDate) {
      addToast('กรุณาเลือกช่วงวันที่', 'error');
      return;
    }
    try {
      setLoading(true);
      setError(null);
      const result = await reportService.getBankInterestReport({ startDate, endDate });
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'เกิดข้อผิดพลาดในการโหลดข้อมูล');
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadPdf = async () => {
    try {
      const blob = await reportService.downloadBankInterestReportPdf({
        startDate,
        endDate,
        dueDate: effectiveDueDate,
      });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `bank-interest-report-${startDate}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      addToast('ดาวน์โหลด PDF สำเร็จ', 'success');
    } catch {
      addToast('ดาวน์โหลด PDF ไม่สำเร็จ', 'error');
    }
  };

  const handleExportExcel = () => {
    if (!data) return;
    const toRow = (r: BankInterestRow, i: number): Record<string, unknown> => ({
      ลำดับ: i + 1,
      เลขสต็อก: r.stockNumber,
      'เลขตัวถัง (VIN)': r.vin,
      'รุ่น/สี': `${r.vehicleInfo} / ${r.exteriorColor}`,
      ยอดตั้งดอก: r.principalAmount,
      จาก: r.periodFrom.split('T')[0],
      ถึง: r.periodTo.split('T')[0],
      จำนวนวัน: r.days,
      'อัตรา %': r.rate,
      ดอกเบี้ย: r.interest,
    });
    try {
      exportMultiSheet({
        sheets: [{ name: 'ดอกเบี้ยธนาคาร', data: data.rows.map(toRow) }],
        filename: `bank-interest-report_${startDate}_${endDate}`,
      });
      addToast('ดาวน์โหลด Excel สำเร็จ', 'success');
    } catch {
      addToast('ดาวน์โหลด Excel ไม่สำเร็จ', 'error');
    }
  };

  return (
    <MainLayout>
      <div className="p-6">
        <div className="mb-6">
          <button
            type="button"
            onClick={() => navigate('/reports')}
            className="inline-flex items-center text-gray-700 hover:text-gray-900 mb-4"
          >
            <ArrowLeft className="w-5 h-5 mr-2" />
            กลับ
          </button>
          <h1 className="text-2xl font-bold text-gray-900">รายงานคำนวณดอกเบี้ยธนาคาร ต่องวด</h1>
          <p className="text-gray-600 mt-1">
            คำนวณดอกเบี้ยไฟแนนซ์รถในสต็อกต่องวด แบบเดียวกับใบแจ้งของธนาคาร
          </p>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-6 print-hide">
          <div className="flex flex-wrap items-end gap-4">
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium">จากวันที่</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="border border-gray-300 rounded-md px-3 py-1.5 text-sm"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium">ถึงวันที่</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="border border-gray-300 rounded-md px-3 py-1.5 text-sm"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium">วันครบกำหนดชำระ</label>
              <input
                type="date"
                value={dueDate}
                placeholder={effectiveDueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="border border-gray-300 rounded-md px-3 py-1.5 text-sm"
              />
            </div>
            <button
              type="button"
              onClick={fetchReport}
              disabled={loading}
              className="bg-blue-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? 'กำลังโหลด...' : 'แสดงรายงาน'}
            </button>
            <button
              type="button"
              onClick={handleExportExcel}
              disabled={!data}
              className="bg-green-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-green-700 disabled:opacity-50"
            >
              ดาวน์โหลด Excel
            </button>
            <button
              type="button"
              onClick={handleDownloadPdf}
              disabled={!data}
              className="bg-red-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-red-700 disabled:opacity-50"
            >
              ดาวน์โหลด PDF
            </button>
          </div>
        </div>

        {loading && !data && <div className="p-6 animate-pulse">กำลังโหลด...</div>}
        {error != null && <div className="p-6 text-red-600">{error}</div>}

        {data && (
          <>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
                <p className="text-sm text-blue-600 font-medium">จำนวนรถ</p>
                <p className="text-2xl font-bold text-blue-900">{data.summary.vehicleCount}</p>
              </div>
              <div className="bg-indigo-50 rounded-lg p-4 border border-indigo-200">
                <p className="text-sm text-indigo-600 font-medium">จำนวนรายการ</p>
                <p className="text-2xl font-bold text-indigo-900">{data.summary.rowCount}</p>
              </div>
              <div className="bg-amber-50 rounded-lg p-4 border border-amber-200">
                <p className="text-sm text-amber-600 font-medium">รวมดอกเบี้ย (บาท)</p>
                <p className="text-2xl font-bold text-amber-900">
                  {formatCurrency(data.summary.totalInterest)}
                </p>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-gray-50">
                  <tr>
                    {[
                      'ลำดับ',
                      'เลขสต็อก',
                      'เลขตัวถัง (VIN)',
                      'รุ่น/สี',
                      'ยอดตั้งดอก',
                      'ช่วง (จาก–ถึง)',
                      'จำนวนวัน',
                      'อัตรา %',
                      'ดอกเบี้ย',
                    ].map((h) => (
                      <th key={h} className="px-2 py-2 text-left font-medium whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {data.rows.map((r, i) => (
                    <tr key={`${r.stockId}-${i}`} className="hover:bg-gray-50">
                      <td className="px-2 py-1">{i + 1}</td>
                      <td className="px-2 py-1 font-mono">{r.stockNumber}</td>
                      <td className="px-2 py-1 font-mono">{r.vin}</td>
                      <td className="px-2 py-1">
                        {r.vehicleInfo} / {r.exteriorColor}
                      </td>
                      <td className="px-2 py-1 text-right tabular-nums">
                        {formatCurrency(r.principalAmount)}
                      </td>
                      <td className="px-2 py-1 whitespace-nowrap">
                        {formatDate(r.periodFrom)} – {formatDate(r.periodTo)}
                      </td>
                      <td className="px-2 py-1 text-right tabular-nums">{r.days}</td>
                      <td className="px-2 py-1 text-right tabular-nums">{r.rate.toFixed(2)}</td>
                      <td className="px-2 py-1 text-right tabular-nums font-semibold">
                        {formatCurrency(r.interest)}
                      </td>
                    </tr>
                  ))}
                  {data.rows.length === 0 && (
                    <tr>
                      <td colSpan={9} className="px-2 py-6 text-center text-gray-500">
                        ไม่มีรายการดอกเบี้ยในช่วงรอบบิลนี้
                      </td>
                    </tr>
                  )}
                </tbody>
                {data.rows.length > 0 && (
                  <tfoot>
                    <tr className="bg-gray-100 border-t-2 border-gray-400">
                      <td colSpan={8} className="px-2 py-2 text-right font-bold text-gray-900">
                        รวมดอกเบี้ยทั้งสิ้น
                      </td>
                      <td className="px-2 py-2 text-right font-bold text-gray-900 tabular-nums">
                        {formatCurrency(data.summary.totalInterest)}
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </>
        )}
      </div>
    </MainLayout>
  );
}
