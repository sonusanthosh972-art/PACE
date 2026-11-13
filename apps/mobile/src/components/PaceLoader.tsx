import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import { useTheme } from '@/theme/ThemeProvider';
import { FONT } from '@/theme/tokens';

import { AppLogo } from './AppLogo';
import { FORMED_MS, SPLASH_TIMING } from './SplashScreenView';

/**
 * The splash's choreography at twice the speed: most loads take well under a second, and at
 * splash speed the A, C and E would not even start before the content arrived.
 */
const SPEED = 2;
const P_ENTER_MS = SPLASH_TIMING.pEnterMs / SPEED;
const LETTERS_START_MS = SPLASH_TIMING.lettersStartMs / SPEED;
const LETTER_STAGGER_MS = SPLASH_TIMING.letterStaggerMs / SPEED;
const LETTER_MS = SPLASH_TIMING.letterMs / SPEED;
/** PACE is complete at this point of each loop. */
export const LOADER_FORMED_MS = FORMED_MS / SPEED;
/** After PACE is formed it holds, fades, and the loop starts again. */
const HOLD_MS = 500;
const FADE_MS = 300;
export const PACE_LOOP_MS = LOADER_FORMED_MS + HOLD_MS + FADE_MS;
const FADE_START_MS = LOADER_FORMED_MS + HOLD_MS;

/**
 * The splash's easing, cubic-bezier(0.16, 1, 0.3, 1), is an exponential ease-out: fast start, long
 * soft landing. Written as a plain worklet so it runs on the UI thread every frame (a bezier built
 * on the JS thread carries lookup tables that do not reliably reach the UI thread).
 */
function EASE(x: number): number {
  'worklet';
  return x >= 1 ? 1 : 1 - Math.pow(2, -10 * x);
}

const LETTERS = ['A', 'C', 'E'] as const;

const SIZES = {
  /** Page loading: the same proportions as the splash, smaller. */
  lg: { mark: 34, font: 40, gap: 2 },
  /** Inside a button. */
  sm: { mark: 15, font: 17, gap: 1 },
} as const;

interface PaceLoaderProps {
  size?: keyof typeof SIZES;
  /**
   * Draw every letter, including the P, in one colour (for use on a coloured button). Without it
   * the real logo mark is used, with platinum letters, exactly like the splash.
   */
  color?: string;
}

/**
 * The splash's PACE animation, looping while something loads: the P darts in from the right with
 * a slight lean and overshoot, A, C and E slide in one after another, the word holds, fades, and
 * it starts again. One clock drives everything on the UI thread. With "Reduce motion" on, PACE
 * simply shows, still.
 */
export function PaceLoader({ size = 'lg', color }: PaceLoaderProps) {
  const { reducedMotion } = useTheme();
  const dims = SIZES[size];
  const t = useSharedValue(reducedMotion ? LOADER_FORMED_MS : 0);

  useEffect(() => {
    if (reducedMotion) {
      t.value = LOADER_FORMED_MS;
      return;
    }
    t.value = 0;
    t.value = withRepeat(
      withTiming(PACE_LOOP_MS, { duration: PACE_LOOP_MS, easing: Easing.linear }),
      -1,
      false,
    );
    return () => cancelAnimation(t);
  }, [reducedMotion, t]);

  // The P enters from about three letter-widths to the right, as it does from off-screen.
  const pFrom = dims.font * 3;
  const letterFrom = (SPLASH_TIMING.letterFromX / 168) * dims.font * 1.6;

  const whole = useAnimatedStyle(() => ({
    opacity:
      t.value < FADE_START_MS
        ? 1
        : interpolate(t.value, [FADE_START_MS, PACE_LOOP_MS], [1, 0], 'clamp'),
  }));

  const pStyle = useAnimatedStyle(() => {
    const f = EASE(Math.min(1, t.value / P_ENTER_MS));
    return {
      opacity: interpolate(f, [0, 0.7, 1], [0.7, 1, 1]),
      transform: [
        { translateX: interpolate(f, [0, 0.7, 1], [pFrom, -dims.font * 0.06, 0]) },
        { skewX: `${interpolate(f, [0, 0.7, 1], [-12, 2.5, 0])}deg` },
        { scale: interpolate(f, [0, 0.7, 1], [0.94, 1.02, 1]) },
      ],
    };
  });

  const textColor = color ?? '#F1F5F9';

  return (
    <Animated.View
      style={[styles.row, { gap: dims.gap }, whole]}
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
    >
      <Animated.View style={pStyle}>
        {color ? (
          <Animated.Text
            style={[styles.letter, { fontSize: dims.font, lineHeight: dims.font * 1.15, color }]}
          >
            P
          </Animated.Text>
        ) : (
          <View style={{ height: dims.font * 1.15, justifyContent: 'center' }}>
            <AppLogo size={dims.mark} variant="mark" tone="dark" />
          </View>
        )}
      </Animated.View>
      {LETTERS.map((letter, i) => (
        <Letter
          key={letter}
          letter={letter}
          index={i}
          t={t}
          fontSize={dims.font}
          fromX={letterFrom}
          color={textColor}
        />
      ))}
    </Animated.View>
  );
}

function Letter({
  letter,
  index,
  t,
  fontSize,
  fromX,
  color,
}: {
  letter: string;
  index: number;
  t: SharedValue<number>;
  fontSize: number;
  fromX: number;
  color: string;
}) {
  const start = LETTERS_START_MS + index * LETTER_STAGGER_MS;
  const style = useAnimatedStyle(() => {
    const f = EASE(Math.min(1, Math.max(0, (t.value - start) / LETTER_MS)));
    return {
      opacity: f,
      transform: [{ translateX: (1 - f) * fromX }, { scale: 0.96 + 0.04 * f }],
    };
  });
  return (
    <Animated.Text style={[styles.letter, { fontSize, lineHeight: fontSize * 1.15, color }, style]}>
      {letter}
    </Animated.Text>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  letter: { fontFamily: FONT.semibold, includeFontPadding: false },
});
