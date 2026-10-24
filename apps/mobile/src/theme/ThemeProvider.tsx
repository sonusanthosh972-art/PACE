import { createContext, useContext, useEffect, useMemo, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import * as SystemUI from 'expo-system-ui';

import type { Settings } from '@/data/settingsRepo';

import { PALETTES, type ColorScheme, type Palette } from './tokens';

export interface Theme {
  scheme: ColorScheme;
  colors: Palette;
  /** System "Reduce motion": replace movement with simple fades. */
  reducedMotion: boolean;
}

const ThemeContext = createContext<Theme>({
  scheme: 'dark',
  colors: PALETTES.dark,
  reducedMotion: false,
});

export function resolveScheme(
  preference: Settings['theme'],
  system: string | null | undefined,
): ColorScheme {
  if (preference === 'light' || preference === 'dark') return preference;
  return system === 'light' ? 'light' : 'dark'; // dark is the default
}

export function ThemeProvider({
  preference,
  children,
}: {
  preference: Settings['theme'];
  children: ReactNode;
}) {
  const system = useColorScheme();
  const reducedMotion = useReducedMotion();
  const scheme = resolveScheme(preference, system);

  const theme = useMemo<Theme>(
    () => ({ scheme, colors: PALETTES[scheme], reducedMotion }),
    [scheme, reducedMotion],
  );

  useEffect(() => {
    SystemUI.setBackgroundColorAsync(theme.colors.bg).catch(() => undefined);
  }, [theme.colors.bg]);

  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  return useContext(ThemeContext);
}
