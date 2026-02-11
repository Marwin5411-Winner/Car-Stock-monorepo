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
 */
export function getThaiMonthName(month: number): string {
  const months = [
    'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
    'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.',
  ];
  return months[month];
}

/**
 * Get date range for quick filters
 */
export function getDateRange(type: 'today' | 'week' | 'month' | 'year'): { start: string; end: string } {
  const today = new Date();
  const end = today.toISOString().split('T')[0];
  let start: Date;

  switch (type) {
    case 'today':
      start = today;
      break;
    case 'week':
      start = new Date(today.setDate(today.getDate() - 7));
      break;
    case 'month':
      start = new Date(today.getFullYear(), today.getMonth(), 1);
      break;
    case 'year':
      start = new Date(today.getFullYear(), 0, 1);
      break;
    default:
      start = today;
  }

  return {
    start: start.toISOString().split('T')[0],
    end,
  };
}
