import { Image } from 'expo-image';
import { ActivityIndicator, View } from 'react-native';

import { BRAND } from '@/theme/brand';
import { useTheme } from '@/theme/ThemeProvider';

interface PaceLoaderProps {
  /** `lg`: a page is loading (the PACE animation). `sm`: inside a button (a small spinner). */
  size?: 'lg' | 'sm';
  /** Spinner colour for `sm` (e.g. the button's text colour). */
  color?: string;
}

/** Page loader size in points; the supplied animation is square. */
export const LOADER_SIZE = 112;

/**
 * Loading indicator. Pages show the supplied PACE animation, which repeats only while something is
 * loading; with Reduce Motion the finished logo is shown still. Buttons show a small spinner.
 */
export function PaceLoader({ size = 'lg', color }: PaceLoaderProps) {
  const { colors, reducedMotion } = useTheme();
  if (size === 'sm') {
    return (
      <ActivityIndicator
        size="small"
        color={color ?? colors.primary}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      />
    );
  }
  return (
    <View
      testID="pace-loader"
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
    >
      <Image
        testID="pace-loader-image"
        source={reducedMotion ? BRAND.animationFinalFrame : BRAND.animation}
        autoplay={!reducedMotion}
        style={{ width: LOADER_SIZE, height: LOADER_SIZE }}
        contentFit="contain"
        transition={0}
      />
    </View>
  );
}
