import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { MainLayout } from '../../components/layout';
import { campaignService } from '../../services/campaign.service';
import { ArrowLeft, Calendar, TrendingUp, ShoppingCart, Car, Download } from 'lucide-react';

export const CampaignAnalyticsPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  // Get campaign info
  const { data: campaign } = useQuery({
    queryKey: ['campaign', id],
    queryFn: () => campaignService.getById(id!),
    enabled: !!id,
  });

  // Date filter state - default to campaign period
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Get analytics
  const { data: analyticsData, isLoading, error, refetch } = useQuery({
    queryKey: ['campaign-analytics', id, startDate, endDate],
    queryFn: () =>
      campaignService.getAnalytics(
        id!,
        startDate || undefined,
        endDate || undefined
      ),
    enabled: !!id,
  });

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('th-TH', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('th-TH', {
      style: 'currency',
      currency: 'THB',
      minimumFractionDigits: 0,
    }).format(amount);
  };

  const handleFilter = () => {
    refetch();
  };

  const handleResetFilter = () => {
    setStartDate('');
    setEndDate('');
    setTimeout(() => refetch(), 0);
  };

  const exportToCSV = () => {
    if (!analyticsData) return;

    const headers = ['รุ่นรถยนต์', 'ปี', 'ยอดขายทั้งหมด', 'ยอดเงินรวม', 'ขายตรง', 'ขายผ่านจอง'];
    const rows = analyticsData.analytics.map((item) => [
      `${item.vehicleModel.brand} ${item.vehicleModel.model} ${item.vehicleModel.variant || ''}`,
      item.vehicleModel.year,
      item.totalSales,
      item.totalAmount,
      item.directSales,
      item.reservationSales,
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map((row) => row.join(',')),
    ].join('\n');

    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `campaign-analytics-${id}-${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  };

  if (isLoading) {
    return (
      <MainLayout>
        <div className="text-center py-8">กำลังโหลด...</div>
      </MainLayout>
    );
  }

  if (error) {
    return (
      <MainLayout>
        <div className="text-center text-red-600 py-8">
          เกิดข้อผิดพลาดในการโหลดข้อมูล
        </div>
      </MainLayout>
    );
  }

  const analytics = analyticsData?.analytics || [];
  const summary = analyticsData?.summary;

  return (
    <MainLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate(`/campaigns/${id}`)}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                สถิติแคมเปญ: {campaign?.name}
              </h1>
              <p className="text-gray-600 mt-1">
                วิเคราะห์ยอดขายตามรุ่นรถยนต์
              </p>
            </div>
          </div>
          <button
            onClick={exportToCSV}
            className="flex items-center gap-2 bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors"
          >
            <Download className="w-5 h-5" />
            ส่งออก CSV
          </button>
        </div>

        {/* Date Filter */}
        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex flex-wrap items-end gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                วันเริ่มต้น
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                วันสิ้นสุด
              </label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <button
              onClick={handleFilter}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              กรอง
            </button>
            <button
              onClick={handleResetFilter}
              className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
            >
              รีเซ็ต
            </button>
            {summary && (
              <div className="flex items-center gap-2 text-sm text-gray-500 ml-auto">
                <Calendar className="w-4 h-4" />
                ช่วงเวลา: {formatDate(summary.periodStart)} - {formatDate(summary.periodEnd)}
              </div>
            )}
          </div>
        </div>

        {/* Summary Cards */}
        {summary && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-blue-100 rounded-lg">
                  <ShoppingCart className="w-6 h-6 text-blue-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-500">ยอดขายทั้งหมด</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {summary.totalSales}
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-green-100 rounded-lg">
                  <TrendingUp className="w-6 h-6 text-green-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-500">ยอดเงินรวม</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {formatCurrency(summary.totalAmount)}
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-yellow-100 rounded-lg">
                  <Car className="w-6 h-6 text-yellow-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-500">ขายตรง</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {summary.directSales}
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-purple-100 rounded-lg">
                  <Car className="w-6 h-6 text-purple-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-500">ขายผ่านจอง</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {summary.reservationSales}
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Analytics Table */}
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="px-6 py-4 border-b">
            <h2 className="text-lg font-semibold text-gray-900">
              ยอดขายตามรุ่นรถยนต์
            </h2>
          </div>

          {analytics.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              ไม่มีข้อมูลยอดขายในช่วงเวลานี้
            </div>
          ) : (
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    รุ่นรถยนต์
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    ยอดขายทั้งหมด
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    ยอดเงินรวม
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    ขายตรง
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    ขายผ่านจอง
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {analytics.map((item) => (
                  <tr key={item.vehicleModelId} className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <div>
                        <div className="font-medium text-gray-900">
                          {item.vehicleModel.brand} {item.vehicleModel.model}
                        </div>
                        <div className="text-sm text-gray-500">
                          {item.vehicleModel.variant} • {item.vehicleModel.year}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right whitespace-nowrap">
                      <span className="text-lg font-semibold text-gray-900">
                        {item.totalSales}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right whitespace-nowrap">
                      <span className="text-gray-900">
                        {formatCurrency(item.totalAmount)}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right whitespace-nowrap">
                      <span className="text-yellow-600 font-medium">
                        {item.directSales}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right whitespace-nowrap">
                      <span className="text-purple-600 font-medium">
                        {item.reservationSales}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
              {summary && (
                <tfoot className="bg-gray-50">
                  <tr>
                    <td className="px-6 py-4 font-semibold text-gray-900">รวม</td>
                    <td className="px-6 py-4 text-right font-semibold text-gray-900">
                      {summary.totalSales}
                    </td>
                    <td className="px-6 py-4 text-right font-semibold text-gray-900">
                      {formatCurrency(summary.totalAmount)}
                    </td>
                    <td className="px-6 py-4 text-right font-semibold text-yellow-600">
                      {summary.directSales}
                    </td>
                    <td className="px-6 py-4 text-right font-semibold text-purple-600">
                      {summary.reservationSales}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          )}
        </div>
      </div>
    </MainLayout>
  );
};

export default CampaignAnalyticsPage;
