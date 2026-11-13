import { create } from 'zustand';

export type FontSizeScale = 0.8 | 1 | 1.2 | 1.5;
export type HighContrastMode = 'off' | 'on';

interface A11yStore {
  fontSizeScale: FontSizeScale;
  highContrast: HighContrastMode;
  setFontSizeScale: (scale: FontSizeScale) => void;
  setHighContrast: (mode: HighContrastMode) => void;
}

export const useA11yStore = create<A11yStore>((set) => ({
  fontSizeScale: 1,
  highContrast: 'off',
  setFontSizeScale: (scale) => set({ fontSizeScale: scale }),
  setHighContrast: (mode) => set({ highContrast: mode }),
}));
