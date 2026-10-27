import {
  BlurMask,
  Canvas,
  Group,
  LinearGradient,
  Path,
  Skia,
  vec,
} from '@shopify/react-native-skia';
import { useEffect, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { AppText } from '@/components/AppText';
import { useTheme } from '@/theme/ThemeProvider';
import { FONT, SPACE } from '@/theme/tokens';

export interface AppLogoProps {
  /** Height / size of the icon mark in points. Default is 48. */
  size?: number;
  /**
   * - 'mark': Iconic P symbol (emerald slit stem + platinum bowl).
   * - 'full': P mark + PACE / Paisa Pulse wordmark.
   * - 'hero': Large centered presentation with optional tagline.
   */
  variant?: 'mark' | 'full' | 'hero';
  /** Animate subtle breathing/glow on the emerald stem. */
  animated?: boolean;
  /** Subtitle / Tagline shown under the brand name. */
  tagline?: string;
  /** Light/dark mode tone override (e.g. for carbon splash screen). */
  tone?: 'dark' | 'light' | 'auto';
}

/**
 * Native vector renderer for the PACE / Paisa Pulse logo from assets/gemini-svg.svg.
 * Renders the emerald slit stem, platinum geometric bowl, and brushed typography
 * with GPU-accelerated Skia vectors and optional breathing micro-animations.
 */
export function AppLogo({
  size = 48,
  variant = 'mark',
  animated = false,
  tagline,
  tone = 'auto',
}: AppLogoProps) {
  const { scheme, reducedMotion } = useTheme();
  const isDark = tone === 'auto' ? scheme === 'dark' : tone === 'dark';

  // Mark bounding box in SVG space (minX 452, minY 186, width 102, height 136)
  const svgWidth = 102;
  const svgHeight = 136;
  const padding = 12; // breathing room for glow blur
  const canvasWidth = size;
  const canvasHeight = (size * (svgHeight + padding * 2)) / (svgWidth + padding * 2);

  const scale = canvasWidth / (svgWidth + padding * 2);
  const translateX = -452 * scale + padding * scale;
  const translateY = -186 * scale + padding * scale;

  // Pulse glow animation
  const glowPulse = useSharedValue(1);

  useEffect(() => {
    if (!animated || reducedMotion) {
      glowPulse.value = 1;
      return;
    }
    glowPulse.value = withRepeat(
      withSequence(withTiming(1.2, { duration: 2100 }), withTiming(0.95, { duration: 2100 })),
      -1,
      true,
    );
  }, [animated, reducedMotion, glowPulse]);

  const animatedGlowStyle = useAnimatedStyle(() => ({
    opacity: glowPulse.value,
    transform: [{ scale: 0.98 + 0.04 * glowPulse.value }],
  }));

  const stemPath = useMemo(() => {
    try {
      return Skia.PathBuilder.Make()
        .moveTo(452, 198)
        .lineTo(478, 186)
        .lineTo(478, 310)
        .lineTo(452, 322)
        .close()
        .detach();
    } catch {
      return null;
    }
  }, []);

  const bowlPath = useMemo(() => {
    try {
      return Skia.PathBuilder.Make()
        .moveTo(488, 186)
        .lineTo(516, 186)
        .arcToOval({ x: 478, y: 186, width: 76, height: 76 }, -90, 180, false)
        .lineTo(488, 262)
        .lineTo(488, 238)
        .lineTo(514, 238)
        .arcToOval({ x: 500, y: 210, width: 28, height: 28 }, 90, -180, false)
        .lineTo(488, 210)
        .close()
        .detach();
    } catch {
      return null;
    }
  }, []);

  const logoMark = (
    <Animated.View
      style={[
        styles.markWrap,
        { width: canvasWidth, height: canvasHeight },
        animated && animatedGlowStyle,
      ]}
      accessible
      accessibilityRole="image"
      accessibilityLabel="Paisa Pulse logo mark"
    >
      <Canvas style={StyleSheet.absoluteFill}>
        {/* Ambient glow behind emerald stem */}
        {stemPath ? (
          <Group transform={[{ translateX }, { translateY }, { scale }]}>
            <Path path={stemPath} color="rgba(16, 232, 150, 0.4)">
              <BlurMask blur={Math.max(4, 8 * scale)} style="solid" />
            </Path>
          </Group>
        ) : null}

        {/* Stem & Bowl */}
        <Group transform={[{ translateX }, { translateY }, { scale }]}>
          {stemPath ? (
            <Path path={stemPath}>
              <LinearGradient
                start={vec(452, 322)}
                end={vec(478, 186)}
                colors={['#059669', '#10E896', '#6EE7B7']}
              />
            </Path>
          ) : null}
          {bowlPath ? (
            <Path path={bowlPath}>
              <LinearGradient
                start={vec(488, 186)}
                end={vec(488, 262)}
                colors={
                  isDark ? ['#F8F9FA', '#F1F5F9', '#94A3B8'] : ['#24262A', '#3F444E', '#64748B']
                }
              />
            </Path>
          ) : null}
        </Group>
      </Canvas>
    </Animated.View>
  );

  if (variant === 'mark') {
    return logoMark;
  }

  if (variant === 'hero') {
    return (
      <View style={styles.heroWrap} accessible accessibilityRole="header">
        {logoMark}
        <View style={styles.heroTextWrap}>
          <AppText variant="hero" style={[styles.brandTitle, !isDark && styles.brandTitleLight]}>
            Paisa Pulse
          </AppText>
          <AppText variant="label" color="accentText" style={styles.heroBadge}>
            PACE ENGINE
          </AppText>
          {tagline ? (
            <AppText color="muted" center style={styles.heroTagline}>
              {tagline}
            </AppText>
          ) : null}
        </View>
      </View>
    );
  }

  // variant === 'full' (inline horizontal logo)
  return (
    <View style={styles.fullRow} accessible accessibilityRole="header">
      {logoMark}
      <View style={styles.fullTextWrap}>
        <AppText
          variant="heading"
          style={[styles.brandNameInline, !isDark && styles.brandTitleLight]}
        >
          Paisa Pulse
        </AppText>
        {tagline ? (
          <AppText variant="caption" color="muted">
            {tagline}
          </AppText>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  markWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACE.md,
  },
  heroTextWrap: {
    alignItems: 'center',
    gap: 4,
  },
  brandTitle: {
    fontFamily: FONT.semibold,
    letterSpacing: -0.5,
    fontSize: 34,
    lineHeight: 40,
  },
  brandTitleLight: {
    color: '#16171A',
  },
  heroBadge: {
    letterSpacing: 2,
    fontSize: 11,
    fontFamily: FONT.semibold,
    opacity: 0.9,
  },
  heroTagline: {
    marginTop: SPACE.xs,
    maxWidth: 280,
    fontSize: 15,
    lineHeight: 22,
  },
  fullRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.sm + 2,
  },
  fullTextWrap: {
    justifyContent: 'center',
  },
  brandNameInline: {
    fontFamily: FONT.semibold,
    fontSize: 20,
    lineHeight: 24,
    letterSpacing: -0.3,
  },
});
