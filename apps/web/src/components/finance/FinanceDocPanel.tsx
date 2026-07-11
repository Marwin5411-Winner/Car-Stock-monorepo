import { Button } from '@/components/ui/button';
import { formatCurrency } from '@/lib/utils';
import {
  FINANCE_DOC_LABELS,
  type FinanceSheetRow,
  getDocumentMapsForKey,
} from '@car-stock/shared/finance';
import { FileText, X } from 'lucide-react';

export interface FinanceDocPanelProps {
  row: FinanceSheetRow | null;
  onClose: () => void;
}

function formatRowValue(row: FinanceSheetRow): string {
  if (row.textValue !== undefined) {
    return row.textValue || '—';
  }
  if (row.key === 'interest_rate') {
    return `${row.amount}%`;
  }
  if (row.key === 'number_of_terms') {
    return `${row.amount} เดือน`;
  }
  return formatCurrency(row.amount);
}

export function FinanceDocPanel({ row, onClose }: FinanceDocPanelProps) {
  if (!row) {
    return (
      <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50/80 p-4 text-sm text-gray-500">
        <div className="flex items-center gap-2 text-gray-600">
          <FileText className="h-4 w-4" />
          <span className="font-medium">ใช้ในเอกสาร</span>
        </div>
        <p className="mt-2">คลิกชิปเอกสารบนแถวเพื่อดูว่าฟิลด์นี้ไปปรากฏที่เอกสารใด</p>
      </div>
    );
  }

  const maps = getDocumentMapsForKey(row.key);
  const amountPreview = formatRowValue(row);

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2 text-gray-800">
            <FileText className="h-4 w-4 text-blue-600" />
            <span className="font-semibold">ใช้ในเอกสาร</span>
          </div>
          <p className="mt-1 text-sm text-gray-600">
            {row.label}
            <span className="mx-1 text-gray-300">·</span>
            <span className="font-medium text-gray-900">{amountPreview}</span>
          </p>
        </div>
        <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={onClose}>
          <X className="h-4 w-4" />
          <span className="sr-only">ปิด</span>
        </Button>
      </div>

      {maps.length === 0 ? (
        <p className="mt-3 text-sm text-gray-500">
          {row.isCustom
            ? 'รายการกำหนดเอง — ยังไม่ map ไปยังเอกสาร (หมายเหตุ)'
            : 'ยังไม่มีการ map ไปยังเอกสาร'}
        </p>
      ) : (
        <ul className="mt-3 space-y-2">
          {maps.map((m) => (
            <li
              key={`${m.doc}-${m.fieldLabel}`}
              className="rounded-md border border-gray-100 bg-gray-50 px-3 py-2 text-sm"
            >
              <div className="font-medium text-gray-900">{FINANCE_DOC_LABELS[m.doc] ?? m.doc}</div>
              <div className="mt-0.5 text-gray-600">
                ฟิลด์บนเอกสาร: <span className="font-medium">{m.fieldLabel}</span>
              </div>
              <div className="mt-0.5 text-gray-800">
                ค่า: <span className="font-semibold">{amountPreview}</span>
              </div>
              {m.note && <div className="mt-1 text-xs text-gray-500">{m.note}</div>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
