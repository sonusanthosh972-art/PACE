import { create } from 'zustand';

/** True while the first-run 90-day SMS import is running (Today shows a calm progress note). */
export const useImportStatus = create<{ importing: boolean; setImporting(v: boolean): void }>(
  (set) => ({
    importing: false,
    setImporting: (importing) => set({ importing }),
  }),
);
