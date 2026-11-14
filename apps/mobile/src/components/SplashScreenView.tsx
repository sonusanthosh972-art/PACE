import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { WebView } from 'react-native-webview';

import { useTheme } from '@/theme/ThemeProvider';
import { COLORS } from '@/theme/tokens';

export interface SplashScreenViewProps {
  /** When true, initialization (fonts, db, settings) has finished. */
  ready: boolean;
  /** Invoked once the splash screen exit animation completes. */
  onFinish?: () => void;
  /** Minimum time on screen before dismissing. Defaults to logo formed + 1 s hold. */
  dwellMs?: number;
}

/** The app's own background, so the splash fades into the first screen without a step. */
const BACKGROUND_COLOR = COLORS.bg;

/**
 * A, C and E as Inter SemiBold outlines (the app's typeface), identical to assets/gemini-svg.svg.
 * Paths, not <text>: the WebView has no Inter, and a fallback font would change the logo.
 */
export const PACE_LETTER_PATHS = {
  A: 'M404.5 310L381 310L422.9 190L450.2 190L493.0 310L469.4 310L448.1 247.7Q444.9 238 441.6 225.8Q438.2 213.6 434.1 198.1L434.1 198.1L438.6 198.1Q434.6 213.8 431.3 226.0Q428.0 238.3 425.1 247.7L425.1 247.7L404.5 310ZM468.6 280.3L405.4 280.3L405.4 263.0L468.6 263.0L468.6 280.3Z',
  C: 'M560.0 311.6L560.0 311.6Q544.2 311.6 531.8 304.3Q519.4 297.0 512.2 283.2Q505.0 269.4 505.0 250.1L505.0 250.1Q505.0 230.7 512.2 216.9Q519.4 203.0 531.9 195.7Q544.3 188.4 560.0 188.4L560.0 188.4Q569.8 188.4 578.4 191.2Q586.9 193.9 593.7 199.3Q600.4 204.7 604.7 212.4Q609.1 220.1 610.5 229.9L610.5 229.9L588.9 229.9Q587.8 224.6 585.3 220.4Q582.7 216.3 579.0 213.5Q575.2 210.6 570.4 209.1Q565.7 207.6 560.3 207.6L560.3 207.6Q550.4 207.6 542.8 212.6Q535.2 217.5 530.9 227.0Q526.6 236.5 526.6 250.1L526.6 250.1Q526.6 263.9 531.0 273.3Q535.3 282.7 542.9 287.5Q550.5 292.4 560.2 292.4L560.2 292.4Q565.6 292.4 570.3 290.9Q575.1 289.4 578.9 286.5Q582.7 283.7 585.3 279.5Q587.9 275.4 588.9 270.1L588.9 270.1L610.6 270.1Q609.4 278.7 605.3 286.2Q601.3 293.7 594.7 299.4Q588.1 305.2 579.3 308.4Q570.6 311.6 560.0 311.6Z',
  E: 'M700.9 310L622.6 310L622.6 190L700.6 190L700.6 208.1L644.1 208.1L644.1 240.5L696.4 240.5L696.4 258.4L644.1 258.4L644.1 291.9L700.9 291.9L700.9 310Z',
} as const;

/**
 * Splash sequence (fast "coin travel"), timings in ms. Logo artwork, colours and proportions are
 * the SVG's own; the background is the app's, and only the motion differs:
 *  1. P darts in from off-screen right like a coin in flight, overshoots slightly, settles left.
 *  2. Right as it settles, A, C and E slide in from the right one after another to form PACE.
 *  3. The finished PACE holds for HOLD_MS, then the splash fades into the app.
 */
export const SPLASH_TIMING = {
  /** P travel: off-screen right → its final spot (x = 315, i.e. translateX -185). */
  pEnterMs: 900,
  /** Letters start just before the P fully settles, so the motion reads as one fluid cinematic gesture. */
  lettersStartMs: 800,
  letterMs: 640,
  letterStaggerMs: 180,
  /** Full logo held on screen in pristine clarity before transition. */
  holdMs: 1700,
  fadeOutMs: 500,
  /** P starting offset in SVG units (viewBox width 1000): fully off the right edge. */
  pStartX: 640,
  pFinalX: -185,
  /** Letters slide in from this far to the right of their final spot. */
  letterFromX: 56,
} as const;

