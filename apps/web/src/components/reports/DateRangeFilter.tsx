import { useState } from 'react';
import { Calendar } from 'lucide-react';

interface DateRangeFilterProps {
  startDate: string;
  endDate: string;
  onStartDateChange: (date: string) => void;
  onEndDateChange: (date: string) => void;
  onApply: () => void;
  loading?: boolean;
}

export function DateRangeFilter({
  startDate,
  endDate,
  onStartDateChange,
  onEndDateChange,
  onApply,
  loading = false,
}: DateRangeFilterProps) {
  const [quickRange, setQuickRange] = useState<string>('');

  const handleQuickRange = (range: string) => {
    setQuickRange(range);
    const today = new Date();
    let start: Date;
    let end: Date = today;

    switch (range) {
      case 'today':
        start = today;
        break;
      case 'yesterday':
        start = new Date(today);
        start.setDate(start.getDate() - 1);
        end = new Date(start);
        break;
      case 'last7days':
        start = new Date(today);
        start.setDate(start.getDate() - 7);
        break;
      case 'last30days':
        start = new Date(today);
        start.setDate(start.getDate() - 30);
        break;
      case 'thisMonth':
        start = new Date(today.getFullYear(), today.getMonth(), 1);
        break;
      case 'lastMonth':
        start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
        end = new Date(today.getFullYear(), today.getMonth(), 0);
        break;
      case 'thisYear':
        start = new Date(today.getFullYear(), 0, 1);
        break;
      default:
        return;
    }

    onStartDateChange(formatDate(start));
    onEndDateChange(formatDate(end));
  };

  const formatDate = (date: Date): string => {
    return date.toISOString().split('T')[0];
  };

  return (
    <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
      <div className="flex flex-wrap items-end gap-4">
        {/* Quick Range Buttons */}
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => handleQuickRange('today')}
            className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${
              quickRange === 'today'
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
            }`}
          >
            วันนี้
          </button>
          <button
            type="button"
            onClick={() => handleQuickRange('yesterday')}
            className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${
              quickRange === 'yesterday'
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
            }`}
          >
            เมื่อวาน
          </button>
          <button
            type="button"
            onClick={() => handleQuickRange('last7days')}
            className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${
              quickRange === 'last7days'
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
            }`}
          >
            7 วัน
          </button>
          <button
            type="button"
            onClick={() => handleQuickRange('last30days')}
            className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${
              quickRange === 'last30days'
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
            }`}
          >
            30 วัน
          </button>
          <button
            type="button"
            onClick={() => handleQuickRange('thisMonth')}
            className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${
              quickRange === 'thisMonth'
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
            }`}
          >
            เดือนนี้
          </button>
          <button
            type="button"
            onClick={() => handleQuickRange('lastMonth')}
            className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${
              quickRange === 'lastMonth'
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
            }`}
          >
            เดือนก่อน
          </button>
          <button
            type="button"
            onClick={() => handleQuickRange('thisYear')}
            className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${
              quickRange === 'thisYear'
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
            }`}
          >
            ปีนี้
          </button>
        </div>

        <div className="h-8 w-px bg-gray-300 hidden md:block" />

        {/* Date Inputs */}
        <div className="flex items-center gap-2">
          <div className="relative">
            <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="date"
              value={startDate}
              onChange={(e) => {
                onStartDateChange(e.target.value);
                setQuickRange('');
              }}
              className="pl-10 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <span className="text-gray-500">ถึง</span>
          <div className="relative">
            <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="date"
              value={endDate}
              onChange={(e) => {
                onEndDateChange(e.target.value);
                setQuickRange('');
              }}
              className="pl-10 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
        </div>

        {/* Apply Button */}
        <button
          type="button"
          onClick={onApply}
          disabled={loading}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium transition-colors"
        >
          {loading ? 'กำลังโหลด...' : 'ค้นหา'}
        </button>
      </div>
    </div>
  );
}
