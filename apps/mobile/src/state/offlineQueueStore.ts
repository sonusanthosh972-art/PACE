import { create } from 'zustand';

export interface QueuedTransaction {
  id: string;
  type: 'add' | 'update' | 'delete';
  payload: unknown;
  timestamp: number;
  retries: number;
  status: 'pending' | 'failed';
}

interface OfflineQueueStore {
  queue: QueuedTransaction[];
  add: (transaction: Omit<QueuedTransaction, 'id' | 'timestamp' | 'retries' | 'status'>) => string;
  remove: (id: string) => void;
  updateStatus: (id: string, status: 'pending' | 'failed') => void;
  incrementRetries: (id: string) => void;
  clear: () => void;
  getQueue: () => QueuedTransaction[];
}

export const useOfflineQueueStore = create<OfflineQueueStore>((set, get) => ({
  queue: [],
  add: (transaction) => {
    const id = Math.random().toString(36).substr(2, 9);
    const newTransaction: QueuedTransaction = {
      ...transaction,
      id,
      timestamp: Date.now(),
      retries: 0,
      status: 'pending',
    };
    set((state) => ({
      queue: [...state.queue, newTransaction],
    }));
    return id;
  },
  remove: (id) => {
    set((state) => ({
      queue: state.queue.filter((t) => t.id !== id),
    }));
  },
  updateStatus: (id, status) => {
    set((state) => ({
      queue: state.queue.map((t) => (t.id === id ? { ...t, status } : t)),
    }));
  },
  incrementRetries: (id) => {
    set((state) => ({
      queue: state.queue.map((t) => (t.id === id ? { ...t, retries: t.retries + 1 } : t)),
    }));
  },
  clear: () => {
    set({ queue: [] });
  },
  getQueue: () => get().queue,
}));
