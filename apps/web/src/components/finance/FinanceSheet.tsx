import {
  computeFinanceSheet,
  getDocumentMapsForKey,
  withEditedValue,
  withResetKey,
  type FinanceSheetRow,
  type SystemFinanceKey,
} from '@car-stock/shared/finance';
import { Plus, RotateCcw, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn, formatCurrency } from '@/lib/utils';
import type { PaymentMode, SaleFinanceCustomLine } from '../../services/sales.service';
import { FinanceDocPanel } from './FinanceDocPanel';
import {
  engineInputToSheetValue,
  saleToEngineInput,
  type FinanceSheetValue,
} from './financeSheetHelpers';

export type { FinanceSheetValue };

export interface FinanceSheetProps {
  paymentMode: PaymentMode;
  carPrice: number;
  value: FinanceSheetValue;
  onChange: (next: FinanceSheetValue) => void;
  readOnly?: boolean;
  canEditDealerFields?: boolean;
  canEditDiscounts?: boolean;
  paidAmount?: number;
  remainingAmount?: number;
}

const PAYMENT_MODE_OPTIONS: { value: PaymentMode; label: string }[] = [
  { value: 'CASH', label: 'เงินสด' },
  { value: 'FINANCE', label: 'ไฟแนนซ์' },
  { value: 'MIXED', label: 'ผสม' },
];

const GROUP_LABELS: Record<string, string> = {
  CUSTOMER: 'ลูกค้า',
  DISCOUNT: 'ส่วนลด',
  FEE: 'ค่าธรรมเนียม',
  PAYMENT: 'ชำระ',
  FINANCE: 'ไฟแนนซ์',
  DEALER: 'ดีลเลอร์',
  SUMMARY: 'สรุป',
  CUSTOMER_CHARGE: 'คิดเพิ่ม',
  INFO: 'ข้อมูล',
};

const SOURCE_LABELS: Record<string, string> = {
  auto: 'auto',
  edit: 'edit',
  manual: 'manual',
};

function isTextKey(key: string) {
  return key === 'finance_provider';
}

function isPercentOrTermsKey(key: string) {
  return key === 'interest_rate' || key === 'number_of_terms';
}

/** car_price is driven by the carPrice prop — not editable in-sheet. */
function isSystemEditable(row: FinanceSheetRow) {
  return !row.isCustom && row.key !== 'car_price' && !isTextKey(row.key);
}

