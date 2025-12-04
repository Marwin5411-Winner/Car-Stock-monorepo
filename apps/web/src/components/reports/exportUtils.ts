import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';

interface ExportHeader {
  key: string;
  label: string;
}

interface SheetData {
  name: string;
  data: Record<string, unknown>[];
  headers?: ExportHeader[];
}

interface MultiSheetExportProps {
  sheets: SheetData[];
  filename: string;
}

/**
 * Export data to Excel with multiple sheets
 */
export function exportMultiSheet({ sheets, filename }: MultiSheetExportProps) {
  const wb = XLSX.utils.book_new();

  sheets.forEach(({ name, data, headers }) => {
    let exportData = data;

    if (headers && headers.length > 0) {
      exportData = data.map((row) => {
        const newRow: Record<string, unknown> = {};
        headers.forEach(({ key, label }) => {
          newRow[label] = row[key];
        });
        return newRow;
      });
    }

    const ws = XLSX.utils.json_to_sheet(exportData);

    // Auto-width columns
    if (exportData?.length > 0) {
      const colWidths = Object.keys(exportData[0]).map((key) => {
        const maxLength = Math.max(
          key.length,
          ...exportData.map((row) => String(row[key] ?? '').length)
        );
        return { wch: Math.min(maxLength + 2, 50) };
      });
      ws['!cols'] = colWidths;
    }

    XLSX.utils.book_append_sheet(wb, ws, name);
  });

  const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([excelBuffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });

  const now = new Date();
  const dateStr = now.toISOString().split('T')[0];
  saveAs(blob, `${filename}_${dateStr}.xlsx`);
}

interface SingleSheetExportProps {
  data: Record<string, unknown>[];
  filename: string;
  sheetName?: string;
  headers?: ExportHeader[];
}

/**
 * Export data to Excel with a single sheet
 */
export function exportToExcel({ data, filename, sheetName = 'รายงาน', headers }: SingleSheetExportProps) {
  exportMultiSheet({
    sheets: [{ name: sheetName, data, headers }],
    filename,
  });
}
