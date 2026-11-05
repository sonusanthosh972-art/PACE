import { router } from 'expo-router';
import { StyleSheet, View, type TextStyle } from 'react-native';
import Animated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated';

import { useTimeOfDay } from '@/lib/useTimeOfDay';
import { useAuthStore } from '@/state/authStore';
import { useReviewCount } from '@/state/queries';
import { useTheme } from '@/theme/ThemeProvider';
import { ICON, MIN_TOUCH, RADIUS, SPACE } from '@/theme/tokens';

import { AppLogo } from './AppLogo';
import { AppText } from './AppText';
import { Icon } from './Icon';
import { PressableScale } from './PressableScale';
import { TimeBackground } from './TimeBackground';

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
 * The header at the top of every tab: logo and name, the bell (and the account in dark mode), then
 * the page title and a short line under it. Text sits on the city image, so it is light in both
 * themes. Render it inside a screen whose background is `<HeaderBackground />`.
 */
export function AppHeader({ title, subtitle }: { title: string; subtitle: string }) {
  const { colors, scheme } = useTheme();
  // Light mode keeps the header to the essentials: the account lives in Settings.
  const showAccount = scheme === 'dark';
  const needsReview = useReviewCount().data ?? 0;
  const user = useAuthStore((s) => s.user);
  const onImage: TextStyle = { color: colors.atmosphere.onImage, ...styles.textShadow };
  const onImageMuted: TextStyle = { color: colors.atmosphere.onImageMuted, ...styles.textShadow };
  const initial = (user?.name || user?.email || '').trim().charAt(0).toUpperCase();

  return (
    <View style={styles.hero}>
      <View style={styles.brandRow}>
        <View style={styles.brand}>
          <AppLogo size={28} variant="mark" tone="dark" animated />
          <AppText variant="heading" style={onImage}>
            Paisa Pulse
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
          {showAccount ? (
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
          ) : null}
        </View>
      </View>
      <AppText
        variant="title"
        accessibilityRole="header"
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.8}
        style={onImage}
      >
        {title}
      </AppText>
      <AppText style={onImageMuted}>{subtitle}</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  textShadow: {
    textShadowColor: 'rgba(0, 0, 0, 0.35)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },
  hero: { gap: SPACE.xs, marginBottom: SPACE.sm },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACE.md,
  },
  brand: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm },
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
