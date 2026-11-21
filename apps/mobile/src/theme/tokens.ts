import type { CategoryId } from '@/domain/categories';

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
  /** Primary button fill (teal), and the text/icon colour placed on it (≥ 4.5:1). */
  accentFill: string;
  onAccent: string;
  /** Mint teal: primary actions, the selected tab, money available to spend. */
  primary: string;
  /** Slightly lighter than bg: tab bar, input fields. */
  secondaryBg: string;
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
    /** Soft shadow behind text on the image, and under floating buttons. */
    shadow: string;
    chrome: string;
    card: string;
    cardBorder: string;
    /** Font for the safe-to-spend number. */
    heroAmount: { fontFamily: string; letterSpacing: number };
  };
  categories: Record<CategoryId, string>;
}

// The app is dark only: PACE obsidian with white text and mint teal (from the brand logo).
// No pure white or pure black anywhere.
export const COLORS: Palette = {
  bg: '#0B0F19',
  surface: '#111827',
  elevated: '#151E2D',
  text: '#F8FAFC',
  muted: '#94A3B8',
  border: '#273449',
  accent: '#2DD4BF',
  amber: '#FBBF24',
  coral: '#F87171',
  accentText: '#2DD4BF',
  amberText: '#FBBF24',
  coralText: '#F87171',
  accentFill: '#2DD4BF',
  onAccent: '#0B0F19',
  primary: '#2DD4BF',
  secondaryBg: '#1C2738',
  track: '#1C2738',
  scrim: 'rgba(5, 8, 15, 0.72)',
  nav: '#111827',
  softTint: 0.1,
  atmosphere: {
    // Obsidian tint over the city image, a shade behind the header text, and a fade into bg.
    tint: 'rgba(11, 15, 25, 0.22)',
    topShade: 'rgba(5, 8, 15, 0.5)',
    fade: ['rgba(11, 15, 25, 0)', 'rgba(11, 15, 25, 0.5)', '#0B0F19'],
    fadeStops: [0, 0.6, 1],
    onImage: '#F8FAFC',
    onImageMuted: '#CBD5E1',
    shadow: 'rgba(5, 8, 15, 0.55)',
    chrome: '#151E2D',
    card: '#111827',
    cardBorder: '#273449',
    heroAmount: { fontFamily: 'Inter_600SemiBold', letterSpacing: -0.5 },
  },
  categories: {
    food: '#FB923C',
    coffee: '#D6A274',
    groceries: '#34D399',
    transport: '#60A5FA',
    shopping: '#A78BFA',
    bills: '#FBBF24',
    subscriptions: '#818CF8',
    entertainment: '#F472B6',
    health: '#22D3EE',
    rent_emi: '#94A3B8',
    transfers: '#CBD5E1',
    cash: '#A3E635',
    other: '#64748B',
    uncategorised: '#475569',
  },
};

/** 4/8-point grid. Screens use 20 (gutter) at the sides and 24 between sections. */
export const SPACE = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  gutter: 20,
  xl: 24,
  xxl: 32,
  xxxl: 48,
} as const;
export const RADIUS = { sm: 10, md: 14, lg: 20, pill: 999 } as const;
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
  serifBold: 'PlayfairDisplay_700Bold',
  serifSemibold: 'PlayfairDisplay_600SemiBold',
} as const;

/** Sizes in points; line height 1.5× for running text. Hero 52pt, tabular numbers. */
export const TYPE = {
  hero: { fontSize: 38, lineHeight: 46, fontFamily: FONT.semibold },
  title: { fontSize: 32, lineHeight: 40, fontFamily: FONT.semibold },
  heading: { fontSize: 18, lineHeight: 26, fontFamily: FONT.semibold },
  body: { fontSize: 16, lineHeight: 24, fontFamily: FONT.regular },
  bodyStrong: { fontSize: 16, lineHeight: 24, fontFamily: FONT.medium },
  label: { fontSize: 15, lineHeight: 22, fontFamily: FONT.medium },
  caption: { fontSize: 13, lineHeight: 19, fontFamily: FONT.regular },
  /** Small uppercase section label. */
  overline: {
    fontSize: 12,
    lineHeight: 16,
    fontFamily: FONT.semibold,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  /** Display amount (kept name: used to be a serif). */
  serifHero: { fontSize: 38, lineHeight: 46, fontFamily: FONT.semibold, letterSpacing: -0.5 },
  /** Page title: "Insights", "Transactions". */
  serifTitle: {
    fontSize: 28,
    lineHeight: 36,
    fontFamily: FONT.semibold,
    letterSpacing: -0.4,
  },
  /** Section heading. */
  serifHeading: {
    fontSize: 20,
    lineHeight: 28,
    fontFamily: FONT.semibold,
    letterSpacing: -0.2,
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
  /** Switching between bottom tabs. */
  tabMs: 260,
  /** Delay between cards easing in one after another. */
  staggerMs: 60,
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
