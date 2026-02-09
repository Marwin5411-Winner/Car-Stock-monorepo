import { useToast } from '../components/toast';
import { isApiError, getErrorMessage } from '../lib/errors';

interface ErrorHandlerOptions {
  showToast?: boolean;
  successMessage?: string;
  onSuccess?: () => void;
  onError?: (error: Error) => void;
}

interface ErrorHandlerResult<T> {
  execute: (promise: Promise<T>) => Promise<T | undefined>;
}

/**
 * Hook for handling errors in async operations
 * Shows toast notifications for errors and success
 */
export function useErrorHandler<T = unknown>(options: ErrorHandlerOptions = {}): ErrorHandlerResult<T> {
  const { addToast } = useToast();
  const { showToast = true, successMessage, onSuccess, onError } = options;

  const execute = async (promise: Promise<T>): Promise<T | undefined> => {
    try {
      const result = await promise;
      
      if (showToast && successMessage) {
        addToast(successMessage, 'success');
      }
      
      onSuccess?.();
      return result;
    } catch (error) {
      if (showToast) {
        if (isApiError(error)) {
          // Use Thai error message from mapping
          const message = getErrorMessage(error.errorCode, error.message);
          addToast(message, 'error');
        } else if (error instanceof Error) {
          addToast(error.message, 'error');
        } else {
          addToast('เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ', 'error');
        }
      }
      
      onError?.(error instanceof Error ? error : new Error(String(error)));
      return undefined;
    }
  };

  return { execute };
}

/**
 * Hook specifically for mutation operations (create, update, delete)
 * Automatically shows success/error toasts
 */
export function useMutationHandler<T = unknown>(
  successMsg: string,
  options: Omit<ErrorHandlerOptions, 'successMessage' | 'showToast'> = {}
): ErrorHandlerResult<T> {
  return useErrorHandler<T>({
    showToast: true,
    successMessage: successMsg,
    ...options,
  });
}