/** Moment the last letter (E) is in place and PACE is complete. */
export const FORMED_MS =
  SPLASH_TIMING.lettersStartMs + 2 * SPLASH_TIMING.letterStaggerMs + SPLASH_TIMING.letterMs;

/** Default minimum time on screen: logo formed + 1 s hold. */
export const DEFAULT_DWELL_MS = FORMED_MS + SPLASH_TIMING.holdMs;

const ms = (value: number) => `${value}ms`;
const letterDelay = (index: number) =>
  SPLASH_TIMING.lettersStartMs + index * SPLASH_TIMING.letterStaggerMs;

function generateSvgHtml(reducedMotion: boolean): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
  <style>
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    html, body {
      width: 100%;
      height: 100%;
      overflow: hidden;
      background-color: transparent;
      display: flex;
      align-items: center;
      justify-content: center;
      -webkit-user-select: none;
      user-select: none;
    }
    svg {
      display: block;
      width: 100%;
      height: 100%;
    }
    ${
      reducedMotion
        ? `
    .p-icon {
      transform: translateX(-185px) scale(1);
    }
    .char-a, .char-c, .char-e {
      transform: translate(0px, 0px) scale(1);
      opacity: 1;
      filter: blur(0px);
    }
    `
        : `
    /* 1. P: coin-like dart in from the right, slight lean and overshoot, then settle left. */
    .p-icon {
      animation: coinP ${ms(SPLASH_TIMING.pEnterMs)} cubic-bezier(0.16, 1, 0.3, 1) both;
    }
    @keyframes coinP {
      0% {
        transform: translateX(${SPLASH_TIMING.pStartX}px) skewX(-12deg) scale(0.94);
        opacity: 0.7;
      }
      70% {
        transform: translateX(${SPLASH_TIMING.pFinalX - 10}px) skewX(2.5deg) scale(1.02);
        opacity: 1;
      }
      100% {
        transform: translateX(${SPLASH_TIMING.pFinalX}px) skewX(0deg) scale(1);
        opacity: 1;
      }
    }

    /* 2. A, C, E slide in from the right, one after another, forming PACE. */
    .char-a, .char-c, .char-e {
      animation: letterIn ${ms(SPLASH_TIMING.letterMs)} cubic-bezier(0.16, 1, 0.3, 1) both;
    }
    .char-a { animation-delay: ${ms(letterDelay(0))}; }
    .char-c { animation-delay: ${ms(letterDelay(1))}; }
    .char-e { animation-delay: ${ms(letterDelay(2))}; }
    @keyframes letterIn {
      0% {
        transform: translateX(${SPLASH_TIMING.letterFromX}px) scale(0.96);
        opacity: 0;
        filter: blur(8px);
      }
      100% {
        transform: translateX(0px) scale(1);
        opacity: 1;
        filter: blur(0px);
      }
    }
    `
    }
  </style>
