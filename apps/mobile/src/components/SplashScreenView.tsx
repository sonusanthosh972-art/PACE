import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { WebView } from 'react-native-webview';

import { useTheme } from '@/theme/ThemeProvider';

export interface SplashScreenViewProps {
  /** When true, initialization (fonts, db, settings) has finished. */
  ready: boolean;
  /** Invoked once the splash screen exit animation completes. */
  onFinish?: () => void;
  /** Minimum time on screen before dismissing. Defaults to logo formed + 1 s hold. */
  dwellMs?: number;
}

const BACKGROUND_COLOR = '#0B0D11';

/**
 * Splash sequence (fast "coin travel"), timings in ms. Logo artwork, colours, proportions and
 * background are the SVG's own and unchanged; only the motion differs:
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
    .bg-rect {
      fill: transparent;
    }
    .real-letter {
      font-family: 'Outfit', 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif;
      font-size: 168px;
      font-weight: 700;
      fill: url(#platinum);
      dominant-baseline: central;
      text-anchor: middle;
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

  <rect width="1000" height="500" class="bg-rect" />

  <g class="char-a">
    <text x="435" y="250" class="real-letter">A</text>
  </g>

  <g class="char-c">
    <text x="555" y="250" class="real-letter">C</text>
  </g>

  <g class="char-e">
    <text x="670" y="250" class="real-letter">E</text>
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
 * PACE logo splash (artwork from assets/gemini-svg.svg) on #0B0D11 with the coin-travel intro.
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
      accessibilityLabel="Paisa Pulse"
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