export function FinanceSheet({
  paymentMode,
  carPrice,
  value,
  onChange,
  readOnly = false,
  canEditDealerFields = true,
  canEditDiscounts = true,
  paidAmount,
  remainingAmount,
}: FinanceSheetProps) {
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const engineInput = useMemo(
    () => saleToEngineInput({ ...value, paymentMode }, carPrice),
    [value, paymentMode, carPrice]
  );

  const result = useMemo(() => computeFinanceSheet(engineInput), [engineInput]);

  const emitFromInput = (nextInput: ReturnType<typeof saleToEngineInput>) => {
    const nextResult = computeFinanceSheet(nextInput);
    onChange(engineInputToSheetValue(value, nextInput, nextResult));
  };

  const visibleRows = result.rows.filter((row) => {
    if (row.source === 'hidden') return false;
    if (row.group === 'DEALER' && !canEditDealerFields) return false;
    if (row.group === 'DISCOUNT' && !canEditDiscounts) return false;
    if (row.isCustom && row.group === 'DEALER' && !canEditDealerFields) return false;
    return true;
  });

  const selectedRow = selectedKey
    ? (result.rows.find((r) => r.key === selectedKey) ?? null)
    : null;

  const editedCount = engineInput.editedKeys.length;

  const rowDisabled = (row: FinanceSheetRow): boolean => {
    if (readOnly) return true;
    if (row.group === 'DEALER' && !canEditDealerFields) return true;
    if (row.key === 'car_price') return true;
    return false;
  };

  const handlePaymentMode = (mode: PaymentMode) => {
    if (readOnly || mode === paymentMode) return;
    // Soft-keep values but recompute salePatch for the new mode
    emitFromInput({ ...engineInput, paymentMode: mode });
  };

  const handleSystemAmount = (key: SystemFinanceKey, raw: string) => {
    const n = raw === '' ? 0 : Number(raw);
    if (!Number.isFinite(n)) return;
    emitFromInput(withEditedValue(engineInput, key, n));
  };

  const handleSystemText = (key: SystemFinanceKey, text: string) => {
    emitFromInput(withEditedValue(engineInput, key, text));
  };

  const handleReset = (key: string) => {
    emitFromInput(withResetKey(engineInput, key));
  };

  const handleCustomChange = (
    index: number,
    patch: Partial<Pick<SaleFinanceCustomLine, 'label' | 'amount'>>
  ) => {
    const lines = [...(engineInput.customLines as SaleFinanceCustomLine[])];
    const current = lines[index];
    if (!current) return;
    lines[index] = {
      ...current,
      ...patch,
      amount:
        patch.amount !== undefined
          ? Number.isFinite(patch.amount)
            ? patch.amount
            : current.amount
          : current.amount,
    };
    emitFromInput({ ...engineInput, customLines: lines });
  };

  const handleAddCustom = () => {
    if (readOnly) return;
    const lines: SaleFinanceCustomLine[] = [
      ...(engineInput.customLines as SaleFinanceCustomLine[]),
      { label: 'รายการใหม่', group: 'CUSTOMER_CHARGE', amount: 0 },
    ];
    emitFromInput({ ...engineInput, customLines: lines });
  };

  const handleRemoveCustom = (index: number) => {
    if (readOnly) return;
    const lines = (engineInput.customLines as SaleFinanceCustomLine[]).filter(
      (_, i) => i !== index
    );
    if (selectedKey) {
      const removedKey =
        (engineInput.customLines[index] as SaleFinanceCustomLine | undefined)?.key ??
        `custom:${(engineInput.customLines[index] as SaleFinanceCustomLine | undefined)?.id ?? index}`;
      if (selectedKey === removedKey) setSelectedKey(null);
    }
    emitFromInput({ ...engineInput, customLines: lines });
  };

  const formatDisplay = (row: FinanceSheetRow) => {
    if (isTextKey(row.key)) return row.textValue || '';
    if (row.key === 'interest_rate') return String(row.amount);
    if (row.key === 'number_of_terms') return String(row.amount);
    return String(row.amount);
  };

  const totalDisplay = result.totals.totalAmount;
  const paid = paidAmount ?? 0;
  const remaining =
    remainingAmount !== undefined
      ? remainingAmount
      : Math.max(0, totalDisplay + result.totals.buyerFees - paid);

  // Index custom rows against customLines for edit mapping
  const customKeyToIndex = useMemo(() => {
    const map = new Map<string, number>();
    engineInput.customLines.forEach((line, i) => {
      const key = line.key ?? `custom:${line.id ?? i}`;
      map.set(key, i);
    });
    return map;
  }, [engineInput.customLines]);

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-lg border border-gray-200 bg-gray-50 p-1">
          {PAYMENT_MODE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              disabled={readOnly}
              onClick={() => handlePaymentMode(opt.value)}
              className={cn(
                'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                paymentMode === opt.value
                  ? 'bg-white text-blue-700 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900',
                readOnly && 'cursor-not-allowed opacity-70'
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {paymentMode === 'CASH' && (
            <Badge variant="secondary" className="font-normal">
              กรอกง่าย
            </Badge>
          )}
          {editedCount > 0 && (
            <Badge variant="warning" className="font-normal">
              แก้ไข {editedCount} ฟิลด์
            </Badge>
          )}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
        {/* Main table */}
        <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50/80">
                <tr>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-gray-600">
                    รายการ
                  </th>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-gray-600">
                    กลุ่ม
                  </th>
                  <th className="px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-wider text-gray-600">
                    จำนวน
                  </th>
                  <th className="px-3 py-2.5 text-center text-xs font-semibold uppercase tracking-wider text-gray-600">
                    src
                  </th>
                  <th className="px-3 py-2.5 text-center text-xs font-semibold uppercase tracking-wider text-gray-600">
                    เอกสาร
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {visibleRows.map((row) => {
                  const disabled = rowDisabled(row);
                  const docCount = getDocumentMapsForKey(row.key).length;
                  const customIdx = row.isCustom ? customKeyToIndex.get(row.key) : undefined;

                  return (
                    <tr
                      key={row.key}
                      className={cn(
                        'transition-colors hover:bg-blue-50/40',
                        selectedKey === row.key && 'bg-blue-50/70'
                      )}
                    >
                      <td className="px-3 py-2 text-gray-900">
                        {row.isCustom && !disabled ? (
                          <div className="flex items-center gap-1">
                            <Input
                              value={row.label}
                              className="h-8 max-w-[200px]"
                              onChange={(e) =>
                                customIdx !== undefined &&
                                handleCustomChange(customIdx, { label: e.target.value })
                              }
                            />
                            {customIdx !== undefined && (
                              <button
                                type="button"
                                title="ลบรายการ"
                                className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600"
                                onClick={() => handleRemoveCustom(customIdx)}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>
                        ) : (
                          <span className="font-medium">{row.label}</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-gray-500">
                        {GROUP_LABELS[row.group] ?? row.group}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {disabled || (row.isCustom ? false : !isSystemEditable(row) && !isTextKey(row.key)) ? (
                          isTextKey(row.key) ? (
                            <span className="text-gray-800">{row.textValue || '—'}</span>
                          ) : isPercentOrTermsKey(row.key) ? (
                            <span className="tabular-nums text-gray-900">
                              {row.key === 'interest_rate'
                                ? `${row.amount}%`
                                : `${row.amount} เดือน`}
                            </span>
                          ) : (
                            <span className="tabular-nums font-medium text-gray-900">
                              {formatCurrency(row.amount)}
                            </span>
                          )
                        ) : row.isCustom && customIdx !== undefined ? (
                          <Input
                            type="number"
                            className="ml-auto h-8 w-32 text-right tabular-nums"
                            value={row.amount}
                            onChange={(e) =>
                              handleCustomChange(customIdx, {
                                amount: e.target.value === '' ? 0 : Number(e.target.value),
                              })
                            }
                          />
                        ) : isTextKey(row.key) ? (
                          <Input
                            className="ml-auto h-8 w-40 text-right"
                            value={row.textValue ?? ''}
                            placeholder="บริษัทไฟแนนซ์"
                            onChange={(e) =>
                              handleSystemText(row.key as SystemFinanceKey, e.target.value)
                            }
                          />
                        ) : (
                          <Input
                            type="number"
                            step={isPercentOrTermsKey(row.key) ? 'any' : '1'}
                            className="ml-auto h-8 w-32 text-right tabular-nums"
                            value={formatDisplay(row)}
                            onChange={(e) =>
                              handleSystemAmount(row.key as SystemFinanceKey, e.target.value)
                            }
                          />
                        )}
                      </td>
                      <td className="px-3 py-2 text-center">
                        <div className="inline-flex items-center gap-1">
                          <Badge
                            variant={
                              row.source === 'edit'
                                ? 'warning'
                                : row.source === 'auto'
                                  ? 'info'
                                  : 'secondary'
                            }
                            className="font-mono text-[10px] uppercase"
                          >
                            {SOURCE_LABELS[row.source] ?? row.source}
                          </Badge>
                          {row.source === 'edit' && !readOnly && (
                            <button
                              type="button"
                              title="รีเซ็ตค่าอัตโนมัติ"
                              className="rounded p-0.5 text-gray-500 hover:bg-gray-100 hover:text-blue-600"
                              onClick={() => handleReset(row.key)}
                            >
                              <RotateCcw className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-center">
                        <button
                          type="button"
                          onClick={() =>
                            setSelectedKey((k) => (k === row.key ? null : row.key))
                          }
                          className={cn(
                            'inline-flex min-w-[2rem] items-center justify-center rounded-full border px-2 py-0.5 text-xs font-semibold transition-colors',
                            selectedKey === row.key
                              ? 'border-blue-500 bg-blue-50 text-blue-700'
                              : 'border-gray-200 bg-white text-gray-600 hover:border-blue-300 hover:text-blue-600'
                          )}
                          title="ดูเอกสารที่เกี่ยวข้อง"
                        >
                          {docCount}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {!readOnly && (
            <div className="border-t border-gray-100 px-3 py-2">
              <Button type="button" variant="outline" size="sm" onClick={handleAddCustom}>
                <Plus className="h-4 w-4" />
                เพิ่มรายการ
              </Button>
            </div>
          )}

          {/* Footer totals */}
          <div className="grid grid-cols-3 gap-2 border-t border-gray-200 bg-gray-50 px-4 py-3 text-sm">
            <div>
              <div className="text-xs text-gray-500">ยอดรวม</div>
              <div className="font-semibold tabular-nums text-gray-900">
                {formatCurrency(totalDisplay)}
              </div>
            </div>
            <div>
              <div className="text-xs text-gray-500">ชำระแล้ว</div>
              <div className="font-semibold tabular-nums text-green-600">
                {formatCurrency(paid)}
              </div>
            </div>
            <div>
              <div className="text-xs text-gray-500">ค้าง</div>
              <div className="font-semibold tabular-nums text-red-600">
                {formatCurrency(remaining)}
              </div>
            </div>
          </div>
        </div>

        {/* Side panel */}
        <FinanceDocPanel row={selectedRow} onClose={() => setSelectedKey(null)} />
      </div>
    </div>
  );
}
