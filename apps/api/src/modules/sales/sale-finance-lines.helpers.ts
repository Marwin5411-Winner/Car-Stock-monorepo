export type CustomLineInput = {
  id?: string;
  label: string;
  group: string;
  amount: number;
  notes?: string;
  sortOrder?: number;
};

export function normalizeCustomLines(lines: CustomLineInput[]) {
  return lines.map((l, i) => ({
    key: l.id ? `custom:${l.id}` : `custom:new-${i}`,
    label: l.label,
    group: l.group,
    amount: l.amount,
    source: 'CUSTOM' as const,
    sortOrder: l.sortOrder ?? i,
    notes: l.notes ?? null,
  }));
}
