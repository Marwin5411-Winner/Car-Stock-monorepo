import { useState } from 'react';
import { DatePicker } from '../../components/ui/date-picker';
import type { BulkInterestResult, InterestSummary } from '../../services/interest.service';
import { todayIso } from './interestActions';
import {
  BULK_INTEREST_CLIENT_LIMIT,
  isEntireFilteredLot,
  type PrincipalChoice,
} from './buildBulkInterestPayload';

export type BulkInterestMode = 'stop' | 'rate';

export type BulkInterestFormState = {
  date: string;
  notes: string;
  rate: string;
  principalBase: PrincipalChoice;
  perRowRates: boolean;
  rowRates: Record<string, string>;
  rowBases: Record<string, PrincipalChoice>;
};

type Props = {
  mode: BulkInterestMode;
  selectedCount: number;
  selectAllMatching: boolean;
  total: number;
  selectedItems: Record<string, InterestSummary>;
  selectedIds: string[];
  submitting: boolean;
  result: BulkInterestResult | null;
  onClose: () => void;
  onConfirm: (form: BulkInterestFormState) => void;
};

export function BulkInterestDialog({
  mode,
  selectedCount,
  selectAllMatching,
  total,
  selectedItems,
  selectedIds,
  submitting,
  result,
  onClose,
  onConfirm,
}: Props) {
  const [date, setDate] = useState(todayIso());
  const [notes, setNotes] = useState('');
  const [rate, setRate] = useState('');
  const [principalBase, setPrincipalBase] = useState<PrincipalChoice>('KEEP');
  const [perRowRates, setPerRowRates] = useState(false);
  const [rowRates, setRowRates] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      Object.values(selectedItems).map((item) => [
        item.stockId,
        item.currentRate ? String(item.currentRate) : '',
      ])
    )
  );
  const [rowBases, setRowBases] = useState<Record<string, PrincipalChoice>>(() =>
    Object.fromEntries(Object.values(selectedItems).map((item) => [item.stockId, 'KEEP' as const]))
  );
  const [armed, setArmed] = useState(false);
  const [allStopChecked, setAllStopChecked] = useState(false);

  const overLimit = selectedCount > BULK_INTEREST_CLIENT_LIMIT;
  const showAllStopConfirm = mode === 'stop' && isEntireFilteredLot(selectAllMatching, selectedCount, total);

  const resetArm = () => {
    setArmed(false);
    setAllStopChecked(false);
  };

  const form: BulkInterestFormState = {
    date,
    notes,
    rate,
    principalBase,
    perRowRates,
    rowRates,
    rowBases,
  };

  const confirmDisabled =
    submitting ||
    overLimit ||
    (mode === 'rate' && !perRowRates && !rate) ||
    (armed && showAllStopConfirm && !allStopChecked);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-xl max-h-[90vh] overflow-y-auto rounded-xl bg-white p-6 shadow-xl">
        <h2 className="text-lg font-semibold text-gray-900 mb-1">
          {mode === 'stop' ? 'หยุดคิดดอกเบี้ยเป็นชุด' : 'เริ่ม/ตั้งดอกเบี้ยใหม่เป็นชุด'}
        </h2>
        <p className="text-sm text-gray-600 mb-4">
          จะทำกับ {selectedCount} คัน
          {selectAllMatching ? ' ตามผลลัพธ์ที่กรองอยู่' : ''}
        </p>

        {mode === 'rate' && (
          <p className="text-sm text-gray-600 -mt-2 mb-4">
            รถที่หยุดคิดดอกเบี้ยอยู่จะถูกเริ่มคิดใหม่ตามอัตราและวันที่ด้านล่าง
          </p>
        )}

        {overLimit && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            ทำได้สูงสุด {BULK_INTEREST_CLIENT_LIMIT} คันต่อครั้ง (เลือกอยู่ {selectedCount} คัน)
            กรองให้แคบลงหรือเลือกทีละชุด
          </div>
        )}

        <label className="block text-sm font-medium text-gray-800 mb-1">
          {mode === 'stop' ? 'วันที่หยุด' : 'วันเริ่มงวดใหม่'}
        </label>
        <DatePicker
          value={date}
          onChange={(value) => {
            resetArm();
            setDate(value);
          }}
          maxDate={todayIso()}
        />

        {mode === 'rate' && (
          <>
            <label className="block text-sm font-medium text-gray-800 mt-4 mb-1">
              อัตราดอกเบี้ยใหม่ (% ต่อปี)
            </label>
            <input
              type="number"
              min={0}
              max={100}
              step="0.01"
              value={rate}
              onChange={(e) => {
                resetArm();
                setRate(e.target.value);
              }}
              disabled={perRowRates}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg disabled:bg-gray-50"
              placeholder="เช่น 1.25"
            />
            {!perRowRates && (
              <>
                <p className="block text-sm font-medium text-gray-800 mt-4 mb-2">
                  ฐานเงินต้นในการคำนวณ
                </p>
                <div className="space-y-2">
                  {(
                    [
                      ['KEEP', 'ฐานของรายการนั้นๆ', 'คงทุนฐานหรือต้นทุนรวมตามที่แต่ละคันใช้อยู่'],
                      ['BASE_COST_ONLY', 'ทุนฐานเท่านั้น', 'คิดจากราคาทุนฐานของแต่ละคัน'],
                      [
                        'TOTAL_COST',
                        'ต้นทุนรวม',
                        'คิดจากทุนฐาน + ค่าขนส่ง + อุปกรณ์ + ค่าใช้จ่ายอื่น ของแต่ละคัน',
                      ],
                    ] as const
                  ).map(([value, title, hint]) => (
                    <label
                      key={value}
                      className="flex items-start p-3 border rounded-lg cursor-pointer hover:bg-gray-50"
                    >
                      <input
                        type="radio"
                        name="bulkPrincipalBase"
                        className="mt-1 mr-3"
                        checked={principalBase === value}
                        onChange={() => {
                          resetArm();
                          setPrincipalBase(value);
                        }}
                      />
                      <div>
                        <div className="font-medium text-gray-900">{title}</div>
                        <div className="text-sm text-gray-500">{hint}</div>
                      </div>
                    </label>
                  ))}
                </div>
              </>
            )}
            {!selectAllMatching && (
              <label className="mt-2 flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={perRowRates}
                  onChange={(e) => {
                    resetArm();
                    setPerRowRates(e.target.checked);
                  }}
                />
                ใส่อัตรารายคัน
              </label>
            )}
            {perRowRates && (
              <div className="mt-3 border rounded-lg divide-y max-h-48 overflow-y-auto">
                {Object.values(selectedItems)
                  .filter((item) => selectedIds.includes(item.stockId))
                  .map((item) => (
                    <div
                      key={item.stockId}
                      className="flex flex-wrap items-center justify-between gap-2 px-3 py-2"
                    >
                      <span className="text-sm text-gray-700 truncate min-w-0 flex-1">
                        {item.vehicleModel.brand} {item.vehicleModel.model} · {item.vin}
                      </span>
                      <input
                        type="number"
                        min={0}
                        max={100}
                        step="0.01"
                        value={rowRates[item.stockId] ?? ''}
                        onChange={(e) => {
                          resetArm();
                          setRowRates((prev) => ({ ...prev, [item.stockId]: e.target.value }));
                        }}
                        className="w-20 px-2 py-1 border border-gray-300 rounded"
                      />
                      <select
                        value={rowBases[item.stockId] ?? 'KEEP'}
                        onChange={(e) => {
                          resetArm();
                          setRowBases((prev) => ({
                            ...prev,
                            [item.stockId]: e.target.value as PrincipalChoice,
                          }));
                        }}
                        className="px-2 py-1 border border-gray-300 rounded text-sm"
                      >
                        <option value="KEEP">ฐานของรายการนั้นๆ</option>
                        <option value="BASE_COST_ONLY">ทุนฐาน</option>
                        <option value="TOTAL_COST">ต้นทุนรวม</option>
                      </select>
                    </div>
                  ))}
              </div>
            )}
          </>
        )}

        <label className="block text-sm font-medium text-gray-800 mt-4 mb-1">หมายเหตุ</label>
        <textarea
          value={notes}
          onChange={(e) => {
            resetArm();
            setNotes(e.target.value);
          }}
          rows={2}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg"
          placeholder="เช่น หมดโปรโมชัน สลับเป็นเดือนต่อเดือน"
        />

        {result && (
          <div className="mt-4 text-sm space-y-1 bg-gray-50 rounded-lg p-3">
            <p className="text-green-700">สำเร็จ {result.applied.length} คัน</p>
            <p className="text-yellow-700">ข้าม {result.skipped.length} คัน</p>
            <p className="text-red-700">ไม่สำเร็จ {result.errors.length} คัน</p>
            {[...result.skipped, ...result.errors].slice(0, 8).map((row) => (
              <p key={row.stockId} className="text-gray-600">
                {row.vin || row.stockId}: {row.reason}
              </p>
            ))}
          </div>
        )}

        {armed && !result && (
          <div className="mt-4 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            {mode === 'stop'
              ? `จะหยุดคิดดอกเบี้ย ${selectedCount} คัน วันที่ ${date || '-'}`
              : `จะตั้งดอกเบี้ยใหม่ ${selectedCount} คัน${perRowRates ? ' (อัตราและฐานรายคัน)' : ` อัตรา ${rate}% ฐาน${principalBase === 'KEEP' ? 'ของรายการนั้นๆ' : principalBase === 'TOTAL_COST' ? 'ต้นทุนรวม' : 'ทุนฐาน'}`} วันมีผล ${date || '-'}`}
            {selectAllMatching ? ' ตามผลลัพธ์ที่กรองอยู่' : ''} — กดยืนยันอีกครั้งถ้าถูกต้อง
          </div>
        )}

        {armed && showAllStopConfirm && !result && (
          <label className="mt-3 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={allStopChecked}
              onChange={(e) => setAllStopChecked(e.target.checked)}
            />
            <span>ต้องการหยุดคิดดอกเบี้ยทั้งหมด {selectedCount} คัน ใช่ไหม</span>
          </label>
        )}

        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg border border-gray-200 text-sm"
          >
            ปิด
          </button>
          {!result && (
            <button
              type="button"
              disabled={confirmDisabled}
              onClick={() => {
                if (!armed) {
                  setArmed(true);
                  return;
                }
                onConfirm(form);
              }}
              className={`px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-40 ${
                armed
                  ? 'bg-red-600 text-white hover:bg-red-700'
                  : 'bg-blue-600 text-white hover:bg-blue-700'
              }`}
            >
              {submitting
                ? 'กำลังทำ...'
                : armed
                  ? `ยืนยันทำกับ ${selectedCount} คัน`
                  : 'ดำเนินการต่อ'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
