import { useEffect, useState } from 'react';
import { Plus, Trash2, Landmark, Save, X } from 'lucide-react';
import { useErrorHandler, useMutationHandler } from '../../hooks/useErrorHandler';
import {
  bankAccountsService,
  type BankAccount,
  type BankAccountInput,
} from '../../services/bank-accounts.service';

const emptyDraft: BankAccountInput = {
  bankName: '',
  accountNumber: '',
  accountName: '',
  branch: '',
  accountType: '',
  isActive: true,
  displayOrder: 0,
};

export default function BankAccountsSection() {
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState<BankAccountInput | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  const { execute: executeQuery } = useErrorHandler();
  const { execute: executeCreate } = useMutationHandler('เพิ่มบัญชีธนาคารสำเร็จ');
  const { execute: executeUpdate } = useMutationHandler('แก้ไขบัญชีธนาคารสำเร็จ');
  const { execute: executeDelete } = useMutationHandler('ลบบัญชีธนาคารสำเร็จ');

  const fetchAccounts = async () => {
    setLoading(true);
    await executeQuery(
      bankAccountsService.list(true).then((res) => {
        if (res.success && res.data) setAccounts(res.data);
      })
    );
    setLoading(false);
  };

  useEffect(() => {
    fetchAccounts();
  }, []);

  const handleStartAdd = () => {
    setEditingId(null);
    setDraft({ ...emptyDraft, displayOrder: accounts.length });
  };

  const handleStartEdit = (acc: BankAccount) => {
    setEditingId(acc.id);
    setDraft({
      bankName: acc.bankName,
      accountNumber: acc.accountNumber,
      accountName: acc.accountName,
      branch: acc.branch || '',
      accountType: acc.accountType || '',
      isActive: acc.isActive,
      displayOrder: acc.displayOrder,
    });
  };

  const handleCancel = () => {
    setDraft(null);
    setEditingId(null);
  };

  const handleSave = async () => {
    if (!draft) return;
    if (!draft.bankName.trim() || !draft.accountNumber.trim() || !draft.accountName.trim()) {
      return;
    }
    const op = editingId
      ? executeUpdate(bankAccountsService.update(editingId, draft))
      : executeCreate(bankAccountsService.create(draft));
    const result = await op;
    if (result) {
      handleCancel();
      fetchAccounts();
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('ลบบัญชีธนาคารนี้?')) return;
    const result = await executeDelete(bankAccountsService.remove(id));
    if (result) fetchAccounts();
  };

  const onDraftChange = (key: keyof BankAccountInput, value: string | boolean | number) => {
    setDraft((prev) => (prev ? { ...prev, [key]: value } : prev));
  };

  return (
    <section className="bg-white border border-gray-200 rounded-xl p-6 lg:p-8 space-y-4">
      <div className="flex items-center justify-between border-b pb-2">
        <h2 className="text-xl font-semibold text-gray-900 flex items-center gap-2">
          <Landmark className="w-5 h-5" />
          บัญชีธนาคาร (Bank Accounts)
        </h2>
        {!draft && (
          <button
            type="button"
            onClick={handleStartAdd}
            className="flex items-center gap-1.5 bg-blue-600 text-white px-3 py-1.5 rounded-lg hover:bg-blue-700 text-sm font-medium"
          >
            <Plus className="w-4 h-4" />
            เพิ่มบัญชี
          </button>
        )}
      </div>

      <p className="text-sm text-gray-500">
        บัญชีธนาคารที่เปิดใช้งานจะแสดงในใบเสร็จรับเงินทั้งหมด
      </p>

      {loading && <div className="text-sm text-gray-500">กำลังโหลด...</div>}

      {!loading && accounts.length === 0 && !draft && (
        <div className="text-sm text-gray-500 py-4 text-center border border-dashed rounded-lg">
          ยังไม่มีบัญชีธนาคาร — กด "เพิ่มบัญชี" เพื่อเริ่มต้น
        </div>
      )}

      <div className="space-y-2">
        {accounts.map((acc) => {
          const isEditing = editingId === acc.id;
          if (isEditing && draft) {
            return (
              <BankAccountForm
                key={acc.id}
                draft={draft}
                onChange={onDraftChange}
                onSave={handleSave}
                onCancel={handleCancel}
              />
            );
          }
          return (
            <div
              key={acc.id}
              className={`flex flex-wrap items-center gap-4 p-3 border rounded-lg ${
                acc.isActive ? 'border-gray-200 bg-white' : 'border-gray-200 bg-gray-50 opacity-70'
              }`}
            >
              <div className="flex-1 min-w-[200px]">
                <div className="font-medium text-gray-900">{acc.bankName}</div>
                <div className="text-sm text-gray-600">
                  {acc.accountName} — <span className="font-mono">{acc.accountNumber}</span>
                </div>
                {(acc.branch || acc.accountType) && (
                  <div className="text-xs text-gray-500">
                    {acc.branch}
                    {acc.branch && acc.accountType ? ' · ' : ''}
                    {acc.accountType}
                  </div>
                )}
              </div>
              {!acc.isActive && (
                <span className="text-xs px-2 py-0.5 bg-gray-200 text-gray-700 rounded">
                  ปิดใช้งาน
                </span>
              )}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => handleStartEdit(acc)}
                  className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  แก้ไข
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(acc.id)}
                  className="px-2 py-1.5 text-red-600 hover:bg-red-50 rounded-lg"
                  aria-label="ลบ"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          );
        })}

        {draft && !editingId && (
          <BankAccountForm
            draft={draft}
            onChange={onDraftChange}
            onSave={handleSave}
            onCancel={handleCancel}
          />
        )}
      </div>
    </section>
  );
}

