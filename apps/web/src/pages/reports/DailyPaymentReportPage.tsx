import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { MainLayout } from '../../components/layout';
import { ArrowLeft, FileText } from 'lucide-react';
import { reportService } from '../../services/report.service';
import {
  DateRangeFilter,
  ReportTable,
  ExportButton,
  PrintButton,
  formatCurrency,
  formatDate,
  StatusBadge,
} from '../../components/reports';
import type { DailyPaymentReportResponse, DailyPaymentItem } from '@car-stock/shared/types';

export default function DailyPaymentReportPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<DailyPaymentReportResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Default to current month
  const today = new Date();
  const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  const [startDate, setStartDate] = useState(firstDayOfMonth.toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(today.toISOString().split('T')[0]);

  const fetchReport = async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await reportService.getDailyPaymentReport({
        startDate,
        endDate,
      });
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

  const columns = [
    { key: 'receiptNumber', label: 'เลขที่ใบเสร็จ' },
    {
      key: 'paymentDate',
      label: 'วันที่',
      render: (value: string) => formatDate(value),
    },
    { key: 'customerName', label: 'ลูกค้า' },
    { key: 'customerCode', label: 'รหัสลูกค้า' },
    {
      key: 'paymentTypeLabel',
      label: 'ประเภท',
      render: (value: string, row: DailyPaymentItem) => (
        <StatusBadge status={row.paymentType} label={value} />
      ),
    },
    { key: 'paymentMethodLabel', label: 'วิธีชำระ' },
    {
      key: 'amount',
      label: 'จำนวนเงิน',
      align: 'right' as const,
      render: (value: number) => formatCurrency(value),
    },
    { key: 'saleNumber', label: 'เลขที่การขาย' },
  ];

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
      <div className="mb-6">
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
      <div className="mb-6">
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
      <div className="flex gap-3 mb-6">
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
            {/* Method Breakdown Summary Table */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden mb-6">
              <div className="px-6 py-4 border-b bg-gray-50">
                <h3 className="text-base font-semibold text-gray-900">สรุปยอดรับเงินแยกตามวิธีชำระ</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">วิธีชำระ</th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">จำนวนรายการ</th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">ยอดเงิน (บาท)</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {(() => {
                      const methodOrder = ['CASH', 'BANK_TRANSFER', 'CHEQUE', 'CREDIT_CARD'];
                      const methodLabels: Record<string, string> = {
                        CASH: 'เงินสด',
                        BANK_TRANSFER: 'เงินโอน',
                        CHEQUE: 'เช็ค',
                        CREDIT_CARD: 'บัตรเครดิต',
                      };
                      const methodColors: Record<string, string> = {
                        CASH: 'text-green-700 bg-green-50',
                        BANK_TRANSFER: 'text-blue-700 bg-blue-50',
                        CHEQUE: 'text-purple-700 bg-purple-50',
                        CREDIT_CARD: 'text-orange-700 bg-orange-50',
                      };
                      const rows = methodOrder.map((method) => {
                        const found = data.summary.byMethod.find((m) => m.method === method);
                        return { method, label: methodLabels[method] || method, count: found?.count || 0, amount: found?.amount || 0 };
                      });
                      return rows.map((row) => (
                        <tr key={row.method} className={row.amount > 0 ? '' : 'opacity-40'}>
                          <td className="px-6 py-3 text-sm">
                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${methodColors[row.method] || 'text-gray-700 bg-gray-100'}`}>
                              {row.label}
                            </span>
                          </td>
                          <td className="px-6 py-3 text-sm text-right text-gray-700">{row.count} รายการ</td>
                          <td className="px-6 py-3 text-sm text-right font-medium">{formatCurrency(row.amount)}</td>
                        </tr>
                      ));
                    })()}
                  </tbody>
                  <tfoot className="bg-gray-50 border-t-2 border-gray-300">
                    <tr>
                      <td className="px-6 py-3 text-sm font-bold text-gray-900">ยอดรวมทั้งหมด</td>
                      <td className="px-6 py-3 text-sm text-right font-bold text-gray-900">{data.summary.totalCount} รายการ</td>
                      <td className="px-6 py-3 text-sm text-right font-bold text-gray-900">{formatCurrency(data.summary.totalAmount)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            {/* Detail Table */}
            <div>
              <h3 className="text-base font-semibold text-gray-900 mb-4">รายละเอียดการรับเงิน</h3>
              <ReportTable
                columns={columns}
                data={data.payments}
                loading={loading}
                emptyMessage="ไม่พบรายการรับเงินในช่วงเวลาที่เลือก"
                footer={
                  <tr>
                    <td colSpan={6} className="px-4 py-3 text-right font-semibold">
                      รวมทั้งสิ้น
                    </td>
                    <td className="px-4 py-3 text-right font-semibold">
                      {formatCurrency(data.summary.totalAmount)}
                    </td>
                    <td></td>
                  </tr>
                }
              />
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
