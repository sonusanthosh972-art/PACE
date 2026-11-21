import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import { StyleSheet, useWindowDimensions } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { BrandLogo } from '@/components/brand/BrandLogo';
import { BRAND, BRAND_ANIMATION_BG, BRAND_ANIMATION_MS } from '@/theme/brand';
import { useTheme } from '@/theme/ThemeProvider';

export interface SplashScreenViewProps {
  /** When true, initialization (fonts, db, settings) has finished. */
  ready: boolean;
  /** Invoked once the splash screen exit animation completes. */
  onFinish?: () => void;
  /** Minimum time on screen before dismissing. Defaults to one play of the animation + a hold. */
  dwellMs?: number;
}

export const SPLASH_TIMING = {
  /** One play of the supplied GIF (9 frames × 180 ms). */
  animationMs: BRAND_ANIMATION_MS,
  /** The finished logo stays this long before the app appears. */
  holdMs: 400,
  fadeOutMs: 300,
} as const;

export const DEFAULT_DWELL_MS = SPLASH_TIMING.animationMs + SPLASH_TIMING.holdMs;

/**
 * Launch screen: the supplied PACE animation (streak → P → gauge and bars → PACE) plays once on
 * its own background, the finished logo holds, then the splash fades into the app as soon as the
 * app is ready. The GIF loops by itself, so after one play its last frame (a pixel copy) is shown
 * still. Reduce Motion shows the finished logo at once; if the GIF cannot play, the PNG logo is
 * shown instead.
 */
export function SplashScreenView({
  ready,
  onFinish,
  dwellMs = DEFAULT_DWELL_MS,
}: SplashScreenViewProps) {
  const { reducedMotion } = useTheme();
  const { width } = useWindowDimensions();
  const size = Math.min(Math.round(width * 0.78), 340);
  const [played, setPlayed] = useState(reducedMotion);
  const [failed, setFailed] = useState(false);
  const [minDwellElapsed, setMinDwellElapsed] = useState(reducedMotion || dwellMs <= 0);
  const opacity = useSharedValue(1);

  useEffect(() => {
    if (reducedMotion) return;
    const playedTimer = setTimeout(() => setPlayed(true), SPLASH_TIMING.animationMs);
    const dwellTimer = setTimeout(() => setMinDwellElapsed(true), Math.max(0, dwellMs));
    return () => {
      clearTimeout(playedTimer);
      clearTimeout(dwellTimer);
    };
  }, [reducedMotion, dwellMs]);

  const shouldDismiss = ready && minDwellElapsed;

  useEffect(() => {
    if (!shouldDismiss) return;
    if (reducedMotion || process.env.NODE_ENV === 'test') {
      onFinish?.();
      return;
    }
    opacity.value = withTiming(0, { duration: SPLASH_TIMING.fadeOutMs }, (finished) => {
      if (finished && onFinish) scheduleOnRN(onFinish);
    });
  }, [shouldDismiss, reducedMotion, opacity, onFinish]);

  const containerStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <Animated.View
      testID="splash-screen-view"
      style={[styles.container, containerStyle]}
      pointerEvents={shouldDismiss ? 'none' : 'auto'}
      accessible
      accessibilityRole="image"
      accessibilityLabel="PACE"
    >
      {failed ? (
        <BrandLogo size={Math.round(size * 0.62)} />
      ) : (
        <>
          {/* contentFit "contain" keeps the square animation's proportions on every screen. */}
          <Image
            testID="splash-animation"
            source={BRAND.animation}
            autoplay
            style={{ width: size, height: size }}
            contentFit="contain"
            transition={0}
            onError={() => setFailed(true)}
          />
          {played ? (
            <Image
              testID="splash-final-frame"
              source={BRAND.animationFinalFrame}
              style={[styles.overlay, { width: size, height: size }]}
              contentFit="contain"
              transition={0}
            />
          ) : null}
        </>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFill,
    // The animation's own background, so it never shows as a box.
    backgroundColor: BRAND_ANIMATION_BG,
    zIndex: 9999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  overlay: { position: 'absolute' },
});
