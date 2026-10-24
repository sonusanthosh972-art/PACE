import type { CategoryId } from '@/domain/categories';

export type ColorScheme = 'dark' | 'light';

export interface Palette {
  bg: string;
  surface: string;
  elevated: string;
  text: string;
  muted: string;
  border: string;
  /** Graphic colours (ring, bars, large hero numbers). */
  accent: string;
  amber: string;
  coral: string;
  /** Same hues tuned for ≥ 4.5:1 as body-size text on bg/surface. */
  accentText: string;
  amberText: string;
  coralText: string;
  /** Primary button fill, and the text/icon colour placed on it (≥ 4.5:1). */
  accentFill: string;
  onAccent: string;
  track: string;
  scrim: string;
  categories: Record<CategoryId, string>;
}

// No pure white or pure black anywhere.
export const PALETTES: Record<ColorScheme, Palette> = {
  dark: {
    bg: '#16171A',
    surface: '#1F2125',
    elevated: '#282B30',
    text: '#E9E7E2',
    muted: '#9C9A94',
    border: '#33363C',
    accent: '#7BC6A4',
    amber: '#E3B169',
    coral: '#E08A7A',
    accentText: '#7BC6A4',
    amberText: '#E3B169',
    coralText: '#E08A7A',
    accentFill: '#7BC6A4',
    onAccent: '#16171A',
    track: '#2C2F35',
    scrim: 'rgba(10, 11, 13, 0.6)',
    categories: {
      food: '#E08A7A',
      coffee: '#C9A27E',
      groceries: '#7BC6A4',
      transport: '#7FA8D1',
      shopping: '#C79BD1',
      bills: '#E3B169',
      subscriptions: '#9AA7E0',
      entertainment: '#D99BB6',
      health: '#8ACBC7',
      rent_emi: '#A3A19A',
      transfers: '#B8B4A8',
      cash: '#B5C98A',
      other: '#8F8D88',
      uncategorised: '#6F6D69',
    },
  },
  light: {
    bg: '#F5F3EE',
    surface: '#FCFBF8',
    elevated: '#EFECE6',
    text: '#24262A',
    muted: '#6B6A66',
    border: '#E2DED6',
    accent: '#3E8E6B',
    amber: '#B07C2A',
    coral: '#B85A4A',
    accentText: '#2F7356',
    amberText: '#85601F',
    coralText: '#9E4536',
    accentFill: '#2F7356',
    onAccent: '#FCFBF8',
    track: '#E6E2DA',
    scrim: 'rgba(36, 38, 42, 0.35)',
    categories: {
      food: '#B85A4A',
      coffee: '#8C6A4A',
      groceries: '#3E8E6B',
      transport: '#4A739C',
      shopping: '#8A5C96',
      bills: '#B07C2A',
      subscriptions: '#5E6BAA',
      entertainment: '#A55C7E',
      health: '#3F8682',
      rent_emi: '#7A7870',
      transfers: '#8E8A7E',
      cash: '#6F8642',
      other: '#77756F',
      uncategorised: '#9A978F',
    },
  },
};

export const SPACE = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 48 } as const;
export const RADIUS = { sm: 10, md: 16, lg: 22, pill: 999 } as const;
export const MIN_TOUCH = 48;

export const FONT = {
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semibold: 'Inter_600SemiBold',
} as const;

/** Sizes in points; line height 1.5× for running text. Hero 52pt, tabular numbers. */
export const TYPE = {
  hero: { fontSize: 52, lineHeight: 62, fontFamily: FONT.semibold },
  title: { fontSize: 24, lineHeight: 32, fontFamily: FONT.semibold },
  heading: { fontSize: 19, lineHeight: 28, fontFamily: FONT.semibold },
  body: { fontSize: 16, lineHeight: 24, fontFamily: FONT.regular },
  bodyStrong: { fontSize: 16, lineHeight: 24, fontFamily: FONT.medium },
  label: { fontSize: 15, lineHeight: 22, fontFamily: FONT.medium },
  caption: { fontSize: 14, lineHeight: 21, fontFamily: FONT.regular },
} as const;

export type TypeVariant = keyof typeof TYPE;

export const MOTION = {
  ringMs: 600,
  screenMs: 280,
  pressScale: 0.97,
  spring: { damping: 18, stiffness: 180, mass: 1 },
} as const;

/* ---- WCAG contrast helpers (used by tests and dev checks) ---- */

function channel(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

export function luminance(hex: string): number {
  const v = hex.replace('#', '');
  const r = parseInt(v.slice(0, 2), 16);
  const g = parseInt(v.slice(2, 4), 16);
  const b = parseInt(v.slice(4, 6), 16);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}
