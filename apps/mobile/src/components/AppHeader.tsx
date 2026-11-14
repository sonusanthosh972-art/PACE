import { router } from 'expo-router';
import { StyleSheet, View, type TextStyle } from 'react-native';
import Animated, {
  FadeIn,
  FadeInDown,
  useAnimatedStyle,
  type SharedValue,
} from 'react-native-reanimated';

import { useTimeOfDay } from '@/lib/useTimeOfDay';
import { useAuthStore } from '@/state/authStore';
import { useReviewCount } from '@/state/queries';
import { useTheme } from '@/theme/ThemeProvider';
import { ICON, MIN_TOUCH, MOTION, RADIUS, SPACE } from '@/theme/tokens';

import { AppLogo } from './AppLogo';
import { AppText } from './AppText';
import { Icon } from './Icon';
import { PressableScale } from './PressableScale';
import { PageChip } from './PageChip';
import type { TabPage } from './tabPages';
import { TimeBackground } from './TimeBackground';

/** Keeps light text readable wherever it sits on the city image. */
export const ON_IMAGE_SHADOW: TextStyle = {
  // Near-black from the palette's scrim (the app never uses pure black).
  textShadowColor: 'rgba(10, 11, 13, 0.35)',
  textShadowOffset: { width: 0, height: 1 },
  textShadowRadius: 6,
};

/** Side padding shared by every tab, so the header and content line up the same everywhere. */
export const TAB_GUTTER = SPACE.lg;

/**
 * The time-of-day city image that sits behind every tab's header. Inside a `Screen` with
 * `backgroundScrolls` it scrolls with the content on its own; behind a separate list, pass the
 * list's `scrollY` so the image moves up with the header instead of staying fixed behind rows.
 */
export function HeaderBackground({ scrollY }: { scrollY?: SharedValue<number> }) {
  const timeOfDay = useTimeOfDay();
  const follow = useAnimatedStyle(() => ({
    transform: [{ translateY: scrollY ? -Math.max(0, scrollY.value) : 0 }],
  }));
  if (!scrollY) return <TimeBackground timeOfDay={timeOfDay} />;
  return (
    <Animated.View style={[StyleSheet.absoluteFill, follow]} pointerEvents="none">
      <TimeBackground timeOfDay={timeOfDay} />
    </Animated.View>
  );
}

/**
 * The header at the top of every tab: logo and name with the bell and account, then which page
 * this is, its title, and a one-line hint of what you can do here. Text sits on the city image, so
 * it is light. Render it inside a screen whose background is `<HeaderBackground />`.
 */
export function AppHeader({
  page,
  title,
  hint,
}: {
  page: TabPage;
  title: string;
  /** What the person can do on this page, in a few words. */
  hint: string;
}) {
  const { colors, reducedMotion } = useTheme();
  // The page label, title and hint ease in one after another the first time the page opens.
  const enter = (step: number) =>
    reducedMotion
      ? FadeIn.duration(MOTION.fadeMs)
      : FadeInDown.duration(MOTION.screenMs).delay(step * MOTION.staggerMs);
  const needsReview = useReviewCount().data ?? 0;
  const user = useAuthStore((s) => s.user);
  const onImage: TextStyle = { color: colors.atmosphere.onImage, ...ON_IMAGE_SHADOW };
  const onImageMuted: TextStyle = { color: colors.atmosphere.onImageMuted, ...ON_IMAGE_SHADOW };
  const initial = (user?.name || user?.email || '').trim().charAt(0).toUpperCase();

  return (
    <View style={styles.hero}>
      <View style={styles.brandRow}>
        <View style={styles.brand}>
          <AppLogo size={28} variant="mark" tone="dark" animated />
          {/* One line, with a little room for the shadow: Android measures text without its
              shadow and could otherwise wrap onto a clipped second line. */}
          <AppText variant="heading" numberOfLines={1} style={[onImage, styles.brandName]}>
            PACE
          </AppText>
        </View>
        <View style={styles.chromeRow}>
          <PressableScale
            onPress={() => router.push(needsReview > 0 ? '/review' : '/settings/notifications')}
            accessibilityRole="button"
            accessibilityLabel={
              needsReview > 0
                ? `${needsReview} ${needsReview === 1 ? 'payment needs' : 'payments need'} a category`
                : 'Notification settings'
            }
            style={[styles.chrome, { backgroundColor: colors.atmosphere.chrome }]}
          >
            <Icon name="notifications-outline" size={ICON.md} tint={colors.atmosphere.onImage} />
            {needsReview > 0 ? (
              <View style={[styles.badgeDot, { backgroundColor: colors.accent }]} />
            ) : null}
          </PressableScale>
          <PressableScale
            onPress={() => router.push('/settings/auth')}
            accessibilityRole="button"
            accessibilityLabel={user ? 'Your account' : 'Sign in'}
            style={[styles.chrome, { backgroundColor: colors.atmosphere.chrome }]}
          >
            {initial ? (
              <AppText variant="label" style={onImage}>
                {initial}
              </AppText>
            ) : (
              <Icon name="person-outline" size={ICON.md} tint={colors.atmosphere.onImage} />
            )}
          </PressableScale>
        </View>
      </View>
      <Animated.View entering={enter(0)}>
        <PageChip page={page} />
      </Animated.View>
      <Animated.View entering={enter(1)}>
        <AppText
          variant="serifTitle"
          accessibilityRole="header"
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.8}
          style={onImage}
        >
          {title}
        </AppText>
      </Animated.View>
      <Animated.View entering={enter(2)}>
        <AppText style={onImageMuted}>{hint}</AppText>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { gap: SPACE.xs, marginBottom: SPACE.sm },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACE.md,
  },
  brand: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm },
  brandName: { paddingRight: SPACE.sm },
  chromeRow: { flexDirection: 'row', gap: SPACE.sm },
  chrome: {
    width: MIN_TOUCH - SPACE.xs,
    height: MIN_TOUCH - SPACE.xs,
    borderRadius: RADIUS.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeDot: {
    position: 'absolute',
    top: SPACE.sm,
    right: SPACE.sm,
    width: SPACE.sm,
    height: SPACE.sm,
    borderRadius: RADIUS.pill,
  },
});
