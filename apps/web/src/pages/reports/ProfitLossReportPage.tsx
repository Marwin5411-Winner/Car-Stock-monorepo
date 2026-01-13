import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { MainLayout } from '../../components/layout';
import {
  ArrowLeft,
  DollarSign,
  TrendingUp,
  TrendingDown,
  ShoppingCart,
  Percent,
  FileText,
} from 'lucide-react';
import { reportService } from '../../services/report.service';
import {
  DateRangeFilter,
  SummaryCard,
  SummaryCardsGrid,
  ReportBarChart,
  ReportLineChart,
  ReportTable,
  ExportButton,
  PrintButton,
  formatCurrency,
  formatDate,
  formatNumber,
  formatPercent,
} from '../../components/reports';
import type { ProfitLossReportResponse } from '@car-stock/shared/types';

export default function ProfitLossReportPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<ProfitLossReportResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Default dates (first day of year to today)
  const today = new Date();
  const firstDayOfYear = new Date(today.getFullYear(), 0, 1);
  const [startDate, setStartDate] = useState(firstDayOfYear.toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(today.toISOString().split('T')[0]);

  const fetchReport = async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await reportService.getProfitLossReport({ startDate, endDate });
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'เกิดข้อผิดพลาดในการโหลดข้อมูล');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReport();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const columns = [
    { key: 'vin', label: 'VIN' },
    {
      key: 'vehicleInfo',
      label: 'รถ',
      render: (value: string) => value,
    },
    {
      key: 'saleDate',
      label: 'วันที่ขาย',
      render: (value: string) => formatDate(value),
    },
    {
      key: 'sellingPrice',
      label: 'ราคาขาย',
      align: 'right' as const,
      render: (value: number) => formatCurrency(value),
    },
    {
      key: 'totalCost',
      label: 'ต้นทุนรวม',
      align: 'right' as const,
      render: (value: number) => formatCurrency(value),
    },
    {
      key: 'interestCost',
      label: 'ดอกเบี้ย',
      align: 'right' as const,
      render: (value: number) => (
        <span className="text-red-600">-{formatCurrency(value)}</span>
      ),
    },
    {
      key: 'grossProfit',
      label: 'กำไรขั้นต้น',
      align: 'right' as const,
      render: (value: number) => (
        <span className={value >= 0 ? 'text-green-600 font-medium' : 'text-red-600 font-medium'}>
          {value >= 0 ? '+' : ''}{formatCurrency(value)}
        </span>
      ),
    },
    {
      key: 'netProfit',
      label: 'กำไรสุทธิ',
      align: 'right' as const,
      render: (value: number) => (
        <span className={value >= 0 ? 'text-green-600 font-bold' : 'text-red-600 font-bold'}>
          {value >= 0 ? '+' : ''}{formatCurrency(value)}
        </span>
      ),
    },
    {
      key: 'profitMargin',
      label: 'อัตรากำไร',
      align: 'right' as const,
      render: (value: number) => (
        <span className={value >= 0 ? 'text-green-600' : 'text-red-600'}>
          {formatPercent(value)}
        </span>
      ),
    },
  ];

  const exportHeaders = [
    { key: 'vin', label: 'VIN' },
    { key: 'vehicleInfo', label: 'รถ' },
    { key: 'saleDate', label: 'วันที่ขาย' },
    { key: 'sellingPrice', label: 'ราคาขาย' },
    { key: 'baseCost', label: 'ราคาต้นทุน' },
    { key: 'interestCost', label: 'ดอกเบี้ย' },
    { key: 'totalCost', label: 'ต้นทุนรวม' },
    { key: 'grossProfit', label: 'กำไรขั้นต้น' },
    { key: 'netProfit', label: 'กำไรสุทธิ' },
    { key: 'profitMargin', label: 'อัตรากำไร (%)' },
  ];

  const handleExportPdf = async () => {
    try {
      setLoading(true);
      const blob = await reportService.getProfitLossReportPdf({ startDate, endDate });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `profit-loss-report-${startDate}.pdf`;
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
        <h1 className="text-2xl font-bold text-gray-900">รายงานกำไร-ขาดทุน</h1>
        <p className="text-gray-600 mt-1">รายงานสรุปกำไรขาดทุนจากการขายรถ รวมต้นทุนดอกเบี้ย</p>
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
          data={data?.items || []}
          filename="รายงานกำไร-ขาดทุน"
          sheetName="กำไรขาดทุน"
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
        <PrintButton title="รายงานกำไร-ขาดทุน" contentId="report-content" />
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6">
          {error}
        </div>
      )}

      <div id="report-content">
        {data && (
          <>
            {/* Summary Cards */}
            <SummaryCardsGrid>
              <SummaryCard
                title="รายได้รวม"
                value={formatCurrency(data.summary.totalRevenue)}
                subtitle={`${formatNumber(data.summary.totalSales)} คัน`}
                icon={DollarSign}
                iconColor="text-blue-600"
                iconBgColor="bg-blue-100"
              />
              <SummaryCard
                title="ต้นทุนรวม"
                value={formatCurrency(data.summary.totalCost)}
                subtitle={`ดอกเบี้ย ${formatCurrency(data.summary.totalInterestCost)}`}
                icon={ShoppingCart}
                iconColor="text-orange-600"
                iconBgColor="bg-orange-100"
              />
              <SummaryCard
                title="กำไรสุทธิ"
                value={formatCurrency(data.summary.netProfit)}
                subtitle={`อัตรากำไร ${formatPercent(data.summary.profitMargin)}`}
                icon={data.summary.netProfit >= 0 ? TrendingUp : TrendingDown}
                iconColor={data.summary.netProfit >= 0 ? 'text-green-600' : 'text-red-600'}
                iconBgColor={data.summary.netProfit >= 0 ? 'bg-green-100' : 'bg-red-100'}
              />
              <SummaryCard
                title="กำไรเฉลี่ยต่อคัน"
                value={formatCurrency(data.summary.averageProfitPerVehicle)}
                icon={Percent}
                iconColor="text-purple-600"
                iconBgColor="bg-purple-100"
              />
            </SummaryCardsGrid>

            {/* Charts */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">กำไรรายเดือน</h3>
                <ReportBarChart
                  data={data.chartData.monthlyProfit}
                  xKey="month"
                  yKey="netProfit"
                  yKeyLabels={['กำไรสุทธิ']}
                  height={300}
                  className="border-0 shadow-none p-0"
                />
              </div>

              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">แนวโน้มกำไร</h3>
                <ReportLineChart
                  data={data.chartData.monthlyProfit}
                  xKey="month"
                  yKey={['revenue', 'cost', 'netProfit']}
                  yKeyLabels={['รายได้', 'ต้นทุน', 'กำไรสุทธิ']}
                  colors={['#3B82F6', '#EF4444', '#10B981']}
                  height={300}
                  className="border-0 shadow-none p-0"
                />
              </div>
            </div>

            {/* Cost Breakdown */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mt-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">รายละเอียดต้นทุน</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="p-4 bg-gray-50 rounded-lg">
                  <p className="text-sm text-gray-600">ต้นทุนรถ</p>
                  <p className="text-xl font-semibold text-gray-900">
                    {formatCurrency(data.summary.totalCost - data.summary.totalInterestCost)}
                  </p>
                </div>
                <div className="p-4 bg-red-50 rounded-lg">
                  <p className="text-sm text-red-600">ดอกเบี้ยสะสม</p>
                  <p className="text-xl font-semibold text-red-700">
                    {formatCurrency(data.summary.totalInterestCost)}
                  </p>
                </div>
                <div className="p-4 bg-blue-50 rounded-lg">
                  <p className="text-sm text-blue-600">รายได้รวม</p>
                  <p className="text-xl font-semibold text-blue-700">
                    {formatCurrency(data.summary.totalRevenue)}
                  </p>
                </div>
                <div className={`p-4 rounded-lg ${data.summary.netProfit >= 0 ? 'bg-green-50' : 'bg-red-50'}`}>
                  <p className={`text-sm ${data.summary.netProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    กำไร/ขาดทุนสุทธิ
                  </p>
                  <p className={`text-xl font-semibold ${data.summary.netProfit >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                    {data.summary.netProfit >= 0 ? '+' : ''}{formatCurrency(data.summary.netProfit)}
                  </p>
                </div>
              </div>
            </div>

            {/* Table */}
            <div className="mt-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">รายละเอียดการขาย</h3>
              <ReportTable
                columns={columns}
                data={data.items}
                loading={loading}
                emptyMessage="ไม่พบข้อมูลการขาย"
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
