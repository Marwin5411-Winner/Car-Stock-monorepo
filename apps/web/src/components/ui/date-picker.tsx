import * as Popover from '@radix-ui/react-popover';
import {
  addMonths,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  parse,
  startOfMonth,
  startOfWeek,
  subMonths,
} from 'date-fns';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { cn } from '../../lib/utils';

interface DatePickerProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  clearable?: boolean;
  inputClassName?: string;
  minDate?: string; // ISO yyyy-MM-dd; days before this are disabled
  maxDate?: string; // ISO yyyy-MM-dd; days after this are disabled
}

const ISO_FORMAT = 'yyyy-MM-dd';
const DISPLAY_FORMAT = 'dd/MM/yyyy';
const THAI_WEEKDAYS = ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.'];
const THAI_MONTHS = [
  'มกราคม',
  'กุมภาพันธ์',
  'มีนาคม',
  'เมษายน',
  'พฤษภาคม',
  'มิถุนายน',
  'กรกฎาคม',
  'สิงหาคม',
  'กันยายน',
  'ตุลาคม',
  'พฤศจิกายน',
  'ธันวาคม',
];

function parseIso(value: string): Date | null {
  if (!value) return null;
  const d = parse(value, ISO_FORMAT, new Date());
  return isNaN(d.getTime()) ? null : d;
}

export function DatePicker({
  value,
  onChange,
  placeholder = 'วว/ดด/ปปปป',
  className,
  inputClassName,
  disabled,
  clearable = false,
  minDate,
  maxDate,
}: DatePickerProps) {
  const selected = useMemo(() => parseIso(value), [value]);
  const [open, setOpen] = useState(false);
  const [viewMonth, setViewMonth] = useState<Date>(selected ?? new Date());

  const displayValue = selected ? format(selected, DISPLAY_FORMAT) : '';

  const isOutOfRange = (d: Date): boolean => {
    const key = format(d, ISO_FORMAT);
    if (minDate && key < minDate) return true;
    if (maxDate && key > maxDate) return true;
    return false;
  };

  const days = useMemo(() => {
    const monthStart = startOfMonth(viewMonth);
    const monthEnd = endOfMonth(viewMonth);
    const gridStart = startOfWeek(monthStart, { weekStartsOn: 0 });
    const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });
    const out: Date[] = [];
    for (let d = gridStart; d <= gridEnd; d = new Date(d.getTime() + 86400000)) {
      out.push(d);
    }
    return out;
  }, [viewMonth]);

  const handleSelect = (d: Date) => {
    onChange(format(d, ISO_FORMAT));
    setOpen(false);
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange('');
  };

  const today = new Date();

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          type="button"
          disabled={disabled}
          className={cn(
            'relative inline-flex items-center gap-2 pl-10 pr-3 py-2 border border-gray-300 rounded-lg text-sm bg-white text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed min-w-[140px]',
            inputClassName,
            className
          )}
        >
          <CalendarIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <span className={cn('flex-1 text-left', !displayValue && 'text-gray-400')}>
            {displayValue || placeholder}
          </span>
          {clearable && displayValue && !disabled && (
            <span
              role="button"
              tabIndex={-1}
              onClick={handleClear}
              className="text-gray-400 hover:text-gray-700"
              aria-label="ล้างวันที่"
            >
              <X className="w-3.5 h-3.5" />
            </span>
          )}
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={4}
          className="z-50 bg-white border border-gray-200 rounded-lg shadow-lg p-3 w-[280px]"
        >
          <div className="flex items-center justify-between mb-2">
            <button
              type="button"
              onClick={() => setViewMonth(subMonths(viewMonth, 1))}
              className="p-1 rounded hover:bg-gray-100"
              aria-label="เดือนก่อน"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <div className="text-sm font-medium text-gray-900">
              {THAI_MONTHS[viewMonth.getMonth()]} {viewMonth.getFullYear()}
            </div>
            <button
              type="button"
              onClick={() => setViewMonth(addMonths(viewMonth, 1))}
              className="p-1 rounded hover:bg-gray-100"
              aria-label="เดือนถัดไป"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-7 gap-1 mb-1">
            {THAI_WEEKDAYS.map((w) => (
              <div key={w} className="text-center text-xs font-medium text-gray-500 py-1">
                {w}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1">
            {days.map((day) => {
              const inMonth = isSameMonth(day, viewMonth);
              const isSelected = selected && isSameDay(day, selected);
              const isToday = isSameDay(day, today);
              const outOfRange = isOutOfRange(day);
              return (
                <button
                  key={day.toISOString()}
                  type="button"
                  disabled={outOfRange}
                  onClick={() => !outOfRange && handleSelect(day)}
                  className={cn(
                    'h-8 w-full text-sm rounded transition-colors',
                    !inMonth && 'text-gray-300',
                    inMonth && !isSelected && !outOfRange && 'text-gray-800 hover:bg-blue-50',
                    isSelected && 'bg-blue-600 text-white font-medium',
                    !isSelected && isToday && !outOfRange && 'ring-1 ring-blue-400',
                    outOfRange && 'text-gray-300 cursor-not-allowed opacity-50'
                  )}
                >
                  {day.getDate()}
                </button>
              );
            })}
          </div>

          <div className="flex items-center justify-between pt-2 mt-2 border-t border-gray-100 text-xs">
            <button
              type="button"
              disabled={isOutOfRange(today)}
              onClick={() => {
                handleSelect(today);
                setViewMonth(today);
              }}
              className="text-blue-600 hover:underline disabled:text-gray-300 disabled:no-underline disabled:cursor-not-allowed"
            >
              วันนี้
            </button>
            {clearable && (
              <button
                type="button"
                onClick={() => {
                  onChange('');
                  setOpen(false);
                }}
                className="text-gray-500 hover:underline"
              >
                ล้าง
              </button>
            )}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
