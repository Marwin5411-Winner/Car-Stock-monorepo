import { useState, useCallback } from 'react';
import { useToast } from '../components/toast';
import { isApiError, getErrorMessage } from '../lib/errors';

interface ErrorHandlerOptions {
  showToast?: boolean;
  successMessage?: string;
  onSuccess?: () => void;
  onError?: (error: Error) => void;
}

interface ErrorHandlerResult {
  execute: <T>(promise: Promise<T>) => Promise<T | undefined>;
  fieldErrors: Record<string, string>;
  clearFieldErrors: () => void;
}

/**
 * Hook for handling errors in async operations
 * Shows toast notifications and extracts field-level errors
 */
export function useErrorHandler(options: ErrorHandlerOptions = {}): ErrorHandlerResult {
  const { addToast } = useToast();
  const { showToast = true, successMessage, onSuccess, onError } = options;
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const clearFieldErrors = useCallback(() => setFieldErrors({}), []);

  const execute = async <T>(promise: Promise<T>): Promise<T | undefined> => {
    // Clear previous field errors on new attempt
    setFieldErrors({});

    try {
      const result = await promise;

      if (showToast && successMessage) {
        addToast(successMessage, 'success');
      }

      onSuccess?.();
      return result;
    } catch (error) {
      if (isApiError(error)) {
        // Extract field-level errors for inline display
        const fields = error.details?.fields as Record<string, string[]> | undefined;
        if (fields) {
          const mapped: Record<string, string> = {};
          for (const [key, messages] of Object.entries(fields)) {
            mapped[key] = Array.isArray(messages) ? messages[0] : String(messages);
          }
          setFieldErrors(mapped);
        }

        if (showToast) {
          const message = getErrorMessage(error.errorCode, error.message);
          addToast(message, 'error');
        }
      } else if (showToast) {
        if (error instanceof Error) {
          addToast(error.message, 'error');
        } else {
          addToast('เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ', 'error');
        }
      }

      onError?.(error instanceof Error ? error : new Error(String(error)));
      return undefined;
    }
  };

  return { execute, fieldErrors, clearFieldErrors };
}

/**
 * Hook specifically for mutation operations (create, update, delete)
 * Automatically shows success/error toasts and extracts field errors
 */
export function useMutationHandler(
  successMsg: string,
  options: Omit<ErrorHandlerOptions, 'successMessage' | 'showToast'> = {}
): ErrorHandlerResult {
  return useErrorHandler({
    showToast: true,
    successMessage: successMsg,
    ...options,
  });
}
