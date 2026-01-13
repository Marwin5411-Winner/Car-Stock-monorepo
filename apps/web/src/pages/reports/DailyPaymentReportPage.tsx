import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { MainLayout } from '../../components/layout';
import { ArrowLeft, Banknote, Receipt, CreditCard, Wallet, FileText } from 'lucide-react';
import { reportService } from '../../services/report.service';
import {
  DateRangeFilter,
  SummaryCard,
  SummaryCardsGrid,
  ReportBarChart,
  ReportPieChart,
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
        {/* Summary Cards */}
        {data && (
          <>
            <SummaryCardsGrid>
              <SummaryCard
                title="ยอดรับรวม"
                value={formatCurrency(data.summary.totalAmount)}
                subtitle={`${data.summary.totalCount} รายการ`}
                icon={Banknote}
                iconColor="text-green-600"
                iconBgColor="bg-green-100"
              />
              {data.summary.byMethod.map((method) => {
                const icons: Record<string, typeof CreditCard> = {
                  CASH: Wallet,
                  BANK_TRANSFER: Receipt,
                  CREDIT_CARD: CreditCard,
                  CHEQUE: Receipt,
                };
                const Icon = icons[method.method] || Receipt;
                return (
                  <SummaryCard
                    key={method.method}
                    title={method.label}
                    value={formatCurrency(method.amount)}
                    subtitle={`${method.count} รายการ`}
                    icon={Icon}
                    iconColor="text-blue-600"
                    iconBgColor="bg-blue-100"
                  />
                );
              })}
            </SummaryCardsGrid>

            {/* Charts */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">ยอดรับเงินรายวัน</h3>
                <ReportBarChart
                  data={data.chartData}
                  xKey="date"
                  yKey="amount"
                  yKeyLabels={['ยอดเงิน']}
                  height={300}
                  className="border-0 shadow-none p-0"
                />
              </div>

              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">สัดส่วนตามวิธีชำระ</h3>
                <ReportPieChart
                  data={data.summary.byMethod.map((m) => ({
                    name: m.label,
                    value: m.amount,
                  }))}
                  nameKey="name"
                  valueKey="value"
                  height={300}
                  className="border-0 shadow-none p-0"
                />
              </div>
            </div>

            {/* Table */}
            <div className="mt-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">รายละเอียดการรับเงิน</h3>
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
