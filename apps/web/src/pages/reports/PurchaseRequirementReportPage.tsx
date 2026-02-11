import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { MainLayout } from '../../components/layout';
import { reportService } from '../../services/report.service';
import { useToast } from '../../components/toast';
import type { PurchaseRequirementReportResponse } from '@car-stock/shared/types';

export function PurchaseRequirementReportPage(): React.ReactElement {
  const { addToast } = useToast();
  const [selectedBrand, setSelectedBrand] = useState<string>('');

  const { data: report, isLoading, error } = useQuery<PurchaseRequirementReportResponse>({
    queryKey: ['purchase-requirement-report', selectedBrand],
    queryFn: () => reportService.getPurchaseRequirementReport({ brand: selectedBrand || undefined }),
  });

  // Extract unique brands from report data for the filter
  const brands = useMemo(() => {
    if (!report?.items) return [];
    return [...new Set(report.items.map(item => item.brand))].filter(Boolean);
  }, [report]);

  const handleExportPdf = async () => {
    try {
      const blob = await reportService.getPurchaseRequirementReportPdf({ brand: selectedBrand || undefined });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `purchase-requirement-report-${new Date().toISOString().split('T')[0]}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      addToast('ดาวน์โหลด PDF สำเร็จ', 'success');
    } catch {
      addToast('ดาวน์โหลด PDF ไม่สำเร็จ', 'error');
    }
  };

  if (isLoading) {
    return (
      <MainLayout>
        <div className="p-6">
          <div className="animate-pulse">
            <div className="h-8 bg-gray-200 rounded w-1/3 mb-6"></div>
            <div className="h-4 bg-gray-200 rounded w-full mb-4"></div>
            <div className="h-4 bg-gray-200 rounded w-full mb-4"></div>
            <div className="h-4 bg-gray-200 rounded w-full mb-4"></div>
          </div>
        </div>
      </MainLayout>
    );
  }

  if (error) {
    return (
      <MainLayout>
        <div className="p-6">
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <h2 className="text-red-800 font-semibold mb-2">เกิดข้อผิดพลาด</h2>
            <p className="text-red-600">ไม่สามารถโหลดรายงานได้ กรุณาลองใหม่อีกครั้ง</p>
          </div>
        </div>
      </MainLayout>
    );
  }

  const needToBuyItems = report?.items?.filter(item => item.status === 'NEED_TO_BUY') || [];
  const sufficientItems = report?.items?.filter(item => item.status === 'SUFFICIENT') || [];

  return (
    <MainLayout>
      <div className="p-6">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">รายงานความต้องการซื้อรถเพิ่ม</h1>
        <p className="text-gray-600 mt-1">
          แสดงรุ่นรถที่ต้องซื้อเพิ่ม โดยการเปรียบเทียบระหว่างการจองกับสต็อกที่มีอยู่
        </p>
      </div>

      {/* Filters & Actions */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-6">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-gray-700">ยี่ห้อ:</label>
            <select
              value={selectedBrand}
              onChange={(e) => setSelectedBrand(e.target.value)}
              className="border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">ทั้งหมด</option>
              {brands.map((brand) => (
                <option key={brand} value={brand}>
                  {brand}
                </option>
              ))}
            </select>
          </div>
          <button
            onClick={handleExportPdf}
            className="bg-red-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-red-700 transition-colors flex items-center gap-2"
          >
            <span>PDF</span>
            ดาวน์โหลด
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      {report?.summary && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
            <p className="text-sm text-blue-600 font-medium">จำนวนรุ่นที่ต้องซื้อ</p>
            <p className="text-2xl font-bold text-blue-900">{report.summary.modelsNeedingPurchase}</p>
            <p className="text-xs text-blue-500">จาก {report.summary.totalModels} รุ่น</p>
          </div>
          <div className="bg-orange-50 rounded-lg p-4 border border-orange-200">
            <p className="text-sm text-orange-600 font-medium">จำนวนที่ต้องซื้อเพิ่ม</p>
            <p className="text-2xl font-bold text-orange-900">{report.summary.totalRequired}</p>
            <p className="text-xs text-orange-500">คัน</p>
          </div>
          <div className="bg-purple-50 rounded-lg p-4 border border-purple-200">
            <p className="text-sm text-purple-600 font-medium">จำนวนการจอง</p>
            <p className="text-2xl font-bold text-purple-900">{report.summary.totalReservations}</p>
            <p className="text-xs text-purple-500">คัน</p>
          </div>
          <div className="bg-green-50 rounded-lg p-4 border border-green-200">
            <p className="text-sm text-green-600 font-medium">สต็อกที่มีอยู่</p>
            <p className="text-2xl font-bold text-green-900">{report.summary.totalAvailable}</p>
            <p className="text-xs text-green-500">คัน</p>
          </div>
        </div>
      )}

      {/* Need to Buy Table */}
      {needToBuyItems.length > 0 && (
        <div className="mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-3 flex items-center gap-2">
            <span className="w-3 h-3 bg-red-500 rounded-full"></span>
            รุ่นที่ต้องซื้อเพิ่ม ({needToBuyItems.length} รุ่น)
          </h2>
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
            <table className="w-full">
              <thead className="bg-red-50">
                <tr>
                  <th className="px-4 py-3 text-left text-sm font-medium text-red-900">รุ่นรถ</th>
                  <th className="px-4 py-3 text-center text-sm font-medium text-red-900">จอง</th>
                  <th className="px-4 py-3 text-center text-sm font-medium text-red-900">สต็อก</th>
                  <th className="px-4 py-3 text-center text-sm font-medium text-red-900">ขาดอีก</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {needToBuyItems.map((item) => (
                  <tr key={item.vehicleModelId} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900">{item.vehicleModelName}</div>
                      <div className="text-sm text-gray-500">{item.year}</div>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-sm font-medium bg-purple-100 text-purple-800">
                        {item.reservationCount}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-sm font-medium bg-green-100 text-green-800">
                        {item.availableCount}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-sm font-medium bg-red-100 text-red-800">
                        {item.requiredPurchase}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Sufficient Stock Table */}
      {sufficientItems.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold text-gray-900 mb-3 flex items-center gap-2">
            <span className="w-3 h-3 bg-green-500 rounded-full"></span>
            รุ่นที่สต็อกเพียงพอ ({sufficientItems.length} รุ่น)
          </h2>
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
            <table className="w-full">
              <thead className="bg-green-50">
                <tr>
                  <th className="px-4 py-3 text-left text-sm font-medium text-green-900">รุ่นรถ</th>
                  <th className="px-4 py-3 text-center text-sm font-medium text-green-900">จอง</th>
                  <th className="px-4 py-3 text-center text-sm font-medium text-green-900">สต็อก</th>
                  <th className="px-4 py-3 text-center text-sm font-medium text-green-900">สถานะ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {sufficientItems.map((item) => (
                  <tr key={item.vehicleModelId} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900">{item.vehicleModelName}</div>
                      <div className="text-sm text-gray-500">{item.year}</div>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-sm font-medium bg-purple-100 text-purple-800">
                        {item.reservationCount}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-sm font-medium bg-green-100 text-green-800">
                        {item.availableCount}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-sm font-medium bg-green-100 text-green-800">
                        เพียงพอ
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* No Data State */}
      {report?.items?.length === 0 && (
        <div className="bg-gray-50 rounded-lg p-8 text-center">
          <p className="text-gray-500">ไม่พบข้อมูลรายงาน</p>
        </div>
      )}
    </div>
    </MainLayout>
  );
}
