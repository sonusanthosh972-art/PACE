import { create } from 'zustand';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface Toast {
  id: string;
  message: string;
  type: ToastType;
  duration?: number;
  action?: { label: string; onPress: () => void };
}

interface ToastStore {
  toasts: Toast[];
  show: (message: string, type?: ToastType, duration?: number) => string;
  showWithAction: (
    message: string,
    action: { label: string; onPress: () => void },
    type?: ToastType,
    duration?: number,
  ) => string;
  dismiss: (id: string) => void;
  clear: () => void;
}

export const useToastStore = create<ToastStore>((set, get) => ({
  toasts: [],
  show: (message, type = 'info', duration = 3000) => {
    const id = Math.random().toString(36).substr(2, 9);
    set((state) => ({
      toasts: [...state.toasts, { id, message, type, duration }],
    }));

    if (duration > 0) {
      setTimeout(() => get().dismiss(id), duration);
    }

    return id;
  },
  showWithAction: (message, action, type = 'info', duration = 5000) => {
    const id = Math.random().toString(36).substr(2, 9);
    set((state) => ({
      toasts: [...state.toasts, { id, message, type, action, duration }],
    }));

    if (duration > 0) {
      setTimeout(() => get().dismiss(id), duration);
    }

    return id;
  },
  dismiss: (id) => {
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id),
    }));
  },
  clear: () => {
    set({ toasts: [] });
  },
}));
