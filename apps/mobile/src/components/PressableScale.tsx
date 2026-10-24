import type { ReactNode } from 'react';
import { Pressable, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { useTheme } from '@/theme/ThemeProvider';
import { MOTION } from '@/theme/tokens';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export interface PressableScaleProps extends Omit<PressableProps, 'style' | 'children'> {
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
}

/**
 * Tactile press feedback: scales to 0.97 and springs back. With "Reduce motion" on, it uses a
 * gentle opacity dip instead of movement.
 */
export function PressableScale({
  style,
  children,
  onPressIn,
  onPressOut,
  ...rest
}: PressableScaleProps) {
  const { reducedMotion } = useTheme();
  const pressed = useSharedValue(0);

  const animatedStyle = useAnimatedStyle(() =>
    reducedMotion
      ? { opacity: 1 - pressed.value * 0.25 }
      : { transform: [{ scale: 1 - pressed.value * (1 - MOTION.pressScale) }] },
  );

  return (
    <AnimatedPressable
      {...rest}
      onPressIn={(e) => {
        pressed.value = reducedMotion
          ? withTiming(1, { duration: 80 })
          : withSpring(1, MOTION.spring);
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        pressed.value = reducedMotion
          ? withTiming(0, { duration: 120 })
          : withSpring(0, MOTION.spring);
        onPressOut?.(e);
      }}
      style={[style, animatedStyle]}
    >
      {children}
    </AnimatedPressable>
  );
}
