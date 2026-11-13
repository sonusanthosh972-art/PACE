import type { ReactNode } from 'react';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';

import { useTheme } from '@/theme/ThemeProvider';
import { MOTION } from '@/theme/tokens';

/** Header steps that ease in before the page's content does. */
const AFTER_HEADER = 3;

/**
 * Eases a block of content in when a page first opens, `order` steps after the one before it, so
 * cards arrive one after another instead of all at once. Runs once on mount, never on re-render;
 * a plain fade when the system asks for reduced motion.
 */
export function Reveal({ order, children }: { order: number; children: ReactNode }) {
  const { reducedMotion } = useTheme();
  return (
    <Animated.View
      entering={
        reducedMotion
          ? FadeIn.duration(MOTION.fadeMs)
          : FadeInDown.duration(MOTION.screenMs).delay((AFTER_HEADER + order) * MOTION.staggerMs)
      }
    >
      {children}
    </Animated.View>
  );
}
