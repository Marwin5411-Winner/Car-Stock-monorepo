import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Search, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { vehicleService } from '../../services/vehicle.service';
import type { VehicleModel } from '../../services/vehicle.service';

export interface CampaignModelSummary {
  id: string;
  brand: string;
  model: string;
  variant?: string | null;
  year: number;
}

export interface CampaignModelPickerProps {
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  /** Models already on the campaign (edit) — always shown in selected chips. */
  initialSelectedModels?: CampaignModelSummary[];
  error?: string;
}

const modelLabel = (m: Pick<CampaignModelSummary, 'brand' | 'model' | 'variant' | 'year'>) =>
  `${m.brand} ${m.model}${m.variant ? ` ${m.variant}` : ''} · ${m.year}`;

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(t);
  }, [value, delayMs]);
  return debounced;
}

export function CampaignModelPicker({
  selectedIds,
  onChange,
  initialSelectedModels = [],
  error,
}: CampaignModelPickerProps) {
  const [searchInput, setSearchInput] = useState('');
  const [brandFilter, setBrandFilter] = useState('');
  const debouncedSearch = useDebouncedValue(searchInput.trim(), 300);

  // Cache of models we've seen (search results + initial selected) so chips
  // keep labels even when the current query no longer returns them.
  const [knownById, setKnownById] = useState<Map<string, CampaignModelSummary>>(() => {
    const map = new Map<string, CampaignModelSummary>();
    for (const m of initialSelectedModels) map.set(m.id, m);
    return map;
  });

  useEffect(() => {
    if (initialSelectedModels.length === 0) return;
    setKnownById((prev) => {
      const next = new Map(prev);
      for (const m of initialSelectedModels) next.set(m.id, m);
      return next;
    });
  }, [initialSelectedModels]);

  // Distinct brands for the optional brand dropdown (full catalog, not page-capped).
  const { data: brandCatalog } = useQuery({
    queryKey: ['vehicles', 'all-pages', 'brands'],
    queryFn: () => vehicleService.getAllPages({}),
    staleTime: 60_000,
  });

  const brandOptions = useMemo(() => {
    const set = new Set((brandCatalog?.data ?? []).map((v) => v.brand).filter(Boolean));
    return [...set].sort((a, b) => a.localeCompare(b, 'th'));
  }, [brandCatalog]);

  const {
    data: listResult,
    isLoading,
    isFetching,
  } = useQuery({
    queryKey: ['vehicles', 'campaign-picker', debouncedSearch, brandFilter],
    queryFn: () =>
      vehicleService.getAllPages({
        search: debouncedSearch || undefined,
        brand: brandFilter || undefined,
        limit: 200,
      }),
  });

  const results = listResult?.data ?? [];
  const totalMatching = listResult?.total ?? results.length;

  useEffect(() => {
    if (results.length === 0) return;
    setKnownById((prev) => {
      const next = new Map(prev);
      for (const m of results) {
        next.set(m.id, {
          id: m.id,
          brand: m.brand,
          model: m.model,
          variant: m.variant,
          year: m.year,
        });
      }
      return next;
    });
  }, [results]);

  const selectedModels = useMemo(() => {
    return selectedIds.map((id) => {
      const known = knownById.get(id);
      if (known) return known;
      return { id, brand: '…', model: id.slice(0, 8), variant: null, year: 0 };
    });
  }, [selectedIds, knownById]);

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  const hasActiveFilter = Boolean(debouncedSearch || brandFilter);

  const toggle = (id: string, model?: VehicleModel | CampaignModelSummary) => {
    if (model) {
      setKnownById((prev) => {
        const next = new Map(prev);
        next.set(model.id, {
          id: model.id,
          brand: model.brand,
          model: model.model,
          variant: model.variant,
          year: model.year,
        });
        return next;
      });
    }
    if (selectedSet.has(id)) {
      onChange(selectedIds.filter((x) => x !== id));
    } else {
      onChange([...selectedIds, id]);
    }
  };

  const removeOne = (id: string) => {
    onChange(selectedIds.filter((x) => x !== id));
  };

  const selectAllInResults = () => {
    const ids = results.map((m) => m.id);
    onChange(Array.from(new Set([...selectedIds, ...ids])));
  };

  const clearInResults = () => {
    const resultIds = new Set(results.map((m) => m.id));
    onChange(selectedIds.filter((id) => !resultIds.has(id)));
  };

  const clearAllSelected = () => {
    if (selectedIds.length === 0) return;
    if (
      selectedIds.length > 3 &&
      !window.confirm(`ล้างรุ่นที่เลือกทั้งหมด ${selectedIds.length} รุ่นหรือไม่?`)
    ) {
      return;
    }
    onChange([]);
  };

  const clearFilters = () => {
    setSearchInput('');
    setBrandFilter('');
  };

  return (
    <div className="space-y-4">
      {/* Selected chips — always visible, not affected by search/brand filter */}
      <div className="rounded-lg border border-blue-100 bg-blue-50/60 p-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <span className="text-sm font-medium text-gray-800">
            รุ่นที่เลือกแล้ว ({selectedIds.length})
          </span>
          {selectedIds.length > 0 && (
            <button
              type="button"
              onClick={clearAllSelected}
              className="text-xs text-red-600 hover:text-red-800 hover:underline"
            >
              ล้างที่เลือก
            </button>
          )}
        </div>
        {selectedIds.length === 0 ? (
          <p className="text-sm text-gray-500">ยังไม่ได้เลือกรุ่น — ติ๊กจากรายการด้านล่าง</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {selectedModels.map((m) => (
              <span
                key={m.id}
                className="inline-flex max-w-full items-center gap-1 rounded-full bg-white px-2.5 py-1 text-xs font-medium text-gray-800 shadow-sm ring-1 ring-blue-200"
              >
                <span className="truncate">{modelLabel(m)}</span>
                <button
                  type="button"
                  onClick={() => removeOne(m.id)}
                  className="rounded-full p-0.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                  aria-label={`ลบ ${modelLabel(m)}`}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      {error && <p className="text-sm text-red-500">{error}</p>}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[12rem] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="ค้นหายี่ห้อ รุ่น หรือรุ่นย่อย..."
            className="w-full rounded-lg border border-gray-300 py-2 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <select
          value={brandFilter}
          onChange={(e) => setBrandFilter(e.target.value)}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">ทุกยี่ห้อ</option>
          {brandOptions.map((b) => (
            <option key={b} value={b}>
              {b}
            </option>
          ))}
        </select>
        {hasActiveFilter && (
          <button
            type="button"
            onClick={clearFilters}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
          >
            ล้างตัวกรอง
          </button>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-gray-600">
        <span>
          แสดง {results.length}
          {totalMatching !== results.length ? ` จาก ${totalMatching}` : ''} รุ่น
          {isFetching && !isLoading ? ' · กำลังอัปเดต…' : ''}
        </span>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={selectAllInResults}
            disabled={results.length === 0}
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50 disabled:opacity-50"
          >
            เลือกทั้งหมดในผลค้นหา
          </button>
          <button
            type="button"
            onClick={clearInResults}
            disabled={results.length === 0}
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50 disabled:opacity-50"
          >
            ล้างในผลค้นหา
          </button>
        </div>
      </div>

      {/* Catalog list */}
      <div className="max-h-96 overflow-y-auto rounded-lg border border-gray-200">
        {isLoading ? (
          <div className="p-8 text-center text-sm text-gray-500">กำลังโหลดรุ่นรถยนต์...</div>
        ) : results.length === 0 ? (
          <div className="space-y-3 p-8 text-center">
            {hasActiveFilter ? (
              <>
                <p className="text-sm text-gray-700">
                  ไม่พบรุ่นที่ตรงกับ
                  {debouncedSearch ? (
                    <>
                      {' '}
                      «<span className="font-medium">{debouncedSearch}</span>»
                    </>
                  ) : null}
                  {brandFilter ? (
                    <>
                      {' '}
                      ยี่ห้อ <span className="font-medium">{brandFilter}</span>
                    </>
                  ) : null}
                </p>
                <p className="text-xs text-gray-500">
                  ลองเปลี่ยนคำค้น หรือกด «ล้างตัวกรอง» เพื่อดูรุ่นทั้งหมด
                </p>
                <button
                  type="button"
                  onClick={clearFilters}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700"
                >
                  ล้างตัวกรอง
                </button>
              </>
            ) : (
              <>
                <p className="text-sm text-gray-700">ยังไม่มีรุ่นรถยนต์ในระบบ</p>
                <Link to="/vehicles" className="text-sm text-blue-600 hover:underline">
                  ไปจัดการรุ่นรถยนต์
                </Link>
              </>
            )}
          </div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {results.map((m) => {
              const isSelected = selectedSet.has(m.id);
              return (
                <li key={m.id}>
                  <button
                    type="button"
                    onClick={() => toggle(m.id, m)}
                    className={`flex w-full items-center gap-3 px-4 py-3 text-left transition-colors ${
                      isSelected ? 'bg-blue-50' : 'hover:bg-gray-50'
                    }`}
                  >
                    <span
                      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 ${
                        isSelected ? 'border-blue-500 bg-blue-500' : 'border-gray-300'
                      }`}
                    >
                      {isSelected && (
                        <svg className="h-3 w-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                          <path
                            fillRule="evenodd"
                            d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                            clipRule="evenodd"
                          />
                        </svg>
                      )}
                    </span>
                    <span className="min-w-0">
                      <span className="block font-medium text-gray-900">
                        {m.brand} {m.model}
                      </span>
                      <span className="block text-sm text-gray-500">
                        {m.variant || '—'} · {m.year}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
