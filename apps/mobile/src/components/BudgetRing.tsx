import { Canvas, Path, Skia } from '@shopify/react-native-skia';
import { useEffect, useMemo, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeIn, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';

import { useTheme } from '@/theme/ThemeProvider';
import { MOTION } from '@/theme/tokens';

import type { RingTone } from '@/lib/today';

interface BudgetRingProps {
  /** Fraction of today's budget still left, 0–1. */
  remainingFraction: number;
  tone: RingTone;
  size?: number;
  strokeWidth?: number;
  children?: ReactNode;
  accessibilityLabel: string;
}

/**
 * Hero ring: remaining vs today's budget. Animates from 0 on open (600 ms spring) and eases to
 * new values when a transaction arrives. Runs on the UI thread (Skia + Reanimated shared value).
 */
export function BudgetRing({
  remainingFraction,
  tone,
  size = 260,
  strokeWidth = 18,
  children,
  accessibilityLabel,
}: BudgetRingProps) {
  const { colors, reducedMotion } = useTheme();
  const target = Math.min(1, Math.max(0, remainingFraction));
  const progress = useSharedValue(reducedMotion ? target : 0);

  useEffect(() => {
    progress.value = reducedMotion
      ? withTiming(target, { duration: 0 })
      : withSpring(target, { duration: MOTION.ringMs, dampingRatio: 0.9 });
  }, [target, reducedMotion, progress]);

  const path = useMemo(() => {
    const p = Skia.Path.Make();
    const inset = strokeWidth / 2 + 1;
    // Start at 12 o'clock and sweep clockwise.
    p.addArc({ x: inset, y: inset, width: size - inset * 2, height: size - inset * 2 }, -90, 359.9);
    return p;
  }, [size, strokeWidth]);

  const color = tone === 'over' ? colors.coral : tone === 'warn' ? colors.amber : colors.accent;

  return (
    <Animated.View
      entering={reducedMotion ? FadeIn.duration(200) : undefined}
      style={[styles.wrap, { width: size, height: size }]}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(target * 100) }}
    >
      <Canvas style={StyleSheet.absoluteFill}>
        <Path path={path} style="stroke" strokeWidth={strokeWidth} color={colors.track} />
        <Path
          path={path}
          style="stroke"
          strokeWidth={strokeWidth}
          strokeCap="round"
          color={color}
          start={0}
          end={progress}
        />
      </Canvas>
      <View style={styles.center} importantForAccessibility="no-hide-descendants">
        {children}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignSelf: 'center', alignItems: 'center', justifyContent: 'center' },
  center: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28 },
});
