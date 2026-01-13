import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { MainLayout } from '../../components/layout';
import { ArrowLeft, Package, Car, CheckCircle, Clock, FileText } from 'lucide-react';
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
  formatNumber,
  StatusBadge,
} from '../../components/reports';
import type { StockReportResponse, StockReportItem } from '@car-stock/shared/types';

export default function StockReportPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<StockReportResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('');

  // Default dates
  const today = new Date();
  const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  const [startDate, setStartDate] = useState(firstDayOfMonth.toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(today.toISOString().split('T')[0]);

  const fetchReport = async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await reportService.getStockReport({
        startDate,
        endDate,
        status: statusFilter || undefined,
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const columns = [
    { key: 'vin', label: 'VIN' },
    {
      key: 'brand',
      label: 'ยี่ห้อ/รุ่น',
      render: (_: string, row: StockReportItem) => `${row.brand} ${row.model} ${row.variant || ''}`,
    },
    { key: 'year', label: 'ปี', align: 'center' as const },
    { key: 'exteriorColor', label: 'สี' },
    {
      key: 'statusLabel',
      label: 'สถานะ',
      render: (value: string, row: StockReportItem) => (
        <StatusBadge status={row.status} label={value} />
      ),
    },
    {
      key: 'arrivalDate',
      label: 'วันที่นำเข้า',
      render: (value: string) => formatDate(value),
    },
    {
      key: 'daysInStock',
      label: 'วันในสต็อก',
      align: 'right' as const,
      render: (value: number) => `${formatNumber(value)} วัน`,
    },
    {
      key: 'totalCost',
      label: 'ต้นทุนรวม',
      align: 'right' as const,
      render: (value: number) => formatCurrency(value),
    },
  ];

  const exportHeaders = [
    { key: 'vin', label: 'VIN' },
    { key: 'brand', label: 'ยี่ห้อ' },
    { key: 'model', label: 'รุ่น' },
    { key: 'variant', label: 'รุ่นย่อย' },
    { key: 'year', label: 'ปี' },
    { key: 'exteriorColor', label: 'สีภายนอก' },
    { key: 'interiorColor', label: 'สีภายใน' },
    { key: 'statusLabel', label: 'สถานะ' },
    { key: 'arrivalDate', label: 'วันที่นำเข้า' },
    { key: 'daysInStock', label: 'วันในสต็อก' },
    { key: 'baseCost', label: 'ราคาต้นทุน' },
    { key: 'totalCost', label: 'ต้นทุนรวม' },
    { key: 'totalCost', label: 'ต้นทุนรวม' },
  ];

  const handleExportPdf = async () => {
    try {
      setLoading(true);
      const blob = await reportService.getStockReportPdf({
        startDate,
        endDate,
        status: statusFilter || undefined,
      });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `stock-report-${startDate}.pdf`;
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
        <h1 className="text-2xl font-bold text-gray-900">รายงานสต็อก</h1>
        <p className="text-gray-600 mt-1">รายงานสถานะรถในสต็อก แยกตามยี่ห้อและสถานะ</p>
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

      {/* Status Filter */}
      <div className="flex gap-4 mb-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">สถานะ</label>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
          >
            <option value="">ทั้งหมด</option>
            <option value="AVAILABLE">พร้อมขาย</option>
            <option value="RESERVED">จองแล้ว</option>
            <option value="PREPARING">เตรียมส่งมอบ</option>
            <option value="SOLD">ขายแล้ว</option>
          </select>
        </div>
        <div className="flex items-end">
          <button
            onClick={fetchReport}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm"
          >
            กรองข้อมูล
          </button>
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-3 mb-6">
        <ExportButton
          data={data?.stocks || []}
          filename="รายงานสต็อก"
          sheetName="สต็อกรถ"
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
        <PrintButton title="รายงานสต็อก" contentId="report-content" />
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
                title="รถทั้งหมด"
                value={formatNumber(data.summary.totalCount)}
                subtitle={`มูลค่า ${formatCurrency(data.summary.totalValue)}`}
                icon={Package}
                iconColor="text-blue-600"
                iconBgColor="bg-blue-100"
              />
              <SummaryCard
                title="พร้อมขาย"
                value={formatNumber(data.summary.availableCount)}
                subtitle={`${((data.summary.availableCount / data.summary.totalCount) * 100).toFixed(1)}%`}
                icon={Car}
                iconColor="text-green-600"
                iconBgColor="bg-green-100"
              />
              <SummaryCard
                title="จองแล้ว"
                value={formatNumber(data.summary.reservedCount)}
                subtitle={`${((data.summary.reservedCount / data.summary.totalCount) * 100).toFixed(1)}%`}
                icon={Clock}
                iconColor="text-yellow-600"
                iconBgColor="bg-yellow-100"
              />
              <SummaryCard
                title="ขายแล้ว"
                value={formatNumber(data.summary.soldCount)}
                subtitle={`${((data.summary.soldCount / data.summary.totalCount) * 100).toFixed(1)}%`}
                icon={CheckCircle}
                iconColor="text-gray-600"
                iconBgColor="bg-gray-100"
              />
            </SummaryCardsGrid>

            {/* Charts */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">สัดส่วนตามสถานะ</h3>
                <ReportPieChart
                  data={data.chartData.byStatus.map((s) => ({
                    name: s.label,
                    value: s.count,
                    status: s.status,
                  }))}
                  nameKey="name"
                  valueKey="value"
                  useStatusColors
                  height={300}
                  className="border-0 shadow-none p-0"
                />
              </div>

              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">จำนวนรถตามยี่ห้อ</h3>
                <ReportBarChart
                  data={data.chartData.byBrand}
                  xKey="brand"
                  yKey="count"
                  yKeyLabels={['จำนวน']}
                  height={300}
                  className="border-0 shadow-none p-0"
                />
              </div>
            </div>

            {/* Table */}
            <div className="mt-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">รายละเอียดรถในสต็อก</h3>
              <ReportTable
                columns={columns}
                data={data.stocks}
                loading={loading}
                emptyMessage="ไม่พบข้อมูลรถในสต็อก"
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
