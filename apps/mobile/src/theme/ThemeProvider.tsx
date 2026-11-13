import * as SystemUI from 'expo-system-ui';
import { createContext, useContext, useEffect, useMemo, type ReactNode } from 'react';
import { useReducedMotion } from 'react-native-reanimated';

import { COLORS, type Palette } from './tokens';

export interface Theme {
  colors: Palette;
  /** System "Reduce motion": replace movement with simple fades. */
  reducedMotion: boolean;
}

const ThemeContext = createContext<Theme>({ colors: COLORS, reducedMotion: false });

/** The app is dark only; this provides the colours and the system "Reduce motion" setting. */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const reducedMotion = useReducedMotion();
  const theme = useMemo<Theme>(() => ({ colors: COLORS, reducedMotion }), [reducedMotion]);

  useEffect(() => {
    SystemUI.setBackgroundColorAsync(COLORS.bg).catch(() => undefined);
  }, []);

  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  return useContext(ThemeContext);
}
