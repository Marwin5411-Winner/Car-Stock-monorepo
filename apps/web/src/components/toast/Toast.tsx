import { type Toast, type ToastType } from './ToastContext';

interface ToastProps {
  toast: Toast;
  onRemove: (id: string) => void;
}

const toastStyles: Record<ToastType, string> = {
  success: 'bg-green-500',
  error: 'bg-red-500',
  warning: 'bg-yellow-500',
  info: 'bg-blue-500',
};

const toastIcons: Record<ToastType, string> = {
  success: '✓',
  error: '✕',
  warning: '⚠',
  info: 'ℹ',
};

export function Toast({ toast, onRemove }: ToastProps): React.ReactElement {
  return (
    <div
      className={`${toastStyles[toast.type]} text-white px-4 py-3 rounded-lg shadow-lg flex items-center gap-3 min-w-[300px] max-w-md animate-slide-in`}
      role="alert"
    >
      <span className="text-lg font-bold">{toastIcons[toast.type]}</span>
      <p className="flex-1 text-sm font-medium">{toast.message}</p>
      <button
        onClick={() => onRemove(toast.id)}
        className="text-white/80 hover:text-white transition-colors text-lg leading-none"
        aria-label="Close"
      >
        ×
      </button>
    </div>
  );
}