</head>
<body>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 500" width="100%" height="100%">
  <defs>
    <linearGradient id="platinum" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#F8F9FA" />
      <stop offset="65%" stop-color="#F1F5F9" />
      <stop offset="100%" stop-color="#94A3B8" />
    </linearGradient>

    <linearGradient id="emerald" x1="0%" y1="100%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#059669" />
      <stop offset="50%" stop-color="#10E896" />
      <stop offset="100%" stop-color="#6EE7B7" />
    </linearGradient>

    <filter id="glow" x="-25%" y="-25%" width="150%" height="150%">
      <feGaussianBlur stdDeviation="5" result="blur" />
      <feComposite in="SourceGraphic" in2="blur" operator="over" />
    </filter>
  </defs>

  <g class="char-a">
    <path fill="url(#platinum)" d="${PACE_LETTER_PATHS.A}" />
  </g>

  <g class="char-c">
    <path fill="url(#platinum)" d="${PACE_LETTER_PATHS.C}" />
  </g>

  <g class="char-e">
    <path fill="url(#platinum)" d="${PACE_LETTER_PATHS.E}" />
  </g>

  <g class="p-icon" transform-origin="500 250">
    <path d="M 452 198 L 478 186 L 478 310 L 452 322 Z" fill="url(#emerald)" filter="url(#glow)" />
    <path d="M 488 186
             L 516 186
             A 38 38 0 0 1 554 224
             A 38 38 0 0 1 516 262
             L 488 262
             L 488 238
             L 514 238
             A 14 14 0 0 0 528 224
             A 14 14 0 0 0 514 210
             L 488 210 Z" fill="url(#platinum)" />
  </g>
</svg>
</body>
</html>`;
}

/**
 * PACE logo splash (artwork from assets/gemini-svg.svg) on the app background with the
 * coin-travel intro.
 * Stays until the app is ready and the logo has been fully formed for 1 s, then fades out.
 */
export function SplashScreenView({
  ready,
  onFinish,
  dwellMs = DEFAULT_DWELL_MS,
}: SplashScreenViewProps) {
  const { reducedMotion } = useTheme();
  const [minDwellElapsed, setMinDwellElapsed] = useState(dwellMs <= 0);
  const opacity = useSharedValue(1);
  const { width: screenWidth } = useWindowDimensions();

  // Logo width matches device size up to 400px, 2:1 aspect ratio (viewBox 1000x500)
  const logoWidth = Math.min(Math.round(screenWidth * 0.88), 400);
  const logoHeight = Math.round(logoWidth / 2);

  const htmlSource = useMemo(() => ({ html: generateSvgHtml(reducedMotion) }), [reducedMotion]);

  // Keep the splash up until PACE is formed and has been visible for the 1 s hold
  useEffect(() => {
    if (reducedMotion || dwellMs <= 0) return;
    const timer = setTimeout(() => {
      setMinDwellElapsed(true);
    }, dwellMs);
    return () => clearTimeout(timer);
  }, [reducedMotion, dwellMs]);

  const shouldDismiss = ready && (reducedMotion || dwellMs <= 0 || minDwellElapsed);

  useEffect(() => {
    if (shouldDismiss) {
      if (reducedMotion) {
        onFinish?.();
      } else {
        opacity.value = withTiming(0, { duration: SPLASH_TIMING.fadeOutMs }, (finished) => {
          if (finished && onFinish) {
            scheduleOnRN(onFinish);
          }
        });
        if (process.env.NODE_ENV === 'test') {
          onFinish?.();
        }
      }
    }
  }, [shouldDismiss, reducedMotion, opacity, onFinish]);

  const containerStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  return (
    <Animated.View
      testID="splash-screen-view"
      style={[styles.container, containerStyle]}
      pointerEvents={shouldDismiss ? 'none' : 'auto'}
      accessible
      accessibilityRole="image"
      accessibilityLabel="PACE"
    >
      <View style={[styles.logoContainer, { width: logoWidth, height: logoHeight }]}>
        <WebView
          testID="splash-logo-webview"
          source={htmlSource}
          originWhitelist={['*']}
          javaScriptEnabled={false}
          scrollEnabled={false}
          overScrollMode="never"
          showsHorizontalScrollIndicator={false}
          showsVerticalScrollIndicator={false}
          setSupportMultipleWindows={false}
          androidLayerType="software"
          pointerEvents="none"
          style={styles.webview}
          containerStyle={styles.webviewContainer}
        />
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFill,
    backgroundColor: BACKGROUND_COLOR,
    zIndex: 9999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoContainer: {
    backgroundColor: 'transparent',
    overflow: 'hidden',
  },
  webview: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  webviewContainer: {
    backgroundColor: 'transparent',
  },
});
