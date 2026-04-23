import type { DailyPaymentItem, DailyPaymentReportResponse } from '@car-stock/shared/types';
import { ArrowLeft, FileText } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MainLayout } from '../../components/layout';
import {
  DateRangeFilter,
  ExportButton,
  PrintButton,
  formatCurrency,
  formatDate,
} from '../../components/reports';
import { reportService } from '../../services/report.service';

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
  if (val == null) return '';
  if (val === 0) return '';
  return val.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Sum payment amounts by method bucket — CASH → cash column; all other methods → transfer column. */
function splitByMethod(payments: DailyPaymentItem[]) {
  let cash = 0;
  let transfer = 0;
  for (const p of payments) {
    if (p.paymentMethod === 'CASH') cash += p.amount;
    else transfer += p.amount;
  }
  return { cash, transfer };
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

  const exportHeaders = [
    { key: 'paymentDate', label: 'วันที่เอกสาร' },
    { key: 'receiptNumber', label: 'เลขที่เอกสาร' },
    { key: 'invoiceNumber', label: 'เลขที่ใบกำกับ' },
    { key: 'customerName', label: 'ชื่อลูกค้า' },
    { key: 'description', label: 'รายการ' },
    { key: 'amount', label: 'รวมทั้งสิ้น' },
    { key: 'cashAmount', label: 'เงินสด' },
    { key: 'transferAmount', label: 'เงินโอน' },
    { key: 'issuedBy', label: 'ผู้รับ' },
    { key: 'notes', label: 'หมายเหตุ' },
  ];

  const exportRows = (data?.payments ?? []).map((p) => ({
    ...p,
    invoiceNumber: p.receiptNumber,
    cashAmount: p.paymentMethod === 'CASH' ? p.amount : '',
    transferAmount: p.paymentMethod !== 'CASH' ? p.amount : '',
  }));

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

  const payments = data?.payments ?? [];
  const totals = splitByMethod(payments);
  const totalCount = payments.length;
  const totalAmount = data?.summary.totalAmount ?? 0;

  return (
    <MainLayout>
      {/* Print-specific styles */}
      <style>{`
        @media print {
          .no-print { display: none !important; }
          thead { display: table-header-group; }
          tfoot { display: table-footer-group; }
          @page { size: A4 landscape; margin: 12mm; }
          body { font-family: 'Sarabun', sans-serif; font-size: 9pt; }
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
          data={exportRows}
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
            {/* Detail Table — matches reference image */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden print-clean">
              <div className="px-6 py-3 border-b bg-gray-50">
                <h3 className="text-sm font-semibold text-gray-900">รายละเอียดการรับเงิน</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full text-xs">
                  <thead className="bg-gray-50 border-b-2 border-gray-400">
                    <tr>
                      <th className="px-2 py-2 text-left font-semibold text-gray-700 whitespace-nowrap">
                        วันที่เอกสาร
                      </th>
                      <th className="px-2 py-2 text-left font-semibold text-gray-700 whitespace-nowrap">
                        เลขที่เอกสาร
                      </th>
                      <th className="px-2 py-2 text-left font-semibold text-gray-700 whitespace-nowrap">
                        เลขที่ใบกำกับ
                      </th>
                      <th className="px-2 py-2 text-left font-semibold text-gray-700 whitespace-nowrap">
                        ชื่อลูกค้า
                      </th>
                      <th className="px-2 py-2 text-left font-semibold text-gray-700">รายการ</th>
                      <th className="px-2 py-2 text-right font-semibold text-gray-700 whitespace-nowrap">
                        รวมทั้งสิ้น
                      </th>
                      <th className="px-2 py-2 text-right font-semibold text-gray-700 whitespace-nowrap">
                        เงินสด
                      </th>
                      <th className="px-2 py-2 text-right font-semibold text-gray-700 whitespace-nowrap">
                        เงินโอน
                      </th>
                      <th className="px-2 py-2 text-left font-semibold text-gray-700 whitespace-nowrap">
                        ผู้รับ
                      </th>
                      <th className="px-2 py-2 text-left font-semibold text-gray-700">หมายเหตุ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payments.length === 0 && (
                      <tr>
                        <td colSpan={10} className="px-2 py-12 text-center text-gray-500">
                          ไม่พบรายการรับเงินในช่วงเวลาที่เลือก
                        </td>
                      </tr>
                    )}
                    {payments.map((p) => (
                      <tr key={p.id} className="border-b border-gray-100 hover:bg-gray-50">
                        <td className="px-2 py-1.5 text-gray-900 whitespace-nowrap">
                          {formatDate(p.paymentDate.split('T')[0])}
                        </td>
                        <td className="px-2 py-1.5 text-gray-900 whitespace-nowrap">
                          {p.receiptNumber}
                        </td>
                        <td className="px-2 py-1.5 text-gray-900 whitespace-nowrap">
                          {p.receiptNumber}
                        </td>
                        <td className="px-2 py-1.5 text-gray-900">{p.customerName}</td>
                        <td className="px-2 py-1.5 text-gray-700">{p.description || ''}</td>
                        <td className="px-2 py-1.5 text-right text-gray-900 font-medium tabular-nums whitespace-nowrap">
                          {fmtAmount(p.amount)}
                        </td>
                        <td className="px-2 py-1.5 text-right text-gray-900 tabular-nums whitespace-nowrap">
                          {p.paymentMethod === 'CASH' ? fmtAmount(p.amount) : ''}
                        </td>
                        <td className="px-2 py-1.5 text-right text-gray-900 tabular-nums whitespace-nowrap">
                          {p.paymentMethod !== 'CASH' ? fmtAmount(p.amount) : ''}
                        </td>
                        <td className="px-2 py-1.5 text-gray-700 whitespace-nowrap">
                          {p.issuedBy || ''}
                        </td>
                        <td className="px-2 py-1.5 text-gray-500 max-w-[200px] truncate">
                          {p.notes || ''}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  {payments.length > 0 && (
                    <tfoot>
                      {/* รวมประจำวัน */}
                      <tr className="bg-gray-50 border-t-2 border-gray-400">
                        <td
                          colSpan={3}
                          className="px-2 py-2 text-left font-semibold text-gray-800 whitespace-nowrap"
                        >
                          รวมประจำวัน
                        </td>
                        <td className="px-2 py-2 text-gray-700 whitespace-nowrap">
                          {totalCount} รายการ
                        </td>
                        <td className="px-2 py-2 text-left font-semibold text-gray-800">รวมเงิน</td>
                        <td className="px-2 py-2 text-right font-semibold text-gray-900 tabular-nums whitespace-nowrap">
                          {fmtAmount(totalAmount)}
                        </td>
                        <td className="px-2 py-2 text-right text-gray-900 tabular-nums whitespace-nowrap">
                          {fmtAmount(totals.cash)}
                        </td>
                        <td className="px-2 py-2 text-right text-gray-900 tabular-nums whitespace-nowrap">
                          {fmtAmount(totals.transfer)}
                        </td>
                        <td colSpan={2}></td>
                      </tr>
                      {/* รวมทั้งสิ้น */}
                      <tr className="bg-gray-100 border-t border-gray-400">
                        <td
                          colSpan={3}
                          className="px-2 py-2 text-left font-bold text-gray-900 whitespace-nowrap"
                        >
                          รวมทั้งสิ้น
                        </td>
                        <td className="px-2 py-2 text-gray-800 whitespace-nowrap">
                          {totalCount} รายการ
                        </td>
                        <td className="px-2 py-2 text-left font-bold text-gray-900">รวมเงินทั้งสิ้น</td>
                        <td className="px-2 py-2 text-right font-bold text-gray-900 tabular-nums whitespace-nowrap border-t-2 border-b-4 border-double border-gray-800">
                          {fmtAmount(totalAmount)}
                        </td>
                        <td className="px-2 py-2 text-right font-bold text-gray-900 tabular-nums whitespace-nowrap border-t-2 border-b-4 border-double border-gray-800">
                          {fmtAmount(totals.cash)}
                        </td>
                        <td className="px-2 py-2 text-right font-bold text-gray-900 tabular-nums whitespace-nowrap border-t-2 border-b-4 border-double border-gray-800">
                          {fmtAmount(totals.transfer)}
                        </td>
                        <td colSpan={2}></td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </div>

            {/* Method Breakdown Summary — below table */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden mt-6 print-clean">
              <div className="px-6 py-3 border-b bg-gray-50">
                <h3 className="text-sm font-semibold text-gray-900">สรุปยอดรับเงินแยกตามวิธีชำระ</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 text-xs">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-2 text-left font-medium text-gray-500 uppercase tracking-wider">
                        วิธีชำระ
                      </th>
                      <th className="px-4 py-2 text-right font-medium text-gray-500 uppercase tracking-wider">
                        จำนวนรายการ
                      </th>
                      <th className="px-4 py-2 text-right font-medium text-gray-500 uppercase tracking-wider">
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
                          <td className="px-4 py-2">
                            <span
                              className={`inline-flex items-center px-2 py-0.5 rounded-full font-medium ${METHOD_COLORS[method] || 'text-gray-700 bg-gray-100'}`}
                            >
                              {PAYMENT_METHOD_LABELS[method] || method}
                            </span>
                          </td>
                          <td className="px-4 py-2 text-right text-gray-700">{count} รายการ</td>
                          <td className="px-4 py-2 text-right font-medium tabular-nums">
                            {formatCurrency(amount)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot className="bg-gray-50 border-t-2 border-gray-300">
                    <tr>
                      <td className="px-4 py-2 font-bold text-gray-900">ยอดรวมทั้งหมด</td>
                      <td className="px-4 py-2 text-right font-bold text-gray-900">
                        {data.summary.totalCount} รายการ
                      </td>
                      <td className="px-4 py-2 text-right font-bold text-gray-900 tabular-nums">
                        {formatCurrency(data.summary.totalAmount)}
                      </td>
                    </tr>
                  </tfoot>
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
