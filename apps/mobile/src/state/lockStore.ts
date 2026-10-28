import { create } from 'zustand';

interface LockState {
  isLocked: boolean;
  unlock: () => void;
  lock: () => void;
  setLocked: (locked: boolean) => void;
}

export const useLockStore = create<LockState>((set) => ({
  isLocked: true,
  unlock: () => set({ isLocked: false }),
  lock: () => set({ isLocked: true }),
  setLocked: (locked: boolean) => set({ isLocked: locked }),
}));
