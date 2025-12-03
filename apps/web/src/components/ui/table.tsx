import * as React from 'react';
import { cn } from '@/lib/utils';

// Table Container with overflow support
const TableContainer = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      'bg-white rounded-lg shadow-sm border border-gray-200',
      className
    )}
    {...props}
  />
));
TableContainer.displayName = 'TableContainer';

// Wrapper for horizontal scroll
const TableWrapper = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      'overflow-x-auto scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-gray-100',
      className
    )}
    {...props}
  />
));
TableWrapper.displayName = 'TableWrapper';

// Main Table
const Table = React.forwardRef<
  HTMLTableElement,
  React.HTMLAttributes<HTMLTableElement>
>(({ className, ...props }, ref) => (
  <table
    ref={ref}
    className={cn('min-w-full divide-y divide-gray-200', className)}
    {...props}
  />
));
Table.displayName = 'Table';

// Table Header
const TableHeader = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <thead
    ref={ref}
    className={cn('bg-gray-50', className)}
    {...props}
  />
));
TableHeader.displayName = 'TableHeader';

// Table Body
const TableBody = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <tbody
    ref={ref}
    className={cn('bg-white divide-y divide-gray-200', className)}
    {...props}
  />
));
TableBody.displayName = 'TableBody';

// Table Footer
const TableFooter = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <tfoot
    ref={ref}
    className={cn(
      'border-t border-gray-200 bg-gray-50 font-medium text-gray-900',
      className
    )}
    {...props}
  />
));
TableFooter.displayName = 'TableFooter';

// Table Row
const TableRow = React.forwardRef<
  HTMLTableRowElement,
  React.HTMLAttributes<HTMLTableRowElement>
>(({ className, ...props }, ref) => (
  <tr
    ref={ref}
    className={cn(
      'transition-colors hover:bg-gray-50/80',
      className
    )}
    {...props}
  />
));
TableRow.displayName = 'TableRow';

// Table Head Cell
const TableHead = React.forwardRef<
  HTMLTableCellElement,
  React.ThHTMLAttributes<HTMLTableCellElement>
>(({ className, ...props }, ref) => (
  <th
    ref={ref}
    className={cn(
      'px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider whitespace-nowrap',
      'first:pl-6 last:pr-6',
      className
    )}
    {...props}
  />
));
TableHead.displayName = 'TableHead';

// Table Data Cell
const TableCell = React.forwardRef<
  HTMLTableCellElement,
  React.TdHTMLAttributes<HTMLTableCellElement>
>(({ className, ...props }, ref) => (
  <td
    ref={ref}
    className={cn(
      'px-4 py-3 text-sm text-gray-700 whitespace-nowrap',
      'first:pl-6 last:pr-6',
      className
    )}
    {...props}
  />
));
TableCell.displayName = 'TableCell';

// Table Caption
const TableCaption = React.forwardRef<
  HTMLTableCaptionElement,
  React.HTMLAttributes<HTMLTableCaptionElement>
>(({ className, ...props }, ref) => (
  <caption
    ref={ref}
    className={cn('mt-4 text-sm text-gray-500', className)}
    {...props}
  />
));
TableCaption.displayName = 'TableCaption';

// Empty State Component
interface TableEmptyProps extends React.HTMLAttributes<HTMLDivElement> {
  icon?: React.ReactNode;
  title?: string;
  description?: string;
  action?: React.ReactNode;
}

const TableEmpty = React.forwardRef<HTMLDivElement, TableEmptyProps>(
  ({ className, icon, title = 'ไม่พบข้อมูล', description, action, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        'flex flex-col items-center justify-center py-12 px-4 text-center',
        className
      )}
      {...props}
    >
      {icon && (
        <div className="mb-4 text-gray-300">{icon}</div>
      )}
      <h3 className="text-sm font-medium text-gray-900">{title}</h3>
      {description && (
        <p className="mt-1 text-sm text-gray-500">{description}</p>
      )}
      {action && (
        <div className="mt-4">{action}</div>
      )}
    </div>
  )
);
TableEmpty.displayName = 'TableEmpty';

// Loading State Component
interface TableLoadingProps extends React.HTMLAttributes<HTMLDivElement> {
  text?: string;
}

const TableLoading = React.forwardRef<HTMLDivElement, TableLoadingProps>(
  ({ className, text = 'กำลังโหลด...', ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        'flex flex-col items-center justify-center py-12 px-4',
        className
      )}
      {...props}
    >
      <div className="relative">
        <div className="h-10 w-10 rounded-full border-2 border-gray-200"></div>
        <div className="absolute top-0 h-10 w-10 rounded-full border-2 border-blue-600 border-t-transparent animate-spin"></div>
      </div>
      <p className="mt-4 text-sm text-gray-600">{text}</p>
    </div>
  )
);
TableLoading.displayName = 'TableLoading';

// Pagination Component
interface TablePaginationProps extends React.HTMLAttributes<HTMLDivElement> {
  page: number;
  totalPages: number;
  total: number;
  limit: number;
  onPageChange: (page: number) => void;
  showInfo?: boolean;
}

const TablePagination = React.forwardRef<HTMLDivElement, TablePaginationProps>(
  ({ className, page, totalPages, total, limit, onPageChange, showInfo = true, ...props }, ref) => {
    const start = (page - 1) * limit + 1;
    const end = Math.min(page * limit, total);

    return (
      <div
        ref={ref}
        className={cn(
          'flex flex-col sm:flex-row items-center justify-between gap-3 px-4 sm:px-6 py-3 bg-gray-50 border-t border-gray-200',
          className
        )}
        {...props}
      >
        {showInfo && (
          <p className="text-sm text-gray-600 order-2 sm:order-1">
            แสดง <span className="font-medium">{start}</span> ถึง{' '}
            <span className="font-medium">{end}</span> จาก{' '}
            <span className="font-medium">{total}</span> รายการ
          </p>
        )}
        <div className="flex items-center gap-2 order-1 sm:order-2">
          <button
            onClick={() => onPageChange(page - 1)}
            disabled={page === 1}
            className={cn(
              'inline-flex items-center justify-center px-3 py-1.5 text-sm font-medium rounded-lg border transition-colors',
              'focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1',
              page === 1
                ? 'bg-gray-100 text-gray-400 cursor-not-allowed border-gray-200'
                : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
            )}
          >
            ก่อนหน้า
          </button>
          <span className="px-3 py-1.5 text-sm text-gray-700 bg-white border border-gray-200 rounded-lg">
            {page} / {totalPages}
          </span>
          <button
            onClick={() => onPageChange(page + 1)}
            disabled={page === totalPages}
            className={cn(
              'inline-flex items-center justify-center px-3 py-1.5 text-sm font-medium rounded-lg border transition-colors',
              'focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1',
              page === totalPages
                ? 'bg-gray-100 text-gray-400 cursor-not-allowed border-gray-200'
                : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
            )}
          >
            ถัดไป
          </button>
        </div>
      </div>
    );
  }
);
TablePagination.displayName = 'TablePagination';

export {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
  TableContainer,
  TableWrapper,
  TableEmpty,
  TableLoading,
  TablePagination,
};
