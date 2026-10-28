import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import type { ReactNode } from 'react';
import Animated, {
  Easing,
  FadeIn,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';

import { AppText } from '@/components/AppText';
import { PaceLogo } from '@/components/brand/PaceLogo';
import { Button } from '@/components/Button';
import { Icon, type IconName } from '@/components/Icon';
import { Screen } from '@/components/Screen';
import { getAppDb } from '@/data/appDb';
import { systemClock } from '@/services/clock';
import { loadDemoData } from '@/services/demo';
import { useAuthStore } from '@/state/authStore';
import { invalidateAll } from '@/state/queries';
import { useSplash } from '@/state/splashStore';
import { useTheme } from '@/theme/ThemeProvider';
import { RADIUS, SPACE } from '@/theme/tokens';

const VALUES: { icon: IconName; text: string }[] = [
  { icon: 'shield-checkmark-outline', text: 'Rent, EMIs and savings are set aside first.' },
  { icon: 'chatbox-ellipses-outline', text: 'Payments arrive on their own from your bank SMS.' },
  {
    icon: 'lock-closed-outline',
    text: 'Only bank messages are read. Message text never leaves your phone.',
  },
];

// Example numbers for the preview card (the brief's own examples).
const PREVIEW = { left: '₹1,279', budget: '₹1,579', usedFraction: 0.19 };

export default function Welcome() {
  const { colors, reducedMotion } = useTheme();
  const { width: screenWidth } = useWindowDimensions();
  const client = useQueryClient();
  const signedIn = useAuthStore((s) => s.isAuthenticated);
  const [loadingDemo, setLoadingDemo] = useState(false);
  const splashGone = useSplash((s) => s.dismissed);
  const [introDone, setIntroDone] = useState(false);
  const onIntroEnd = useCallback(() => setIntroDone(true), []);

  const logoWidth = Math.min(screenWidth - SPACE.xl * 2, 440);

  /** Sample data is only ever loaded when the user explicitly asks for it, and never on an account. */
  const tryDemo = async () => {
    if (signedIn) return;
    setLoadingDemo(true);
    try {
      await loadDemoData(await getAppDb(), systemClock);
      await invalidateAll(client);
      router.replace('/(tabs)');
    } finally {
      setLoadingDemo(false);
    }
  };

  return (
    <Screen
      edges={['top', 'bottom']}
      footer={
        <Animated.View
          entering={reducedMotion ? FadeIn.duration(200) : FadeIn.duration(400).delay(300)}
          style={styles.actions}
        >
          {signedIn ? (
            <Button
              label="Continue setup"
              icon="arrow-forward"
              onPress={() => router.push('/onboarding/salary')}
              accessibilityHint="Set up your budget, then allow bank SMS"
            />
          ) : (
            <>
              <Button
                label="Create account"
                icon="person-add-outline"
                onPress={() => router.push('/settings/auth?mode=register')}
                accessibilityHint="Create an account, set up your budget, then read your bank SMS"
              />
              <Button
                label="Sign in"
                variant="secondary"
                icon="log-in-outline"
                onPress={() => router.push('/settings/auth?mode=login')}
                accessibilityHint="Sign in and restore your budget and transactions"
              />
              <View style={styles.secondaryActions}>
                <Button
                  label="Use without account"
                  variant="ghost"
                  compact
                  onPress={() => router.push('/onboarding/salary')}
                  accessibilityHint="Set up on this phone only. You can sign in later from Settings"
                />
                <Button
                  label="Try sample data"
                  variant="ghost"
                  compact
                  onPress={tryDemo}
                  loading={loadingDemo}
                  accessibilityHint="Shows example payments so you can look around. Nothing is real or saved to a server"
                />
              </View>
            </>
          )}
        </Animated.View>
      }
    >
      <View style={styles.hero}>
        {/* Renders statically formed so the PACE animation doesn't repeat after splash */}
        <PaceLogo width={logoWidth} staticFormed play={splashGone} onIntroEnd={onIntroEnd} />
      </View>

      <Reveal show={introDone} step={0} style={styles.headingBlock}>
        <AppText variant="caption" color="accentText" center style={styles.eyebrow}>
          PAISA PULSE
        </AppText>
        <AppText variant="title" center accessibilityRole="header" style={styles.headline}>
          Know exactly what you can spend today.
        </AppText>
        <AppText color="muted" center style={styles.subtitle}>
          Your salary, minus rent, EMIs and savings, turned into one calm daily number.
        </AppText>
      </Reveal>

      <Reveal show={introDone} step={1}>
        <TodayPreview animate={introDone} />
      </Reveal>

      <Reveal show={introDone} step={2} style={styles.values}>
        {VALUES.map((v) => (
          <View key={v.text} style={styles.valueRow}>
            <View style={[styles.valueIcon, { backgroundColor: colors.surface }]}>
              <Icon name={v.icon} size={18} color="accentText" />
            </View>
            <AppText variant="caption" color="muted" style={styles.flex}>
              {v.text}
            </AppText>
          </View>
        ))}
      </Reveal>
    </Screen>
  );
}

/** Fades a block up once `show` turns true (after the logo has formed), staggered by `step`. */
function Reveal({
  show,
  step,
  style,
  children,
}: {
  show: boolean;
  step: number;
  style?: object;
  children: ReactNode;
}) {
  const { reducedMotion } = useTheme();
  const p = useSharedValue(0);

  useEffect(() => {
    if (!show) return;
    p.value = reducedMotion
      ? withTiming(1, { duration: 200 })
      : withDelay(
          step * 90,
          withTiming(1, { duration: 520, easing: Easing.bezierFn(0.16, 1, 0.3, 1) }),
        );
  }, [show, step, reducedMotion, p]);

  const animated = useAnimatedStyle(() => ({
    opacity: p.value,
    transform: [{ translateY: reducedMotion ? 0 : (1 - p.value) * 14 }],
  }));

  return <Animated.View style={[style, animated]}>{children}</Animated.View>;
}

/** A glimpse of the product: the one number the app is about. Its bar fills once. */
function TodayPreview({ animate }: { animate: boolean }) {
  const { colors, reducedMotion } = useTheme();
  const target = 1 - PREVIEW.usedFraction;
  const fill = useSharedValue(reducedMotion ? target : 0);

  useEffect(() => {
    if (reducedMotion) {
      fill.value = target;
      return;
    }
    if (!animate) return;
    fill.value = withTiming(target, { duration: 700, easing: Easing.bezierFn(0.22, 1, 0.36, 1) });
  }, [animate, reducedMotion, fill, target]);

  const barStyle = useAnimatedStyle(() => ({ transform: [{ scaleX: fill.value }] }));

  return (
    <View
      style={[styles.preview, { backgroundColor: colors.surface, borderColor: colors.border }]}
      accessible
      accessibilityLabel={`Example: ${PREVIEW.left} left today of ${PREVIEW.budget}`}
    >
      <View style={styles.previewTop}>
        <AppText variant="caption" color="muted">
          Today
        </AppText>
        <View style={[styles.sampleTag, { borderColor: colors.border }]}>
          <AppText variant="caption" color="muted" style={styles.sampleText}>
            EXAMPLE
          </AppText>
        </View>
      </View>
      <View style={styles.previewNumber}>
        <AppText variant="title" tabular style={styles.previewAmount}>
          {PREVIEW.left}
        </AppText>
        <AppText color="muted" tabular>
          left of {PREVIEW.budget}
        </AppText>
      </View>
      <View style={[styles.track, { backgroundColor: colors.track }]}>
        <Animated.View style={[styles.bar, { backgroundColor: colors.accent }, barStyle]} />
      </View>
      <View style={styles.previewFoot}>
        <Icon name="leaf-outline" size={14} color="accentText" />
        <AppText variant="caption" color="muted">
          Within budget. Tomorrow adjusts on its own.
        </AppText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  secondaryActions: { flexDirection: 'row', justifyContent: 'center', gap: SPACE.sm },
  hero: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: SPACE.xxl,
    paddingBottom: SPACE.lg,
  },
  headingBlock: { alignItems: 'center', gap: SPACE.sm },
  eyebrow: { letterSpacing: 3, fontSize: 12 },
  headline: { fontSize: 28, lineHeight: 36, maxWidth: 320 },
  subtitle: { maxWidth: 320 },
  preview: {
    borderRadius: RADIUS.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: SPACE.lg + 4,
    gap: SPACE.md,
    marginTop: SPACE.sm,
  },
  previewTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sampleTag: {
    borderWidth: 1,
    borderRadius: RADIUS.pill,
    paddingHorizontal: SPACE.sm,
    paddingVertical: 2,
  },
  sampleText: { fontSize: 11, letterSpacing: 1.2 },
  previewNumber: { flexDirection: 'row', alignItems: 'baseline', gap: SPACE.sm },
  previewAmount: { fontSize: 32, lineHeight: 40 },
  track: { height: 6, borderRadius: RADIUS.pill, overflow: 'hidden' },
  bar: { height: '100%', borderRadius: RADIUS.pill, transformOrigin: 'left' },
  previewFoot: { flexDirection: 'row', alignItems: 'center', gap: SPACE.xs },
  values: { gap: SPACE.md },
  valueRow: { flexDirection: 'row', alignItems: 'center', gap: SPACE.md },
  valueIcon: {
    width: 36,
    height: 36,
    borderRadius: RADIUS.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  flex: { flex: 1 },
  actions: { gap: SPACE.sm },
});
