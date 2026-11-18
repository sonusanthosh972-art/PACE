import { Canvas, LinearGradient, Rect, vec } from '@shopify/react-native-skia';
import { memo, useEffect, useState } from 'react';
import { Image, StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { getTimeBackgroundAsset, TIME_BACKGROUND_ASPECT, type TimeOfDay } from '@/domain/timeOfDay';
import { useTheme } from '@/theme/ThemeProvider';
import { MOTION } from '@/theme/tokens';

/** Tall phones in landscape or tablets: never let the image take more than this much height. */
const MAX_HEIGHT = 520;

/**
 * Atmospheric city behind the top of the Today screen. Purely decorative: a tint and a fade into
 * the page background keep the numbers in front the focus. When the time of day changes the new
 * image crossfades over the old one once; nothing animates otherwise.
 */
function TimeBackgroundComponent({ timeOfDay }: { timeOfDay: TimeOfDay }) {
  const { colors, reducedMotion } = useTheme();
  const { width } = useWindowDimensions();
  const height = Math.min(MAX_HEIGHT, Math.round(width / TIME_BACKGROUND_ASPECT));

  // `shown` is the image on top; `previous` stays mounted underneath until the fade finishes.
  const [shown, setShown] = useState(timeOfDay);
  const [previous, setPrevious] = useState<TimeOfDay | null>(null);
  const opacity = useSharedValue(reducedMotion ? 1 : 0);

  // A new time of day: swap during render (React's pattern for state that follows a prop).
  if (timeOfDay !== shown) {
    setPrevious(reducedMotion ? null : shown);
    setShown(timeOfDay);
  }

  // Fade the top image in: on first mount, and over the old image after each change.
  useEffect(() => {
    if (reducedMotion) {
      opacity.value = 1;
      return;
    }
    opacity.value = 0;
    opacity.value = withTiming(1, { duration: MOTION.crossfadeMs }, (finished) => {
      if (finished) scheduleOnRN(setPrevious, null);
    });
  }, [shown, reducedMotion, opacity]);

  const fadeIn = useAnimatedStyle(() => ({ opacity: opacity.value }));
  // The image stops just short of the bottom: the fade drawn over it can round to a slightly
  // smaller pixel height, which otherwise leaves a 1px line of the image showing at the edge.
  const imageStyle = { width, height: height - 2 };

  return (
    <View
      style={[styles.container, { height }]}
      pointerEvents="none"
      accessible={false}
      importantForAccessibility="no-hide-descendants"
    >
      {previous ? (
        <Image
          testID="time-bg-previous"
          source={getTimeBackgroundAsset(previous)}
          style={[styles.previous, imageStyle]}
          resizeMode="cover"
        />
      ) : null}
      <Animated.View style={[StyleSheet.absoluteFill, fadeIn]}>
        <Image
          testID="time-bg-current"
          source={getTimeBackgroundAsset(shown)}
          style={imageStyle}
          resizeMode="cover"
        />
      </Animated.View>
      <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.atmosphere.tint }]} />
      <Canvas style={StyleSheet.absoluteFill}>
        <Rect x={0} y={0} width={width} height={height}>
          <LinearGradient
            start={vec(0, 0)}
            end={vec(0, height)}
            colors={[...colors.atmosphere.fade]}
            positions={[...colors.atmosphere.fadeStops]}
          />
        </Rect>
        {/* Keeps the header text on the image readable over bright skies. */}
        <Rect x={0} y={0} width={width} height={height * 0.45}>
          <LinearGradient
            start={vec(0, 0)}
            end={vec(0, height * 0.45)}
            colors={[colors.atmosphere.topShade, 'rgba(8, 10, 14, 0)']}
          />
        </Rect>
      </Canvas>
    </View>
  );
}

// EXPERIMENT (temporary): header image off to measure idle frames.
export const TimeBackground = memo(function Off(_p: { timeOfDay: TimeOfDay }) {
  void TimeBackgroundComponent;
  return null;
});

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    overflow: 'hidden',
  },
  previous: { position: 'absolute', top: 0, left: 0 },
});
