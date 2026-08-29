/** PATCH body is notes-only when the only defined key is `notes`. */
export function isNotesOnlySaleUpdate(data: Record<string, unknown>): boolean {
  const keys = Object.keys(data).filter((k) => data[k] !== undefined);
  return keys.length === 1 && keys[0] === 'notes';
}

export function normalizeSharedNotes(notes: unknown): string | null {
  if (typeof notes !== 'string') return null;
  const trimmed = notes.trim();
  return trimmed || null;
}

/** Sale text wins when both sides have content. */
export function pickSharedNotes(
  saleNotes?: string | null,
  stockNotes?: string | null
): string | null {
  return normalizeSharedNotes(saleNotes) ?? normalizeSharedNotes(stockNotes);
}

/** PDF/Excel หมายเหตุ: stock first, then sale, else '-'. */
export function resolveReportStockNotes(
  stockNotes?: string | null,
  saleNotes?: string | null
): string {
  return stockNotes?.trim() || saleNotes?.trim() || '-';
}
