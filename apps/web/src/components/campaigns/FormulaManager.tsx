import { formulaSubsidyAmount, sumCampaignSubsidies } from '@car-stock/shared/formulas';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Calculator, Edit, Plus, Save, Trash2, X } from 'lucide-react';
import type React from 'react';
import { useState } from 'react';
import { campaignService } from '../../services/campaign.service';
import type {
  CampaignFormula,
  CreateFormulaData,
  VehicleModelSummary,
} from '../../services/campaign.service';
import { FORMULA_PRESETS, describeFormula, operatorToKind, priceTargetLabel } from './formulaText';

const fmt = (n: number) => n.toLocaleString('th-TH', { maximumFractionDigits: 2 });

interface FormulaFormProps {
  formData: CreateFormulaData;
  setFormData: React.Dispatch<React.SetStateAction<CreateFormulaData>>;
  onSubmit: () => void;
  onCancel: () => void;
  submitLabel: string;
  isPending: boolean;
  vehicleModel: VehicleModelSummary;
}

const FormulaForm: React.FC<FormulaFormProps> = ({
  formData,
  setFormData,
  onSubmit,
  onCancel,
  submitLabel,
  isPending,
  vehicleModel,
}) => {
  // Keep the value as raw text while typing so it can be cleared and accept decimals.
  const [valueText, setValueText] = useState(() =>
    Number.isFinite(formData.value) && formData.value !== 0 ? String(formData.value) : ''
  );

  const handleValueChange = (raw: string) => {
    if (raw !== '' && !/^\d*\.?\d*$/.test(raw)) return; // digits + one dot only
    setValueText(raw);
    const n = Number.parseFloat(raw);
    setFormData((prev) => ({ ...prev, value: Number.isFinite(n) ? n : 0 }));
  };

  const isPercent = operatorToKind(formData.operator) === 'PERCENT';
  const valNum = Number.isFinite(formData.value) ? formData.value : 0;

  const cost = Number(vehicleModel.standardCost);
  const selling = Number(vehicleModel.price);
  const base = formData.priceTarget === 'COST_PRICE' ? cost : selling;
  const hasBase = Number.isFinite(base) && base > 0;
  const amount = formulaSubsidyAmount(formData.operator, valNum, formData.priceTarget, {
    cost: Number.isFinite(cost) ? cost : 0,
    selling: Number.isFinite(selling) ? selling : 0,
  });

  // Radio group names must be unique per model so multiple open editors don't collide.
  const kindName = `kind-${vehicleModel.id}`;
  const baseName = `base-${vehicleModel.id}`;

  return (
    <div className="bg-gray-50 rounded-lg p-4 space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">ชื่อรายการ</label>
        <input
          type="text"
          value={formData.name}
          onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          placeholder="เช่น เปิดบูธ, Marketing, ค่าขนส่ง"
        />
      </div>

      {/* คิดจาก: % ของราคา หรือ จำนวนเงินคงที่ */}
      <div className="flex flex-wrap items-center gap-4 text-base">
        <span className="text-gray-700">คิดจาก:</span>
        <label className="inline-flex items-center gap-1.5 cursor-pointer">
          <input
            type="radio"
            name={kindName}
            checked={isPercent}
            onChange={() => setFormData((prev) => ({ ...prev, operator: 'PERCENT' }))}
          />
          <span>% ของราคา</span>
        </label>
        <label className="inline-flex items-center gap-1.5 cursor-pointer">
          <input
            type="radio"
            name={kindName}
            checked={!isPercent}
            onChange={() => setFormData((prev) => ({ ...prev, operator: 'FIXED' }))}
          />
          <span>จำนวนเงินคงที่</span>
        </label>
      </div>

      {/* ฐาน (เฉพาะแบบ %) */}
      {isPercent && (
        <div className="flex flex-wrap items-center gap-4 text-base">
          <span className="text-gray-700">ฐาน:</span>
          <label className="inline-flex items-center gap-1.5 cursor-pointer">
            <input
              type="radio"
              name={baseName}
              checked={formData.priceTarget === 'SELLING_PRICE'}
              onChange={() => setFormData((prev) => ({ ...prev, priceTarget: 'SELLING_PRICE' }))}
            />
            <span>ราคาขาย</span>
          </label>
          <label className="inline-flex items-center gap-1.5 cursor-pointer">
            <input
              type="radio"
              name={baseName}
              checked={formData.priceTarget === 'COST_PRICE'}
              onChange={() => setFormData((prev) => ({ ...prev, priceTarget: 'COST_PRICE' }))}
            />
            <span>ราคาทุน</span>
          </label>
        </div>
      )}

      {/* ค่า */}
      <div className="flex items-center gap-2">
        <span className="text-gray-700">{isPercent ? 'เปอร์เซ็นต์:' : 'จำนวนเงิน:'}</span>
        <div className="relative">
          <input
            type="text"
            inputMode="decimal"
            value={valueText}
            onChange={(e) => handleValueChange(e.target.value)}
            className="w-32 px-3 py-2 pr-9 border border-gray-300 rounded-lg text-base focus:ring-2 focus:ring-blue-500"
            placeholder="0"
          />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-400 font-medium">
            {isPercent ? '%' : '฿'}
          </span>
        </div>
      </div>

      {/* ตัวอย่างค่าใช้จ่ายต่อคัน */}
      <div className="rounded-lg bg-purple-50 px-4 py-3 text-purple-900">
        {!isPercent ? (
          <div className="flex flex-wrap items-baseline gap-x-2">
            <span className="text-sm text-purple-700">จำนวนเงินคงที่</span>
            <span className="text-lg font-bold">{fmt(valNum)} บาท</span>
          </div>
        ) : hasBase ? (
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <span className="text-sm">
              {valNum}% ของ{priceTargetLabel(formData.priceTarget)} {fmt(base)}
            </span>
            <span className="text-sm text-purple-700">=</span>
            <span className="text-lg font-bold">{fmt(amount)} บาท</span>
          </div>
        ) : (
          <div className="text-sm text-purple-700">
            รุ่นนี้ยังไม่ได้ตั้ง{priceTargetLabel(formData.priceTarget)} จึงยังไม่แสดงตัวอย่างเป็นตัวเลข
          </div>
        )}
      </div>

      <div className="flex gap-2 justify-end">
        <button
          onClick={onCancel}
          className="px-3 py-2 text-sm text-gray-600 hover:bg-gray-200 rounded-lg transition-colors"
        >
          <X className="w-4 h-4 inline mr-1" />
          ยกเลิก
        </button>
        <button
          onClick={onSubmit}
          disabled={!formData.name.trim() || isPending}
          className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          <Save className="w-4 h-4 inline mr-1" />
          {submitLabel}
        </button>
      </div>
    </div>
  );
};

