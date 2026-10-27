import { create } from 'zustand';

/**
 * Whether the branded splash has finished and the app underneath is visible.
 * Screens that open with an animation (the welcome logo) wait for this, otherwise the
 * animation would play hidden behind the splash.
 */
export const useSplash = create<{ dismissed: boolean; dismiss(): void }>((set) => ({
  dismissed: false,
  dismiss: () => set({ dismissed: true }),
}));
