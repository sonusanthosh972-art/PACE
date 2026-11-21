import { router } from 'expo-router';
import type { ReactNode } from 'react';
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
import { COLORS, ICON, MIN_TOUCH, MOTION, RADIUS, SPACE } from '@/theme/tokens';

import { BrandLogo } from './brand/BrandLogo';
import { AppText } from './AppText';
import { Icon } from './Icon';
import { PressableScale } from './PressableScale';
import type { TabPage } from './tabPages';
import { TimeBackground } from './TimeBackground';

/** Keeps light text readable wherever it sits on the city image. */
export const ON_IMAGE_SHADOW: TextStyle = {
  textShadowColor: COLORS.atmosphere.shadow,
  textShadowOffset: { width: 0, height: 1 },
  textShadowRadius: 6,
};

/** Side padding shared by every tab, so the header and content line up the same everywhere. */
export const TAB_GUTTER = SPACE.gutter;

/**
 * The time-of-day city image (morning, afternoon, evening, night) behind every tab's header. Inside
 * a `Screen` with `backgroundScrolls` it scrolls with the content on its own; behind a separate
 * list, pass the list's `scrollY` so the image moves up with the header instead of staying fixed.
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
 * The top of every tab. Today ("index") shows the PACE brand row with the bell and the account
 * avatar above the greeting; the other tabs show their title and a one-line subtitle, with an
 * optional control on the right (e.g. the month picker on Insights).
 */
export function AppHeader({
  page,
  title,
  hint,
  right,
}: {
  page: TabPage;
  title: string;
  /** What this page is for, in a few words. */
  hint: string;
  right?: ReactNode;
}) {
  const { reducedMotion } = useTheme();
  const enter = (step: number) =>
    reducedMotion
      ? FadeIn.duration(MOTION.fadeMs)
      : FadeInDown.duration(MOTION.screenMs).delay(step * MOTION.staggerMs);
  const home = page === 'index';

  return (
    <View style={[styles.header, home && styles.headerHome]}>
      {home ? <BrandRow /> : null}
      <View style={styles.titleRow}>
        <View style={styles.titleCol}>
          <Animated.View entering={enter(0)}>
            <AppText
              variant={home ? 'heading' : 'serifTitle'}
              accessibilityRole="header"
              style={[home ? styles.greeting : undefined, ON_IMAGE_SHADOW]}
            >
              {title}
            </AppText>
          </Animated.View>
          <Animated.View entering={enter(1)}>
            <AppText variant="caption" style={[styles.hint, styles.onImageMuted, ON_IMAGE_SHADOW]}>
              {hint}
            </AppText>
          </Animated.View>
        </View>
        {right ? <View style={styles.right}>{right}</View> : null}
      </View>
    </View>
  );
}

function BrandRow() {
  const { colors } = useTheme();
  const needsReview = useReviewCount().data ?? 0;
  const user = useAuthStore((s) => s.user);
  const initial = (user?.name || user?.email || '').trim().charAt(0).toUpperCase();

  return (
    <View style={styles.brandRow}>
      <View style={styles.brand}>
        <BrandLogo size={36} />
        {/* One line, with a little room so Android never wraps the word onto a clipped line. */}
        <AppText variant="heading" numberOfLines={1} style={[styles.brandName, ON_IMAGE_SHADOW]}>
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
          style={styles.chrome}
        >
          <Icon name="notifications-outline" size={ICON.lg} color="text" />
          {needsReview > 0 ? (
            <View
              style={[styles.badgeDot, { backgroundColor: colors.primary, borderColor: colors.bg }]}
            />
          ) : null}
        </PressableScale>
        <PressableScale
          onPress={() => router.push('/settings/auth')}
          accessibilityRole="button"
          accessibilityLabel={user ? 'Your account' : 'Sign in'}
          style={[styles.avatar, { backgroundColor: colors.elevated, borderColor: colors.primary }]}
        >
          {initial ? (
            <AppText variant="label" style={{ color: colors.primary }}>
              {initial}
            </AppText>
          ) : (
            <Icon name="person-outline" size={ICON.md} color="text" />
          )}
        </PressableScale>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { gap: SPACE.lg, marginBottom: SPACE.xs },
  headerHome: { gap: SPACE.xl },
  brandRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  brand: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm },
  brandName: { paddingRight: SPACE.sm, letterSpacing: 0.5 },
  chromeRow: { flexDirection: 'row', alignItems: 'center', gap: SPACE.md },
  chrome: {
    width: MIN_TOUCH - SPACE.xs,
    height: MIN_TOUCH - SPACE.xs,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: RADIUS.pill,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeDot: {
    position: 'absolute',
    top: 10,
    right: 11,
    width: 9,
    height: 9,
    borderRadius: RADIUS.pill,
    borderWidth: 1.5,
  },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: SPACE.md },
  titleCol: { flex: 1, gap: SPACE.xs },
  greeting: { fontSize: 22, lineHeight: 30 },
  hint: { fontSize: 14, lineHeight: 20 },
  // Ivory at 85%: softer than the title but readable on a bright sky.
  onImageMuted: { color: COLORS.atmosphere.onImageMuted },
  right: { paddingTop: SPACE.xs },
});
