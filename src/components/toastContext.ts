import { createContext } from 'react';

export type ToastKind = 'success' | 'error';

export interface ToastApi {
  success: (message: string) => void;
  error: (message: string) => void;
}

export interface ToastState {
  id: number;
  kind: ToastKind;
  message: string;
}

export const ToastContext = createContext<ToastApi | null>(null);
