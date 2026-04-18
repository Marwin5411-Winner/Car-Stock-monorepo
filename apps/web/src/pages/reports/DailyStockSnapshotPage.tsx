import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { MainLayout } from '../../components/layout';
import { reportService } from '../../services/report.service';
import { useToast } from '../../components/toast';
import { exportMultiSheet } from '../../components/reports/exportUtils';
import type {
  DailyStockSnapshotResponse,
  DailyStockSnapshotModel,
} from '@car-stock/shared/types';

export function DailyStockSnapshotPage(): React.ReactElement {
  const { addToast } = useToast();
  const [snapshotDate, setSnapshotDate] = useState<string>(
    () => new Date().toISOString().split('T')[0],
  );

  const { data, isLoading, error } = useQuery<DailyStockSnapshotResponse>({
    queryKey: ['daily-stock-snapshot', snapshotDate],
    queryFn: () => reportService.getDailyStockSnapshot({ date: snapshotDate }),
  });

  const handleExport = () => {
    if (!data) return;
    const makeRows = (kind: 'reservations' | 'available' | 'required') =>
      data.models.map((m: DailyStockSnapshotModel) => {
        const row: Record<string, string | number> = { แบบรถ: m.modelName };
        data.colors.forEach((c) => {
          const v =
            kind === 'reservations'
              ? m.reservationsByColor[c]
              : kind === 'available'
                ? m.availableByColor[c]
                : m.requiredByColor[c];
          row[c] = v ?? 0;
        });
        row.Total =
          kind === 'reservations'
            ? m.reservationsTotal
            : kind === 'available'
              ? m.availableTotal
              : m.requiredTotal;
        return row;
      });

    exportMultiSheet({
      sheets: [
        { name: 'ยอดจองคงเหลือ', data: makeRows('reservations') },
        { name: 'สต๊อกคงเหลือ', data: makeRows('available') },
        { name: 'ยอดที่ต้องสั่งซื้อ', data: makeRows('required') },
      ],
      filename: `daily-stock-snapshot_${snapshotDate}`,
    });
    addToast('ดาวน์โหลด Excel สำเร็จ', 'success');
  };

  const handleDownloadPdf = async () => {
    try {
      const blob = await reportService.getDailyStockSnapshotPdf({ date: snapshotDate });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `daily-stock-snapshot-${snapshotDate}.pdf`;
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
          <div className="animate-pulse h-8 bg-gray-200 rounded w-1/3 mb-6" />
        </div>
      </MainLayout>
    );
  }

  if (error || !data) {
    return (
      <MainLayout>
        <div className="p-6">
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <h2 className="text-red-800 font-semibold mb-2">เกิดข้อผิดพลาด</h2>
            <p className="text-red-600">ไม่สามารถโหลดรายงานได้</p>
          </div>
        </div>
      </MainLayout>
    );
  }

  const renderPanel = (
    title: string,
    getCell: (m: DailyStockSnapshotModel, c: string) => number,
    getTotal: (m: DailyStockSnapshotModel) => number,
    cellClass?: (n: number) => string,
  ) => (
    <div className="mb-6">
      <h2 className="text-lg font-semibold text-gray-900 mb-3">{title}</h2>
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-3 py-2 text-left font-medium">แบบรถ</th>
              {data.colors.map((c) => (
                <th key={c} className="px-3 py-2 text-center font-medium">
                  {c}
                </th>
              ))}
              <th className="px-3 py-2 text-center font-medium">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {data.models.map((m) => (
              <tr key={m.vehicleModelId} className="hover:bg-gray-50">
                <td className="px-3 py-2 font-medium">{m.modelName}</td>
                {data.colors.map((c) => {
                  const n = getCell(m, c) || 0;
                  return (
                    <td
                      key={c}
                      className={`px-3 py-2 text-center ${cellClass ? cellClass(n) : ''}`}
                    >
                      {n || ''}
                    </td>
                  );
                })}
                <td className="px-3 py-2 text-center font-semibold">{getTotal(m)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );

  return (
    <MainLayout>
      <div className="p-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">รายงานสต็อกประจำวัน</h1>
          <p className="text-gray-600 mt-1">
            แสดงยอดจอง สต็อกคงเหลือ และยอดที่ต้องสั่งซื้อ ณ วันที่เลือก
          </p>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-6 print-hide">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium">วันที่:</label>
              <input
                type="date"
                value={snapshotDate}
                onChange={(e) => setSnapshotDate(e.target.value)}
                className="border border-gray-300 rounded-md px-3 py-1.5 text-sm"
              />
            </div>
            <button
              type="button"
              onClick={handleExport}
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
            <button
              type="button"
              onClick={() => window.print()}
              className="bg-gray-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-gray-700"
            >
              พิมพ์
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-purple-50 rounded-lg p-4 border border-purple-200">
            <p className="text-sm text-purple-600 font-medium">ยอดจอง</p>
            <p className="text-2xl font-bold text-purple-900">{data.grand.reservations}</p>
          </div>
          <div className="bg-green-50 rounded-lg p-4 border border-green-200">
            <p className="text-sm text-green-600 font-medium">สต็อกคงเหลือ</p>
            <p className="text-2xl font-bold text-green-900">{data.grand.available}</p>
          </div>
          <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
            <p className="text-sm text-blue-600 font-medium">รถ DEMO</p>
            <p className="text-2xl font-bold text-blue-900">{data.grand.demo}</p>
          </div>
          <div className="bg-orange-50 rounded-lg p-4 border border-orange-200">
            <p className="text-sm text-orange-600 font-medium">ต้องสั่งซื้อเพิ่ม</p>
            <p className="text-2xl font-bold text-orange-900">{data.grand.required}</p>
          </div>
        </div>

        {renderPanel(
          'ยอดจองคงเหลือ',
          (m, c) => m.reservationsByColor[c],
          (m) => m.reservationsTotal,
        )}
        {renderPanel(
          'สต๊อกคงเหลือ',
          (m, c) => m.availableByColor[c],
          (m) => m.availableTotal,
        )}
        {renderPanel(
          'ยอดที่ต้องสั่งซื้อ',
          (m, c) => m.requiredByColor[c],
          (m) => m.requiredTotal,
          (n) => (n > 0 ? 'bg-orange-50 text-orange-800' : ''),
        )}

        {data.unassignedReservations > 0 && (
          <div className="bg-yellow-50 border border-yellow-200 rounded p-3 text-sm text-yellow-800">
            มีการจองที่ยังไม่ได้ระบุรุ่นรถ {data.unassignedReservations} รายการ (ไม่แสดงในตาราง)
          </div>
        )}
      </div>
    </MainLayout>
  );
}
