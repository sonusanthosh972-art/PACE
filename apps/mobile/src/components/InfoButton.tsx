import { useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, SlideInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/theme/ThemeProvider';
import { ICON, MIN_TOUCH, MOTION, RADIUS, SPACE, withAlpha } from '@/theme/tokens';

import { AppText } from './AppText';
import { Icon, type IconName } from './Icon';

/** Plain-English explanations for the figures people most often ask about. */
export const INFO = {
  safeToSpend: {
    icon: 'wallet-outline',
    title: 'Safe to spend',
    body: 'The amount you can spend today while staying within your monthly plan, after setting aside bills, savings and the days still to come.',
  },
  totalSpent: {
    icon: 'bar-chart-outline',
    title: 'Total spent',
    body: "The money you've spent this month across all categories (shopping, food, transport and so on). Refunds are taken off.",
  },
  leftThisMonth: {
    icon: 'cash-outline',
    title: 'Left this month',
    body: "The money left from this month's spending budget until your next payday.",
  },
  dailyAllowance: {
    icon: 'calendar-outline',
    title: 'Daily allowance',
    body: "What you can spend each day from tomorrow until payday. Money you don't spend today makes it bigger; spending more makes it a little smaller.",
  },
  onTrack: {
    icon: 'checkmark-circle-outline',
    title: "You're on track",
    body: 'Your spending is within your planned daily allowance for this month. Keep it up!',
  },
  afterPurchase: {
    icon: 'bag-handle-outline',
    title: 'After this purchase',
    body: "How much of this month's spending budget would be left, and what you could spend each day until payday, if you bought it today.",
  },
} as const satisfies Record<string, { icon: IconName; title: string; body: string }>;

export type InfoTopic = keyof typeof INFO;

/**
 * A small ⓘ beside a figure. Tapping it opens a short explanation in a bottom sheet over the
 * current screen; tap outside, the close button or Back to dismiss. Use it only where people may
 * genuinely need an explanation.
 */
export function InfoButton({ topic, size = ICON.sm }: { topic: InfoTopic; size?: number }) {
  const [open, setOpen] = useState(false);
  const info = INFO[topic];
  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={`What is ${info.title}?`}
        // The icon is small; the touch area is not.
        hitSlop={(MIN_TOUCH - size) / 2}
        style={({ pressed }) => [styles.button, pressed && styles.pressed]}
        testID={`info-${topic}`}
      >
        <Icon name="information-circle-outline" size={size} color="muted" />
      </Pressable>
      <InfoSheet visible={open} topic={topic} onClose={() => setOpen(false)} />
    </>
  );
}

export function InfoSheet({
  visible,
  topic,
  onClose,
}: {
  visible: boolean;
  topic: InfoTopic;
  onClose: () => void;
}) {
  const { colors, reducedMotion } = useTheme();
  const insets = useSafeAreaInsets();
  const info = INFO[topic];

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={onClose}
    >
      <Animated.View
        entering={FadeIn.duration(MOTION.fadeMs)}
        style={[StyleSheet.absoluteFill, { backgroundColor: colors.scrim }]}
      >
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onClose}
          accessibilityLabel="Close"
          accessibilityRole="button"
        />
      </Animated.View>
      <View style={styles.anchor} pointerEvents="box-none">
        <Animated.View
          entering={
            reducedMotion ? FadeIn.duration(MOTION.fadeMs) : SlideInDown.duration(MOTION.screenMs)
          }
          style={[
            styles.sheet,
            {
              backgroundColor: colors.surface,
              borderColor: colors.border,
              paddingBottom: SPACE.xl + insets.bottom,
            },
          ]}
          accessibilityViewIsModal
          testID={`info-sheet-${topic}`}
        >
          <View style={[styles.grabber, { backgroundColor: colors.border }]} />
          <View style={styles.headRow}>
            <View style={[styles.iconDisc, { backgroundColor: withAlpha(colors.accent, 0.16) }]}>
              <Icon name={info.icon} size={ICON.lg} color="accentText" />
            </View>
            <AppText variant="heading" accessibilityRole="header" style={styles.flex}>
              {info.title}
            </AppText>
            <Pressable
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Close"
              hitSlop={SPACE.sm}
              style={({ pressed }) => [styles.close, pressed && styles.pressed]}
            >
              <Icon name="close" size={ICON.lg} color="text" />
            </Pressable>
          </View>
          <AppText style={styles.body}>{info.body}</AppText>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  button: { alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: 0.6 },
  anchor: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    borderTopLeftRadius: RADIUS.lg + 4,
    borderTopRightRadius: RADIUS.lg + 4,
    borderWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: 0,
    paddingHorizontal: SPACE.xl,
    paddingTop: SPACE.md,
    gap: SPACE.lg,
  },
  grabber: { alignSelf: 'center', width: 44, height: 5, borderRadius: RADIUS.pill },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: SPACE.md },
  iconDisc: {
    width: 48,
    height: 48,
    borderRadius: RADIUS.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  close: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  body: { lineHeight: 24 },
});
