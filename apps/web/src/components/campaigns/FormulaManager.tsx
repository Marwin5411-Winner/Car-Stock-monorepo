import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { campaignService } from '../../services/campaign.service';
import type {
  CampaignFormula,
  CreateFormulaData,
  FormulaOperator,
  FormulaPriceTarget,
  VehicleModelSummary,
} from '../../services/campaign.service';
import {
  Plus,
  Trash2,
  Edit,
  GripVertical,
  ArrowUp,
  ArrowDown,
  Save,
  X,
  Calculator,
} from 'lucide-react';
import { applyFormulaStep } from '@car-stock/shared/formulas';
import {
  OPERATOR_OPTIONS,
  operatorUnitSuffix,
  priceTargetLabel,
  describeFormula,
} from './formulaText';

const operatorSymbols: Record<FormulaOperator, string> = {
  ADD: '+',
  SUBTRACT: '-',
  MULTIPLY: '×',
  PERCENT: '+',
  PERCENT_SUBTRACT: '-',
};

const isPercentOperator = (op: FormulaOperator): boolean =>
  op === 'PERCENT' || op === 'PERCENT_SUBTRACT';

const priceTargetLabels: Record<FormulaPriceTarget, string> = {
  COST_PRICE: 'ราคาทุน',
  SELLING_PRICE: 'ราคาขาย',
};

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
  // Keep the value as raw text while typing so it can be cleared and accept
  // decimals (coercing on every keystroke makes the field stick at 0).
  const [valueText, setValueText] = useState(() =>
    Number.isFinite(formData.value) && formData.value !== 0 ? String(formData.value) : ''
  );

  const handleValueChange = (raw: string) => {
    if (raw !== '' && !/^\d*\.?\d*$/.test(raw)) return; // digits + one dot only
    setValueText(raw);
    const n = parseFloat(raw);
    setFormData((prev) => ({ ...prev, value: Number.isFinite(n) ? n : 0 }));
  };

  const suffix = operatorUnitSuffix(formData.operator);
  const targetLabel = priceTargetLabel(formData.priceTarget);
  const valNum = Number.isFinite(formData.value) ? formData.value : 0;

  // Real-number preview against the model's actual price for the chosen target.
  const base =
    formData.priceTarget === 'COST_PRICE'
      ? Number(vehicleModel.standardCost)
      : Number(vehicleModel.price);
  const hasBase = Number.isFinite(base) && base > 0;
  const result = hasBase ? applyFormulaStep(base, formData.operator, valNum) : 0;
  const delta = result - base;
  const fmt = (n: number) => n.toLocaleString('th-TH', { maximumFractionDigits: 2 });

  return (
    <div className="bg-gray-50 rounded-lg p-4 space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">ตั้งชื่อสูตร</label>
        <input
          type="text"
          value={formData.name}
          onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          placeholder="เช่น ส่วนลดพิเศษ, คอมมิชชั่นเพิ่ม"
        />
      </div>

      {/* Sentence row: เอา [ราคา] มา [การกระทำ] [ค่า] */}
      <div className="flex flex-wrap items-end gap-2 text-base">
        <span className="pb-2 text-gray-700">เอา</span>
        <select
          value={formData.priceTarget}
          onChange={(e) =>
            setFormData((prev) => ({ ...prev, priceTarget: e.target.value as FormulaPriceTarget }))
          }
          className="px-3 py-2 border border-gray-300 rounded-lg text-base focus:ring-2 focus:ring-blue-500"
        >
          <option value="SELLING_PRICE">ราคาขาย</option>
          <option value="COST_PRICE">ราคาทุน</option>
        </select>
        <span className="pb-2 text-gray-700">มา</span>
        <select
          value={formData.operator}
          onChange={(e) =>
            setFormData((prev) => ({ ...prev, operator: e.target.value as FormulaOperator }))
          }
          className="px-3 py-2 border border-gray-300 rounded-lg text-base focus:ring-2 focus:ring-blue-500"
        >
          {OPERATOR_OPTIONS.map((o) => (
            <option key={o.operator} value={o.operator}>
              {o.label}
            </option>
          ))}
        </select>
        <div className="relative">
          <input
            type="text"
            inputMode="decimal"
            value={valueText}
            onChange={(e) => handleValueChange(e.target.value)}
            className="w-28 px-3 py-2 pr-9 border border-gray-300 rounded-lg text-base focus:ring-2 focus:ring-blue-500"
            placeholder="0"
          />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-400 font-medium">
            {suffix}
          </span>
        </div>
      </div>

      {/* Real-number live preview */}
      <div className="rounded-lg bg-purple-50 px-4 py-3 text-purple-900">
        {hasBase ? (
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <span className="text-sm">{targetLabel}</span>
            <span className="font-semibold">{fmt(base)}</span>
            <span className="text-sm text-purple-700">
              → {describeFormula(formData.operator, valNum, formData.priceTarget)} ({delta >= 0 ? '+' : ''}
              {fmt(delta)}) →
            </span>
            <span className="text-lg font-bold">{fmt(result)} บาท</span>
          </div>
        ) : (
          <div className="text-sm text-purple-700">
            รุ่นนี้ยังไม่ได้ตั้ง{targetLabel} จึงยังไม่แสดงตัวอย่างเป็นตัวเลข
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

export const FormulaManager: React.FC<FormulaManagerProps> = ({ campaignId, vehicleModel }) => {
  const queryClient = useQueryClient();
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<CreateFormulaData>({
    name: '',
    operator: 'ADD',
    value: 0,
    priceTarget: 'SELLING_PRICE',
  });

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

  const reorderMutation = useMutation({
    mutationFn: (items: { formulaId: string; sortOrder: number }[]) =>
      campaignService.reorderFormulas(campaignId, vehicleModel.id, items),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
    },
  });

  const resetForm = () => {
    setFormData({ name: '', operator: 'ADD', value: 0, priceTarget: 'SELLING_PRICE' });
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

  const handleMoveUp = (index: number) => {
    if (index === 0) return;
    const items = formulas.map((f, i) => ({
      formulaId: f.id,
      sortOrder:
        i === index
          ? formulas[index - 1].sortOrder
          : i === index - 1
            ? formulas[index].sortOrder
            : f.sortOrder,
    }));
    reorderMutation.mutate(items);
  };

  const handleMoveDown = (index: number) => {
    if (index === formulas.length - 1) return;
    const items = formulas.map((f, i) => ({
      formulaId: f.id,
      sortOrder:
        i === index
          ? formulas[index + 1].sortOrder
          : i === index + 1
            ? formulas[index].sortOrder
            : f.sortOrder,
    }));
    reorderMutation.mutate(items);
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
            {formulas.length} สูตร
          </span>
        </div>
        {!isAdding && !editingId && (
          <button
            onClick={() => {
              setIsAdding(true);
              setEditingId(null);
              setFormData({ name: '', operator: 'ADD', value: 0, priceTarget: 'SELLING_PRICE' });
            }}
            className="flex items-center gap-1 px-3 py-1.5 text-sm bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
          >
            <Plus className="w-4 h-4" />
            เพิ่มสูตร
          </button>
        )}
      </div>

      <div className="p-4 space-y-3">
        {isLoading && <div className="text-center text-sm text-gray-500 py-4">กำลังโหลด...</div>}

        {!isLoading && formulas.length === 0 && !isAdding && (
          <div className="text-center text-sm text-gray-500 py-4">
            ยังไม่มีสูตร — กดปุ่ม "เพิ่มสูตร" เพื่อเริ่มต้น
          </div>
        )}

        {formulas.map((formula, index) => (
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
                <div className="flex flex-col gap-0.5">
                  <button
                    onClick={() => handleMoveUp(index)}
                    disabled={index === 0 || reorderMutation.isPending}
                    className="p-0.5 text-gray-400 hover:text-gray-600 disabled:opacity-30"
                  >
                    <ArrowUp className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => handleMoveDown(index)}
                    disabled={index === formulas.length - 1 || reorderMutation.isPending}
                    className="p-0.5 text-gray-400 hover:text-gray-600 disabled:opacity-30"
                  >
                    <ArrowDown className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="flex items-center gap-1 text-xs text-gray-400">
                  <GripVertical className="w-4 h-4" />
                  <span>#{index + 1}</span>
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-gray-900 text-sm">{formula.name}</span>
                    <span
                      className={`px-2 py-0.5 text-xs rounded-full ${
                        formula.priceTarget === 'COST_PRICE'
                          ? 'bg-orange-100 text-orange-700'
                          : 'bg-blue-100 text-blue-700'
                      }`}
                    >
                      {priceTargetLabels[formula.priceTarget]}
                    </span>
                  </div>
                  <div className="text-sm text-gray-600 mt-0.5">
                    <span className="font-mono font-bold text-purple-600">
                      {operatorSymbols[formula.operator]}
                    </span>{' '}
                    {isPercentOperator(formula.operator)
                      ? `${formula.value}%`
                      : formula.value.toLocaleString('th-TH')}
                  </div>
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
                      if (confirm('ต้องการลบสูตรนี้?')) {
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
