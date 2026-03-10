import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { MainLayout } from '../../components/layout';
import { ArrowLeft, FileText } from 'lucide-react';
import { reportService } from '../../services/report.service';
import {
  DateRangeFilter,
  ExportButton,
  PrintButton,
  formatCurrency,
  formatDate,
} from '../../components/reports';
import type { DailyPaymentReportResponse, DailyPaymentItem } from '@car-stock/shared/types';

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  CASH: 'เงินสด',
  BANK_TRANSFER: 'เงินโอน',
  CHEQUE: 'เช็ค',
  CREDIT_CARD: 'บัตรเครดิต',
};

const METHOD_COLORS: Record<string, string> = {
  CASH: 'text-green-700 bg-green-50',
  BANK_TRANSFER: 'text-blue-700 bg-blue-50',
  CHEQUE: 'text-purple-700 bg-purple-50',
  CREDIT_CARD: 'text-orange-700 bg-orange-50',
};

/** Format a number with Thai conventions: 2 decimals, comma grouping. Returns empty string for 0/null. */
function fmtAmount(val: number | null | undefined): string {
  if (!val) return '';
  return val.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Group payments by date string (YYYY-MM-DD) */
function groupByDate(payments: DailyPaymentItem[]) {
  const groups: Map<string, DailyPaymentItem[]> = new Map();
  for (const p of payments) {
    const dateKey = p.paymentDate.split('T')[0];
    if (!groups.has(dateKey)) groups.set(dateKey, []);
    groups.get(dateKey)!.push(p);
  }
  // Sort by date ascending
  return new Map([...groups.entries()].sort(([a], [b]) => a.localeCompare(b)));
}

export default function DailyPaymentReportPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<DailyPaymentReportResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const today = new Date();
  const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  const [startDate, setStartDate] = useState(firstDayOfMonth.toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(today.toISOString().split('T')[0]);

  const fetchReport = async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await reportService.getDailyPaymentReport({ startDate, endDate });
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'เกิดข้อผิดพลาดในการโหลดข้อมูล');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReport();
  }, []);

  const grouped = useMemo(() => {
    if (!data) return new Map<string, DailyPaymentItem[]>();
    return groupByDate(data.payments);
  }, [data]);

  const exportHeaders = [
    { key: 'receiptNumber', label: 'เลขที่ใบเสร็จ' },
    { key: 'paymentDate', label: 'วันที่' },
    { key: 'customerName', label: 'ชื่อลูกค้า' },
    { key: 'customerCode', label: 'รหัสลูกค้า' },
    { key: 'paymentTypeLabel', label: 'ประเภท' },
    { key: 'paymentMethodLabel', label: 'วิธีชำระ' },
    { key: 'amount', label: 'จำนวนเงิน' },
    { key: 'saleNumber', label: 'เลขที่การขาย' },
    { key: 'notes', label: 'หมายเหตุ' },
  ];

  const handleExportPdf = async () => {
    try {
      setLoading(true);
      const blob = await reportService.getDailyPaymentReportPdf({ startDate, endDate });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `daily-payment-report-${startDate}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'เกิดข้อผิดพลาดในการสร้าง PDF');
    } finally {
      setLoading(false);
    }
  };

  return (
    <MainLayout>
      {/* Print-specific styles */}
      <style>{`
        @media print {
          /* Hide non-printable elements */
          .no-print { display: none !important; }
          /* Repeat table headers on every page */
          thead { display: table-header-group; }
          tfoot { display: table-footer-group; }
          /* Page setup */
          @page {
            size: A4 landscape;
            margin: 15mm;
          }
          body { font-family: 'Sarabun', sans-serif; font-size: 10pt; }
          /* Remove shadows and borders for clean print */
          .print-clean { box-shadow: none !important; border: none !important; }
        }
      `}</style>

      <div className="mb-6 no-print">
        <button
          onClick={() => navigate('/reports')}
          className="inline-flex items-center text-gray-700 hover:text-gray-900 mb-4"
        >
          <ArrowLeft className="w-5 h-5 mr-2" />
          กลับ
        </button>
        <h1 className="text-2xl font-bold text-gray-900">รายการรับเงินประจำวัน</h1>
        <p className="text-gray-600 mt-1">รายงานการรับชำระเงินแยกตามวันที่และวิธีการชำระ</p>
      </div>

      {/* Date Filter */}
      <div className="mb-6 no-print">
        <DateRangeFilter
          startDate={startDate}
          endDate={endDate}
          onStartDateChange={setStartDate}
          onEndDateChange={setEndDate}
          onApply={fetchReport}
          loading={loading}
        />
      </div>

      {/* Actions */}
      <div className="flex gap-3 mb-6 no-print">
        <ExportButton
          data={data?.payments || []}
          filename="รายการรับเงินประจำวัน"
          sheetName="รายการรับเงิน"
          headers={exportHeaders}
          loading={loading}
        />
        <button
          onClick={handleExportPdf}
          disabled={loading || !data}
          className="inline-flex items-center px-4 py-2 border border-blue-200 rounded-lg text-sm font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 disabled:opacity-50"
        >
          <FileText className="w-4 h-4 mr-2" />
          ส่งออก PDF
        </button>
        <PrintButton title="รายการรับเงินประจำวัน" contentId="report-content" />
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6">
          {error}
        </div>
      )}

      <div id="report-content">
        {data && (
          <>
            {/* Method Breakdown Summary */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden mb-6 print-clean">
              <div className="px-6 py-4 border-b bg-gray-50">
                <h3 className="text-base font-semibold text-gray-900">สรุปยอดรับเงินแยกตามวิธีชำระ</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        วิธีชำระ
                      </th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        จำนวนรายการ
                      </th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        ยอดเงิน (บาท)
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {['CASH', 'BANK_TRANSFER', 'CHEQUE', 'CREDIT_CARD'].map((method) => {
                      const found = data.summary.byMethod.find((m) => m.method === method);
                      const count = found?.count || 0;
                      const amount = found?.amount || 0;
                      return (
                        <tr key={method} className={amount > 0 ? '' : 'opacity-40'}>
                          <td className="px-6 py-3 text-sm">
                            <span
                              className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${METHOD_COLORS[method] || 'text-gray-700 bg-gray-100'}`}
                            >
                              {PAYMENT_METHOD_LABELS[method] || method}
                            </span>
                          </td>
                          <td className="px-6 py-3 text-sm text-right text-gray-700">
                            {count} รายการ
                          </td>
                          <td className="px-6 py-3 text-sm text-right font-medium">
                            {formatCurrency(amount)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot className="bg-gray-50 border-t-2 border-gray-300">
                    <tr>
                      <td className="px-6 py-3 text-sm font-bold text-gray-900">ยอดรวมทั้งหมด</td>
                      <td className="px-6 py-3 text-sm text-right font-bold text-gray-900">
                        {data.summary.totalCount} รายการ
                      </td>
                      <td className="px-6 py-3 text-sm text-right font-bold text-gray-900">
                        {formatCurrency(data.summary.totalAmount)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            {/* Grouped Detail Table — Professional Accounting Style */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden print-clean">
              <div className="px-6 py-4 border-b bg-gray-50">
                <h3 className="text-base font-semibold text-gray-900">รายละเอียดการรับเงิน</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-gray-50 border-b-2 border-gray-300">
                    <tr>
                      <th className="px-4 py-3 text-left font-semibold text-gray-700 whitespace-nowrap">
                        เลขที่ใบเสร็จ
                      </th>
                      <th className="px-4 py-3 text-left font-semibold text-gray-700 whitespace-nowrap">
                        ลูกค้า
                      </th>
                      <th className="px-4 py-3 text-left font-semibold text-gray-700 whitespace-nowrap">
                        รหัส
                      </th>
                      <th className="px-4 py-3 text-left font-semibold text-gray-700 whitespace-nowrap">
                        ประเภท
                      </th>
                      <th className="px-4 py-3 text-left font-semibold text-gray-700 whitespace-nowrap">
                        วิธีชำระ
                      </th>
                      <th className="px-4 py-3 text-right font-semibold text-gray-700 whitespace-nowrap">
                        จำนวนเงิน
                      </th>
                      <th className="px-4 py-3 text-left font-semibold text-gray-700 whitespace-nowrap">
                        เลขที่ขาย
                      </th>
                      <th className="px-4 py-3 text-left font-semibold text-gray-700 whitespace-nowrap">
                        หมายเหตุ
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {grouped.size === 0 && (
                      <tr>
                        <td colSpan={8} className="px-4 py-12 text-center text-gray-500">
                          ไม่พบรายการรับเงินในช่วงเวลาที่เลือก
                        </td>
                      </tr>
                    )}
                    {[...grouped.entries()].map(([dateKey, payments]) => {
                      const dailyTotal = payments.reduce((sum, p) => sum + p.amount, 0);
                      return (
                        <GroupRows
                          key={dateKey}
                          dateKey={dateKey}
                          payments={payments}
                          dailyTotal={dailyTotal}
                        />
                      );
                    })}
                  </tbody>
                  {data.payments.length > 0 && (
                    <tfoot>
                      <tr className="border-t-2 border-gray-800 bg-gray-50">
                        <td
                          colSpan={5}
                          className="px-4 py-3 text-right font-bold text-gray-900 text-sm"
                        >
                          รวมทั้งสิ้น
                        </td>
                        <td className="px-4 py-3 text-right font-bold text-gray-900 text-sm border-t-2 border-b-4 border-double border-gray-800">
                          {fmtAmount(data.summary.totalAmount)}
                        </td>
                        <td colSpan={2}></td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </div>
          </>
        )}

        {loading && !data && (
          <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <p className="mt-2 text-gray-700">กำลังโหลดข้อมูล...</p>
          </div>
        )}
      </div>
    </MainLayout>
  );
}

/** Renders a date group: header row, item rows, and subtotal row */
function GroupRows({
  dateKey,
  payments,
  dailyTotal,
}: {
  dateKey: string;
  payments: DailyPaymentItem[];
  dailyTotal: number;
}) {
  return (
    <>
      {/* Date group header */}
      <tr className="bg-blue-50 border-t border-gray-300">
        <td colSpan={8} className="px-4 py-2 font-semibold text-blue-800 text-sm">
          {formatDate(dateKey)} ({payments.length} รายการ)
        </td>
      </tr>
      {/* Item rows */}
      {payments.map((p) => (
        <tr key={p.id} className="border-b border-gray-100 hover:bg-gray-50">
          <td className="px-4 py-2 text-gray-900 whitespace-nowrap">{p.receiptNumber}</td>
          <td className="px-4 py-2 text-gray-900">{p.customerName}</td>
          <td className="px-4 py-2 text-gray-500 whitespace-nowrap">{p.customerCode}</td>
          <td className="px-4 py-2 text-gray-700 whitespace-nowrap">{p.paymentTypeLabel}</td>
          <td className="px-4 py-2 text-gray-700 whitespace-nowrap">{p.paymentMethodLabel}</td>
          <td className="px-4 py-2 text-right text-gray-900 font-medium tabular-nums whitespace-nowrap">
            {fmtAmount(p.amount)}
          </td>
          <td className="px-4 py-2 text-gray-500 whitespace-nowrap">{p.saleNumber || ''}</td>
          <td className="px-4 py-2 text-gray-500 max-w-[200px] truncate">{p.notes || ''}</td>
        </tr>
      ))}
      {/* Daily subtotal */}
      <tr className="bg-gray-50 border-b-2 border-gray-300">
        <td colSpan={5} className="px-4 py-2 text-right font-semibold text-gray-700 text-sm">
          รวมประจำวัน
        </td>
        <td className="px-4 py-2 text-right font-semibold text-gray-900 text-sm border-t border-gray-400 tabular-nums">
          {fmtAmount(dailyTotal)}
        </td>
        <td colSpan={2}></td>
      </tr>
    </>
  );
}
