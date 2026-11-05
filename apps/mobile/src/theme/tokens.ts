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
  /** Bottom tab bar background. */
  nav: string;
  /** Strength of soft accent tints behind status messages (alpha 0–1). */
  softTint: number;
  /**
   * The Today hero: layers over the background image (a flat tint, a shade behind the header text,
   * a fade into `bg`), the text placed on the image, and the frosted card that overlaps it.
   */
  atmosphere: {
    tint: string;
    topShade: string;
    /** Gradient from the image into `bg`: colours and their positions (0 top → 1 bottom). */
    fade: readonly string[];
    fadeStops: readonly number[];
    onImage: string;
    onImageMuted: string;
    chrome: string;
    card: string;
    cardBorder: string;
    /** The safe-to-spend number: light mode is a touch heavier so it holds up on a pale card. */
    heroAmount: { fontFamily: string; letterSpacing: number };
  };
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
    nav: '#1F2125',
    softTint: 0.08,
    atmosphere: {
      tint: 'rgba(10, 11, 13, 0.08)',
      topShade: 'rgba(8, 10, 14, 0.35)',
      fade: ['rgba(22, 23, 26, 0)', 'rgba(22, 23, 26, 0.35)', '#16171A'],
      fadeStops: [0, 0.6, 1],
      onImage: '#F4F2EC',
      onImageMuted: 'rgba(244, 242, 236, 0.82)',
      chrome: 'rgba(14, 18, 22, 0.45)',
      card: 'rgba(17, 33, 29, 0.86)',
      cardBorder: 'rgba(123, 198, 164, 0.24)',
      heroAmount: { fontFamily: 'Inter_600SemiBold', letterSpacing: 0 },
    },
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
    bg: '#F7F8F5',
    surface: '#F1F3EF',
    elevated: '#E8ECE6',
    text: '#24262A',
    muted: '#6B6A66',
    border: '#E1E5DF',
    // Same mint as dark mode for graphics and the main button; text keeps the deeper green.
    accent: '#72CFA9',
    amber: '#B07C2A',
    coral: '#B85A4A',
    accentText: '#2F7356',
    amberText: '#85601F',
    coralText: '#9E4536',
    accentFill: '#72CFA9',
    onAccent: '#16171A',
    track: '#E2E7E1',
    scrim: 'rgba(36, 38, 42, 0.35)',
    nav: '#FBFBF8',
    softTint: 0.16,
    atmosphere: {
      // A light daylight wash softens the image; a long, gradual fade melts it into the page.
      tint: 'rgba(247, 248, 245, 0.14)',
      topShade: 'rgba(8, 10, 14, 0.28)',
      fade: [
        'rgba(247, 248, 245, 0)',
        'rgba(247, 248, 245, 0.2)',
        'rgba(247, 248, 245, 0.78)',
        '#F7F8F5',
      ],
      fadeStops: [0, 0.38, 0.68, 0.9],
      onImage: '#F4F2EC',
      onImageMuted: 'rgba(244, 242, 236, 0.85)',
      chrome: 'rgba(14, 18, 22, 0.35)',
      card: '#F1F3EF',
      cardBorder: 'rgba(36, 38, 42, 0.06)',
      heroAmount: { fontFamily: 'Inter_700Bold', letterSpacing: -0.5 },
    },
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
export const ICON = { sm: 16, md: 20, lg: 24 } as const;

/** Appends an alpha to a #RRGGBB colour, e.g. a soft tint of a category colour. */
export function withAlpha(hex: string, alpha: number): string {
  const a = Math.round(Math.min(1, Math.max(0, alpha)) * 255)
    .toString(16)
    .padStart(2, '0');
  return `${hex.slice(0, 7)}${a}`;
}

export const FONT = {
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semibold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
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
  /** Small uppercase section label. */
  overline: {
    fontSize: 12,
    lineHeight: 16,
    fontFamily: FONT.semibold,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
} as const;

export type TypeVariant = keyof typeof TYPE;

export const MOTION = {
  ringMs: 600,
  screenMs: 280,
  /** Number roll when an amount changes. */
  countMs: 650,
  /** Background crossfade when the time of day changes. */
  crossfadeMs: 900,
  /** Small list/feedback fades. */
  fadeMs: 200,
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
