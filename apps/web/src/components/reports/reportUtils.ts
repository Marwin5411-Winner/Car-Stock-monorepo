// ============================================
// Report Utilities
// ============================================

/**
 * Format number as Thai Baht currency
 */
export function formatCurrency(amount: number | null | undefined): string {
  if (amount === null || amount === undefined || isNaN(amount)) {
    return '฿0';
  }
  return new Intl.NumberFormat('th-TH', {
    style: 'currency',
    currency: 'THB',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);
}

/**
 * Format number with thousand separators
 */
export function formatNumber(num: number | null | undefined): string {
  if (num === null || num === undefined || isNaN(num)) {
    return '0';
  }
  return new Intl.NumberFormat('th-TH').format(num);
}

/**
 * Format date string to Thai locale
 */
export function formatDate(dateString: string | null | undefined): string {
  if (!dateString) return '-';
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('th-TH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

/**
 * Format percentage
 */
export function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined || isNaN(value)) {
    return '0%';
  }
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
}

/**
 * Format datetime to Thai locale
 */
export function formatDateTime(dateString: string | null | undefined): string {
  if (!dateString) return '-';
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return '-';
  return date.toLocaleString('th-TH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Get Thai month name
 * @param month - 0-based month index (0 = January, 11 = December), matching Date.prototype.getMonth().
 *   Callers that hold a 1-based value (e.g. from an API) must subtract 1 first.
 *   Out-of-range input returns '' instead of undefined to keep UI rendering safe.
 */
export function getThaiMonthName(month: number): string {
  const months = [
    'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
    'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.',
  ];
  if (!Number.isInteger(month) || month < 0 || month > 11) return '';
  return months[month];
}

/**
 * Get date range for quick filters
 */
export function getDateRange(type: 'today' | 'week' | 'month' | 'year'): { start: string; end: string } {
  // Take a snapshot up-front and never mutate it. The previous implementation
  // called today.setDate() which mutates in place, then computed `start` from
  // a now-stale `today` — corrupting subsequent month/year calculations when
  // the week subtraction crossed a month boundary.
  const now = new Date();
  const end = now.toISOString().split('T')[0];
  let start: Date;

  switch (type) {
    case 'today':
      start = new Date(now);
      break;
    case 'week': {
      const weekAgo = new Date(now);
      weekAgo.setDate(weekAgo.getDate() - 7);
      start = weekAgo;
      break;
    }
    case 'month':
      start = new Date(now.getFullYear(), now.getMonth(), 1);
      break;
    case 'year':
      start = new Date(now.getFullYear(), 0, 1);
      break;
    default:
      start = new Date(now);
  }

  return {
    start: start.toISOString().split('T')[0],
    end,
  };
}
