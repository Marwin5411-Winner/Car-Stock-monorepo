import { useState } from 'react';
import type { InterestSummary } from '../../services/interest.service';

export function useInterestBulkSelection() {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [selectedItems, setSelectedItems] = useState<Record<string, InterestSummary>>({});
  const [excludedIds, setExcludedIds] = useState<string[]>([]);
  const [selectAllMatching, setSelectAllMatching] = useState(false);

  const resetSelection = () => {
    setSelectedIds([]);
    setSelectedItems({});
    setExcludedIds([]);
    setSelectAllMatching(false);
  };

  const rememberRows = (rows: InterestSummary[]) => {
    setSelectedItems((prev) => {
      const next = { ...prev };
      for (const row of rows) next[row.stockId] = row;
      return next;
    });
  };

  const forgetIds = (ids: string[]) => {
    setSelectedItems((prev) => {
      const next = { ...prev };
      for (const id of ids) delete next[id];
      return next;
    });
  };

  const mergeFetchedRows = (
    rows: InterestSummary[],
    ids: string[],
    matching: boolean
  ) => {
    setSelectedItems((prev) => {
      const next = { ...prev };
      for (const row of rows) {
        if (ids.includes(row.stockId) || matching) {
          next[row.stockId] = row;
        }
      }
      return next;
    });
  };

  const isSelected = (id: string) =>
    selectAllMatching ? !excludedIds.includes(id) : selectedIds.includes(id);

  const selectedCount = (total: number) =>
    selectAllMatching ? Math.max(0, total - excludedIds.length) : selectedIds.length;

  const allPageSelected = (pageIds: string[]) =>
    pageIds.length > 0 && pageIds.every((id) => isSelected(id));

  const toggleOne = (item: InterestSummary) => {
    if (selectAllMatching) {
      setExcludedIds((prev) =>
        prev.includes(item.stockId)
          ? prev.filter((id) => id !== item.stockId)
          : [...prev, item.stockId]
      );
      return;
    }
    setSelectedIds((prev) => {
      if (prev.includes(item.stockId)) {
        forgetIds([item.stockId]);
        return prev.filter((id) => id !== item.stockId);
      }
      rememberRows([item]);
      return [...prev, item.stockId];
    });
  };

  const togglePage = (pageItems: InterestSummary[]) => {
    const pageIds = pageItems.map((item) => item.stockId);
    if (selectAllMatching) {
      if (allPageSelected(pageIds)) {
        setExcludedIds((prev) => Array.from(new Set([...prev, ...pageIds])));
      } else {
        setExcludedIds((prev) => prev.filter((id) => !pageIds.includes(id)));
      }
      return;
    }
    if (allPageSelected(pageIds)) {
      setSelectedIds((prev) => prev.filter((id) => !pageIds.includes(id)));
      forgetIds(pageIds);
    } else {
      setSelectedIds((prev) => Array.from(new Set([...prev, ...pageIds])));
      rememberRows(pageItems);
    }
  };

  const selectAllFiltered = (pageItems: InterestSummary[]) => {
    setSelectAllMatching(true);
    setExcludedIds([]);
    setSelectedIds(pageItems.map((item) => item.stockId));
    rememberRows(pageItems);
  };

  const keepOnlyIds = (ids: string[]) => {
    const keep = new Set(ids);
    setSelectedIds(ids);
    setSelectAllMatching(false);
    setExcludedIds([]);
    setSelectedItems((prev) => {
      const next: Record<string, InterestSummary> = {};
      for (const id of keep) {
        if (prev[id]) next[id] = prev[id];
      }
      return next;
    });
  };

  return {
    selectedIds,
    selectedItems,
    excludedIds,
    selectAllMatching,
    resetSelection,
    mergeFetchedRows,
    isSelected,
    selectedCount,
    allPageSelected,
    toggleOne,
    togglePage,
    selectAllFiltered,
    keepOnlyIds,
  };
}