interface FormulaManagerProps {
  campaignId: string;
  vehicleModel: VehicleModelSummary;
}

const EMPTY_FORM: CreateFormulaData = {
  name: '',
  operator: 'PERCENT',
  value: 0,
  priceTarget: 'SELLING_PRICE',
};

export const FormulaManager: React.FC<FormulaManagerProps> = ({ campaignId, vehicleModel }) => {
  const queryClient = useQueryClient();
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<CreateFormulaData>(EMPTY_FORM);

  const queryKey = ['campaign-formulas', campaignId, vehicleModel.id];

  const { data: formulas = [], isLoading } = useQuery({
    queryKey,
    queryFn: () => campaignService.getFormulas(campaignId, vehicleModel.id),
  });

  const createMutation = useMutation({
    mutationFn: (data: CreateFormulaData) =>
      campaignService.createFormula(campaignId, vehicleModel.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      resetForm();
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<CreateFormulaData> }) =>
      campaignService.updateFormula(campaignId, vehicleModel.id, id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      setEditingId(null);
      resetForm();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (formulaId: string) =>
      campaignService.deleteFormula(campaignId, vehicleModel.id, formulaId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
    },
  });

  const resetForm = () => {
    setFormData(EMPTY_FORM);
    setIsAdding(false);
    setEditingId(null);
  };

  const handleCreate = () => {
    if (!formData.name.trim()) return;
    createMutation.mutate(formData);
  };

  const handleUpdate = (id: string) => {
    if (!formData.name.trim()) return;
    updateMutation.mutate({ id, data: formData });
  };

  const startEdit = (formula: CampaignFormula) => {
    setEditingId(formula.id);
    setIsAdding(false);
    setFormData({
      name: formula.name,
      operator: formula.operator,
      value: formula.value,
      priceTarget: formula.priceTarget,
    });
  };

  const startWithPreset = (preset: (typeof FORMULA_PRESETS)[number]) => {
    setEditingId(null);
    setIsAdding(true);
    setFormData({
      name: preset.defaultName,
      operator: preset.operator,
      value: preset.value,
      priceTarget: preset.priceTarget,
    });
  };

  const bases = {
    cost: Number(vehicleModel.standardCost) || 0,
    selling: Number(vehicleModel.price) || 0,
  };

  return (
    <div className="border border-gray-200 rounded-lg">
      <div className="flex items-center justify-between p-4 bg-gray-50 rounded-t-lg border-b">
        <div className="flex items-center gap-2">
          <Calculator className="w-5 h-5 text-purple-600" />
          <h3 className="font-medium text-gray-900">
            {vehicleModel.brand} {vehicleModel.model} {vehicleModel.variant || ''}
          </h3>
          <span className="text-xs text-gray-500 bg-gray-200 px-2 py-0.5 rounded-full">
            {formulas.length} รายการ
          </span>
        </div>
        {!isAdding && !editingId && (
          <button
            onClick={() => {
              setIsAdding(true);
              setEditingId(null);
              setFormData(EMPTY_FORM);
            }}
            className="flex items-center gap-1 px-3 py-1.5 text-sm bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
          >
            <Plus className="w-4 h-4" />
            เพิ่มรายการ
          </button>
        )}
      </div>

      <p className="px-4 pt-3 text-xs text-gray-500">รายการค่าใช้จ่ายแต่ละรายการต่อคัน</p>

      {!isAdding && !editingId && (
        <div className="flex flex-wrap gap-2 px-4 pt-2 pb-1">
          <span className="text-xs text-gray-500 self-center">แนะนำ:</span>
          {FORMULA_PRESETS.map((p) => (
            <button
              key={p.label}
              onClick={() => startWithPreset(p)}
              className="px-3 py-1.5 text-sm rounded-full border border-purple-200 text-purple-700 bg-purple-50 hover:bg-purple-100 transition-colors"
            >
              {p.label}
            </button>
          ))}
        </div>
      )}

      <div className="p-4 space-y-3">
        {isLoading && <div className="text-center text-sm text-gray-500 py-4">กำลังโหลด...</div>}

        {!isLoading && formulas.length === 0 && !isAdding && (
          <div className="text-center py-6">
            <p className="text-sm text-gray-500 mb-3">ยังไม่มีรายการค่าใช้จ่ายสำหรับรุ่นนี้</p>
            <button
              onClick={() => {
                setIsAdding(true);
                setEditingId(null);
                setFormData(EMPTY_FORM);
              }}
              className="inline-flex items-center gap-1 px-4 py-2 text-sm bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
            >
              <Plus className="w-4 h-4" />
              เพิ่มรายการแรก
            </button>
          </div>
        )}

        {formulas.map((formula) => (
          <div key={formula.id}>
            {editingId === formula.id ? (
              <FormulaForm
                formData={formData}
                setFormData={setFormData}
                onSubmit={() => handleUpdate(formula.id)}
                onCancel={resetForm}
                submitLabel="บันทึก"
                isPending={updateMutation.isPending}
                vehicleModel={vehicleModel}
              />
            ) : (
              <div className="flex items-center gap-3 p-3 bg-white border border-gray-200 rounded-lg hover:shadow-sm transition-shadow">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-gray-900 text-sm">{formula.name}</span>
                    {operatorToKind(formula.operator) === 'PERCENT' && (
                      <span
                        className={`px-2 py-0.5 text-xs rounded-full ${
                          formula.priceTarget === 'COST_PRICE'
                            ? 'bg-orange-100 text-orange-700'
                            : 'bg-blue-100 text-blue-700'
                        }`}
                      >
                        {priceTargetLabel(formula.priceTarget)}
                      </span>
                    )}
                  </div>
                  <div className="text-sm text-gray-700 mt-0.5">
                    {describeFormula(formula.operator, formula.value, formula.priceTarget)}
                  </div>
                </div>

                <div className="text-base font-semibold text-purple-700 whitespace-nowrap">
                  {fmt(
                    formulaSubsidyAmount(
                      formula.operator,
                      formula.value,
                      formula.priceTarget,
                      bases
                    )
                  )}{' '}
                  บาท
                </div>

                <div className="flex items-center gap-1">
                  <button
                    onClick={() => startEdit(formula)}
                    className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                  >
                    <Edit className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => {
                      if (confirm('ต้องการลบรายการนี้?')) {
                        deleteMutation.mutate(formula.id);
                      }
                    }}
                    disabled={deleteMutation.isPending}
                    className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}

        {formulas.length > 0 && (
          <div className="mt-2 flex items-baseline justify-between border-t border-gray-200 pt-2">
            <span className="text-sm text-gray-600">รวมต้องเบิกต่อคัน</span>
            <span className="text-lg font-bold text-purple-700">
              {fmt(
                sumCampaignSubsidies(
                  formulas.map((f) => ({
                    operator: f.operator,
                    value: f.value,
                    priceTarget: f.priceTarget,
                  })),
                  bases
                )
              )}{' '}
              บาท
            </span>
          </div>
        )}

        {isAdding && (
          <FormulaForm
            formData={formData}
            setFormData={setFormData}
            onSubmit={handleCreate}
            onCancel={resetForm}
            submitLabel="เพิ่ม"
            isPending={createMutation.isPending}
            vehicleModel={vehicleModel}
          />
        )}
      </div>
    </div>
  );
};

export default FormulaManager;
