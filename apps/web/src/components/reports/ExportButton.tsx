import { Download } from 'lucide-react';
import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';

interface ExportHeader {
  key: string;
  label: string;
}

interface ExportButtonProps<T extends object> {
  data: T[];
  filename: string;
  sheetName?: string;
  headers?: ExportHeader[];
  loading?: boolean;
}

function formatDateForFilename(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}${month}${day}`;
}

export function ExportButton<T extends object>({
  data,
  filename,
  sheetName = 'รายงาน',
  headers,
  loading = false,
}: ExportButtonProps<T>) {
  const handleExport = () => {
    if (data?.length === 0) {
      alert('ไม่มีข้อมูลสำหรับ Export');
      return;
    }

    let exportData: Record<string, unknown>[] = data as unknown as Record<string, unknown>[];

    // If headers are provided, map the data to use Thai labels
    if (headers && headers.length > 0) {
      exportData = data.map((row) => {
        const newRow: Record<string, unknown> = {};
        const rowObj = row as Record<string, unknown>;
        headers.forEach(({ key, label }) => {
          newRow[label] = rowObj[key];
        });
        return newRow;
      });
    }

    // Create workbook and worksheet
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(exportData);

    // Auto-width columns
    const colWidths = Object.keys(exportData[0] || {}).map((key) => {
      const maxLength = Math.max(
        key.length,
        ...exportData.map((row) => String(row[key] ?? '').length)
      );
      return { wch: Math.min(maxLength + 2, 50) };
    });
    ws['!cols'] = colWidths;

    XLSX.utils.book_append_sheet(wb, ws, sheetName);

    // Generate buffer and save
    const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([excelBuffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });

    saveAs(blob, `${filename}_${formatDateForFilename(new Date())}.xlsx`);
  };

  return (
    <button
      type="button"
      onClick={handleExport}
      disabled={loading || data.length === 0}
      className="inline-flex items-center px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium transition-colors"
    >
      <Download className="w-4 h-4 mr-2" />
      Export Excel
    </button>
  );
}
