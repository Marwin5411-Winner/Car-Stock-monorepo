import React, { useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { campaignService } from '../../services/campaign.service';
import type { CampaignReportGroup, FormulaOperator } from '../../services/campaign.service';
import { ArrowLeft, Printer } from 'lucide-react';

const operatorSymbols: Record<FormulaOperator, string> = {
  ADD: '+',
  SUBTRACT: '-',
  MULTIPLY: '×',
  PERCENT: '%',
};

const formatCurrency = (value: number) => {
  return value.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const formatDate = (dateString: string | null | undefined) => {
  if (!dateString) return '-';
  return new Date(dateString).toLocaleDateString('th-TH', {
    day: 'numeric',
    month: 'numeric',
    year: '2-digit',
  });
};

const formatDateLong = (dateString: string) => {
  return new Date(dateString).toLocaleDateString('th-TH', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
};

const ReportTable: React.FC<{ group: CampaignReportGroup; allGroups: CampaignReportGroup[] }> = ({ group, allGroups }) => {
  const modelName = `${group.vehicleModel.brand} ${group.vehicleModel.model} ${group.vehicleModel.variant || ''}`.trim();

  return (
    <div className="report-group mb-6">
      <div className="bg-gray-100 px-3 py-2 border border-gray-300 border-b-0">
        <h3 className="font-bold text-sm">
          กลุ่มรุ่น: {modelName} ({group.vehicleModel.year}) — จำนวน {group.totalSales} คัน
        </h3>
      </div>
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr className="bg-gray-50">
            <th className="border border-gray-300 px-2 py-1.5 text-center w-8" rowSpan={2}>ลำดับ</th>
            <th className="border border-gray-300 px-2 py-1.5 text-center" rowSpan={2}>ชื่อ-สกุล (ลูกค้า)</th>
            <th className="border border-gray-300 px-2 py-1.5 text-center" rowSpan={2}>เลขเครื่อง</th>
            <th className="border border-gray-300 px-2 py-1.5 text-center" rowSpan={2}>แบบรถ</th>
            <th className="border border-gray-300 px-2 py-1.5 text-center" rowSpan={2}>เลขตัวรถ (VIN)</th>
            <th className="border border-gray-300 px-2 py-1.5 text-center bg-yellow-50" rowSpan={2}>วันที่ขาย</th>
            <th className="border border-gray-300 px-2 py-1.5 text-center" rowSpan={2}>ไฟแนนท์</th>
            {/* Dynamic formula columns */}
            {group.formulas.length > 0 && (
              <th
                className="border border-gray-300 px-2 py-1.5 text-center bg-green-50"
                colSpan={group.formulas.length}
              >
                สูตรคำนวณ ({modelName})
              </th>
            )}
            {/* Dynamic vehicle model columns — show all models in campaign */}
            {allGroups.length > 1 && (
              <th
                className="border border-gray-300 px-2 py-1.5 text-center bg-blue-50"
                colSpan={allGroups.length}
              >
                STANDARD — ยอดตามรุ่น
              </th>
            )}
            <th className="border border-gray-300 px-2 py-1.5 text-center" rowSpan={2}>รวมรับเงิน</th>
            <th className="border border-gray-300 px-2 py-1.5 text-center" rowSpan={2}>วันที่แจ้งขาย</th>
            <th className="border border-gray-300 px-2 py-1.5 text-center" rowSpan={2}>ค่าใช้จ่าย<br/>การซื้อ/แลก</th>
          </tr>
          <tr className="bg-gray-50">
            {/* Formula sub-headers */}
            {group.formulas.map((f) => (
              <th key={f.id} className="border border-gray-300 px-1.5 py-1 text-center bg-green-50 whitespace-nowrap">
                {f.name}<br/>
                <span className="text-[10px] text-gray-500">
                  ({operatorSymbols[f.operator]}{f.operator === 'PERCENT' ? `${f.value}%` : formatCurrency(f.value)})
                  <br/>{f.priceTarget === 'COST_PRICE' ? 'ทุน' : 'ขาย'}
                </span>
              </th>
            ))}
            {/* Vehicle model sub-headers */}
            {allGroups.length > 1 && allGroups.map((g) => (
              <th key={g.vehicleModelId} className="border border-gray-300 px-1.5 py-1 text-center bg-blue-50 whitespace-nowrap">
                {g.vehicleModel.model}<br/>
                <span className="text-[10px] text-gray-500">{g.vehicleModel.variant || ''}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {group.sales.length === 0 ? (
            <tr>
              <td
                colSpan={7 + group.formulas.length + (allGroups.length > 1 ? allGroups.length : 0) + 3}
                className="border border-gray-300 px-2 py-4 text-center text-gray-400"
              >
                ไม่มีรายการขายในกลุ่มนี้
              </td>
            </tr>
          ) : (
            group.sales.map((sale, index) => (
              <tr key={sale.saleId} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                <td className="border border-gray-300 px-2 py-1 text-center">{index + 1}</td>
                <td className="border border-gray-300 px-2 py-1">{sale.customerName}</td>
                <td className="border border-gray-300 px-2 py-1 text-center font-mono text-[10px]">{sale.engineNumber}</td>
                <td className="border border-gray-300 px-2 py-1 text-center">{modelName}</td>
                <td className="border border-gray-300 px-2 py-1 text-center font-mono text-[10px]">{sale.vin}</td>
                <td className="border border-gray-300 px-2 py-1 text-center bg-yellow-50">{formatDate(sale.saleDate)}</td>
                <td className="border border-gray-300 px-2 py-1 text-center">{sale.financeProvider}</td>
                {/* Formula result cells */}
                {group.formulas.map((f) => {
                  const result = sale.formulaResults.find((r) => r.formulaId === f.id);
                  return (
                    <td key={f.id} className="border border-gray-300 px-2 py-1 text-right bg-green-50">
                      {result ? formatCurrency(result.resultValue) : '-'}
                    </td>
                  );
                })}
                {/* Vehicle model amount cells — show amount only in matching column */}
                {allGroups.length > 1 && allGroups.map((g) => (
                  <td key={g.vehicleModelId} className="border border-gray-300 px-2 py-1 text-right bg-blue-50">
                    {g.vehicleModelId === group.vehicleModelId ? formatCurrency(sale.totalAmount) : ''}
                  </td>
                ))}
                <td className="border border-gray-300 px-2 py-1 text-right font-medium">{formatCurrency(sale.totalAmount)}</td>
                <td className="border border-gray-300 px-2 py-1 text-center">{formatDate(sale.soldDate)}</td>
                <td className="border border-gray-300 px-2 py-1 text-right">
                  {sale.costPriceDiff !== 0 ? formatCurrency(Math.abs(sale.costPriceDiff)) : '0.00'}
                </td>
              </tr>
            ))
          )}
          {/* Group subtotal row */}
          {group.sales.length > 0 && (
            <tr className="bg-gray-100 font-bold">
              <td
                colSpan={7 + group.formulas.length}
                className="border border-gray-300 px-2 py-1.5 text-right"
              >
                รวม {modelName} ({group.totalSales} คัน):
              </td>
              {allGroups.length > 1 && allGroups.map((g) => (
                <td key={g.vehicleModelId} className="border border-gray-300 px-2 py-1.5 text-right bg-blue-50">
                  {g.vehicleModelId === group.vehicleModelId ? formatCurrency(group.totalAmount) : ''}
                </td>
              ))}
              <td className="border border-gray-300 px-2 py-1.5 text-right">{formatCurrency(group.totalAmount)}</td>
              <td className="border border-gray-300 px-2 py-1.5"></td>
              <td className="border border-gray-300 px-2 py-1.5 text-right">
                {formatCurrency(group.sales.reduce((sum, s) => sum + Math.abs(s.costPriceDiff), 0))}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
};

export const CampaignReportPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const printRef = useRef<HTMLDivElement>(null);

  const { data: report, isLoading, error } = useQuery({
    queryKey: ['campaign-report', id],
    queryFn: () => campaignService.getReport(id!),
    enabled: !!id,
  });

  const handlePrint = () => {
    window.print();
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center text-gray-600">กำลังโหลดรายงาน...</div>
      </div>
    );
  }

  if (error || !report) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center text-red-600">ไม่สามารถโหลดรายงานได้</div>
      </div>
    );
  }

  return (
    <>
      {/* Print Styles */}
      <style>{`
        @media print {
          @page {
            size: landscape;
            margin: 10mm;
          }
          body {
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          .no-print {
            display: none !important;
          }
          .print-content {
            padding: 0 !important;
          }
          .report-group {
            page-break-inside: avoid;
          }
        }
        @media screen {
          .print-content {
            max-width: 1400px;
            margin: 0 auto;
            padding: 24px;
          }
        }
      `}</style>

      {/* Screen-only controls */}
      <div className="no-print bg-white border-b px-6 py-3 flex items-center justify-between sticky top-0 z-10 shadow-sm">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate(`/campaigns/${id}`)}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-lg font-bold text-gray-900">รายงานแคมเปญ: {report.campaign.name}</h1>
            <p className="text-sm text-gray-500">
              {formatDateLong(report.campaign.startDate)} - {formatDateLong(report.campaign.endDate)}
            </p>
          </div>
        </div>
        <button
          onClick={handlePrint}
          className="flex items-center gap-2 bg-purple-600 text-white px-5 py-2.5 rounded-lg hover:bg-purple-700 transition-colors font-medium"
        >
          <Printer className="w-5 h-5" />
          พิมพ์รายงาน
        </button>
      </div>

      {/* Report Content */}
      <div className="print-content bg-white" ref={printRef}>
        {/* Report Header */}
        <div className="text-center mb-4">
          <h1 className="text-base font-bold">
            งานเบิกแคมเปญเงินส่งเสริมการขายประจำ {formatDateLong(report.campaign.endDate)}
          </h1>
          <h2 className="text-sm font-medium text-gray-700 mt-1">
            แคมเปญ: {report.campaign.name}
          </h2>
          <p className="text-xs text-gray-500 mt-0.5">
            ระยะเวลา: {formatDateLong(report.campaign.startDate)} - {formatDateLong(report.campaign.endDate)}
            {report.campaign.description && ` | ${report.campaign.description}`}
          </p>
        </div>

        {/* Summary Stats */}
        <div className="flex gap-6 mb-4 justify-center text-xs">
          <div className="bg-blue-50 px-4 py-2 rounded-lg text-center">
            <div className="text-blue-600 font-bold text-lg">{report.summary.totalSales}</div>
            <div className="text-gray-600">รวมยอดขาย (คัน)</div>
          </div>
          <div className="bg-green-50 px-4 py-2 rounded-lg text-center">
            <div className="text-green-600 font-bold text-lg">{report.summary.totalVehicleModels}</div>
            <div className="text-gray-600">รุ่นรถยนต์</div>
          </div>
          <div className="bg-purple-50 px-4 py-2 rounded-lg text-center">
            <div className="text-purple-600 font-bold text-lg">{formatCurrency(report.summary.totalAmount)}</div>
            <div className="text-gray-600">ยอดรวม (บาท)</div>
          </div>
        </div>

        {/* Report Tables — grouped by vehicle model */}
        {report.groups.map((group) => (
          <ReportTable key={group.vehicleModelId} group={group} allGroups={report.groups} />
        ))}

        {/* Grand Total */}
        <div className="mt-4 border-t-2 border-gray-400 pt-3">
          <table className="w-full text-xs">
            <tbody>
              <tr className="font-bold text-sm">
                <td className="px-2 py-2 text-right" style={{ width: '70%' }}>
                  รวมทั้งหมด ({report.summary.totalSales} คัน):
                </td>
                <td className="px-2 py-2 text-right">
                  {formatCurrency(report.summary.totalAmount)} บาท
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div className="mt-8 text-xs text-gray-500 flex justify-between">
          <div>
            สร้างโดย: {report.campaign.createdBy.firstName} {report.campaign.createdBy.lastName}
          </div>
          <div>
            พิมพ์เมื่อ: {new Date().toLocaleDateString('th-TH', {
              day: 'numeric',
              month: 'long',
              year: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            })}
          </div>
        </div>
      </div>
    </>
  );
};

export default CampaignReportPage;