interface BankAccountFormProps {
  draft: BankAccountInput;
  onChange: (key: keyof BankAccountInput, value: string | boolean | number) => void;
  onSave: () => void;
  onCancel: () => void;
}

function BankAccountForm({ draft, onChange, onSave, onCancel }: BankAccountFormProps) {
  const fieldClass =
    'w-full rounded-lg border border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 p-2 text-sm';
  return (
    <div className="p-4 border border-blue-300 bg-blue-50/40 rounded-lg space-y-3">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">ธนาคาร *</label>
          <input
            type="text"
            value={draft.bankName}
            onChange={(e) => onChange('bankName', e.target.value)}
            placeholder="ธนาคารกสิกรไทย"
            className={fieldClass}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">ชื่อบัญชี *</label>
          <input
            type="text"
            value={draft.accountName}
            onChange={(e) => onChange('accountName', e.target.value)}
            placeholder="บริษัท วีบียอนด์ จำกัด"
            className={fieldClass}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">เลขที่บัญชี *</label>
          <input
            type="text"
            value={draft.accountNumber}
            onChange={(e) => onChange('accountNumber', e.target.value)}
            placeholder="123-4-56789-0"
            className={`${fieldClass} font-mono`}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">สาขา</label>
          <input
            type="text"
            value={draft.branch || ''}
            onChange={(e) => onChange('branch', e.target.value)}
            placeholder="สาขานครราชสีมา"
            className={fieldClass}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">ประเภทบัญชี</label>
          <input
            type="text"
            value={draft.accountType || ''}
            onChange={(e) => onChange('accountType', e.target.value)}
            placeholder="ออมทรัพย์ / กระแสรายวัน"
            className={fieldClass}
          />
        </div>
        <div className="flex items-center gap-3 mt-6">
          <label className="inline-flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={draft.isActive}
              onChange={(e) => onChange('isActive', e.target.checked)}
              className="rounded"
            />
            เปิดใช้งาน (แสดงในใบเสร็จ)
          </label>
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-2 border-t border-blue-200">
        <button
          type="button"
          onClick={onCancel}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-white"
        >
          <X className="w-4 h-4" />
          ยกเลิก
        </button>
        <button
          type="button"
          onClick={onSave}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          <Save className="w-4 h-4" />
          บันทึก
        </button>
      </div>
    </div>
  );
}
