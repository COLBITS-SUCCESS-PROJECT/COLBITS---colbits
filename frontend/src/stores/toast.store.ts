/** Transient notification queue. */
import { create } from 'zustand'

type ToastLevel = 'info' | 'success' | 'warning' | 'error'

export interface Toast {
  id: string
  level: ToastLevel
  message: string
  durationMs?: number
}

interface ToastState {
  toasts: Toast[]
  push: (toast: Omit<Toast, 'id'>) => void
  dismiss: (id: string) => void
}

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  push: (toast) =>
    set((s) => ({
      toasts: [...s.toasts, { ...toast, id: crypto.randomUUID() }],
    })),
  dismiss: (id) =>
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}))
