/**
 * The supplied PACE brand assets, referenced from one place. The files are used exactly as
 * supplied (assets/logo); the two "frame" stills are pixel copies of the GIF's first and last
 * frames (DECISIONS.md D36).
 */
export const BRAND = {
  /** Static logo: the P mark and PACE on a dark rounded tile (1254×1254, black outside the tile). */
  logo: require('../../assets/logo/Futuristic PACE Progress Logo.png'),
  /** Launch animation: streak → P → gauge and bars → PACE (414×414, 9 × 180 ms, loops). */
  animation: require('../../assets/logo/PACE Logo Animation Grid.gif'),
  /** The animation's last frame: the finished logo, held after one play. */
  animationFinalFrame: require('../../assets/logo/PACE Logo Animation Grid - final frame.png'),
} as const;

/** One play of the GIF: 9 frames × 180 ms. */
export const BRAND_ANIMATION_MS = 1620;

/** The GIF's own background (measured), so the animation never shows as a box. */
export const BRAND_ANIMATION_BG = '#030914';

/**
 * Where the dark rounded tile sits inside the logo PNG (measured): 57 px in from each edge of
 * 1254, corners ≈ 26% of the tile. The image is cropped to the tile so the black square around
 * it never shows on the app background.
 */
export const BRAND_TILE = { insetRatio: 57 / 1254, radiusRatio: 0.26, color: '#030C17' } as const;
