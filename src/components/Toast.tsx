import { type ReactNode, useCallback, useMemo, useState } from 'react';
import {
  ToastContext,
  type ToastApi,
  type ToastKind,
  type ToastState,
} from './toastContext';

function toastClassName(kind: ToastKind): string {
  const base =
    'rounded-md px-4 py-3 text-sm shadow-lg transition-colors';
  return kind === 'success'
    ? `${base} bg-app-primary text-app-text`
    : `${base} bg-[#3f4a41] text-white`;
}

/**
 * ToastProvider centralizes transient feedback so pages only depend on the
 * narrow success/error API required by the product design.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastState | null>(null);

  const showToast = useCallback((kind: ToastKind, message: string) => {
    const id = Date.now();
    setToast({ id, kind, message });

    window.setTimeout(() => {
      setToast((currentToast) =>
        currentToast?.id === id ? null : currentToast,
      );
    }, 1800);
  }, []);

  const value = useMemo<ToastApi>(
    () => ({
      success: (message) => showToast('success', message),
      error: (message) => showToast('error', message),
    }),
    [showToast],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        aria-atomic="true"
        className="pointer-events-none fixed inset-x-0 top-4 z-50 mx-auto flex w-full max-w-[480px] justify-center px-4"
      >
        {toast ? (
          <div className={toastClassName(toast.kind)}>{toast.message}</div>
        ) : null}
      </div>
    </ToastContext.Provider>
  );
}
