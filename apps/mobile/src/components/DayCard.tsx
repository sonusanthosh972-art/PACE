import { usePathname } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { AppState, Modal, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown, ZoomIn } from 'react-native-reanimated';

import { getAppDb } from '@/data/appDb';
import type { DayCard, DayCardMood } from '@/domain/dayCards';
import { atTimeMs } from '@/domain/time';
import { useTodayKey } from '@/lib/useTodayKey';
import { claimDueCard } from '@/services/dayCards';
import { useLockStore } from '@/state/lockStore';
import { useSettings } from '@/state/queries';
import { useSplash } from '@/state/splashStore';
import { useTheme } from '@/theme/ThemeProvider';
import { MOTION, RADIUS, SPACE, withAlpha } from '@/theme/tokens';

import { Amount } from './Amount';
import { AppText, type TextColor } from './AppText';
import { Button } from './Button';
import { Icon, type IconName } from './Icon';

/** Cards only appear on the main tabs: never over adding or editing a payment, or onboarding. */
const CARD_ROUTES = new Set(['/', '/insights', '/transactions', '/settings']);
/** Let the app lock settle after returning to the foreground before checking. */
const RESUME_DELAY_MS = 700;

/**
 * Shows the once-a-day morning card and the night card as a popup when the app is opened (or is
 * open when the night time arrives). Waits while the app is locked, the splash is up, or the user
 * is entering a payment; the card then appears as soon as they are back on a main tab.
 */
export function DayCardHost() {
  const settings = useSettings();
  const onboarded = Boolean(settings.data?.onboardingComplete);
  const nightHour = settings.data?.nightTime.hour ?? 21;
  const nightMinute = settings.data?.nightTime.minute ?? 0;
  const splashDone = useSplash((s) => s.dismissed);
  const locked = useLockStore((s) => s.isLocked);
  const pathname = usePathname();
  const today = useTodayKey();
  const [card, setCard] = useState<DayCard | null>(null);
  const [tick, setTick] = useState(0);
  const checking = useRef(false);

  const canShow = onboarded && splashDone && !locked && CARD_ROUTES.has(pathname);

  useEffect(() => {
    if (!canShow || card || checking.current) return;
    checking.current = true;
    // Not cancelled when the inputs change: a card claimed here is already recorded as shown,
    // so dropping it would lose the day's card.
    getAppDb()
      .then((db) => claimDueCard(db, Date.now()))
      .then((next) => {
        if (next) setCard(next);
      })
      .catch(() => {
        // No card is better than a wrong one; the next check tries again (nothing was recorded).
      })
      .finally(() => {
        checking.current = false;
      });
  }, [canShow, card, today, tick]);

  // Back to the foreground: check again once the lock has had a moment to engage.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const sub = AppState.addEventListener('change', (s) => {
      if (s !== 'active') return;
      clearTimeout(timer);
      timer = setTimeout(() => setTick((t) => t + 1), RESUME_DELAY_MS);
    });
    return () => {
      clearTimeout(timer);
      sub.remove();
    };
  }, []);

  // In the app when the night time arrives: check then.
  useEffect(() => {
    const ms = atTimeMs(today, nightHour, nightMinute) - Date.now();
    if (ms <= 0) return;
    const timer = setTimeout(() => setTick((t) => t + 1), ms + 500);
    return () => clearTimeout(timer);
  }, [today, nightHour, nightMinute]);

  if (!card) return null;
  // Never over the lock screen: a Modal draws above it. The card waits until the app is unlocked.
  return <DayCardModal card={card} visible={!locked} onClose={() => setCard(null)} />;
}

const MOOD: Record<DayCardMood, { icon: IconName; tone: 'accent' | 'amber'; amount: TextColor }> = {
  celebrate: { icon: 'happy-outline', tone: 'accent', amount: 'accentText' },
  steady: { icon: 'checkmark-done-outline', tone: 'accent', amount: 'accentText' },
  support: { icon: 'heart-outline', tone: 'amber', amount: 'amberText' },
  neutral: { icon: 'sunny-outline', tone: 'amber', amount: 'text' },
  resting: { icon: 'leaf-outline', tone: 'accent', amount: 'text' },
};

export function DayCardModal({
  card,
  visible,
  onClose,
}: {
  card: DayCard;
  visible: boolean;
  onClose: () => void;
}) {
  const { colors, reducedMotion } = useTheme();
  const mood = MOOD[card.mood];
  const icon: IconName =
    card.kind === 'night' && card.mood === 'neutral' ? 'moon-outline' : mood.icon;
  const tint = mood.tone === 'amber' ? colors.amber : colors.accent;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={[styles.backdrop, { backgroundColor: colors.scrim }]}>
        <Animated.View
          entering={reducedMotion ? undefined : FadeInDown.duration(MOTION.screenMs)}
          style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
          accessibilityViewIsModal
          testID={`day-card-${card.kind}`}
        >
          <Animated.View
            entering={reducedMotion ? undefined : ZoomIn.delay(MOTION.fadeMs).springify()}
            style={styles.art}
            importantForAccessibility="no-hide-descendants"
            accessibilityElementsHidden
          >
            <View style={[styles.halo, { backgroundColor: withAlpha(tint, 0.08) }]}>
              <View style={[styles.disc, { backgroundColor: withAlpha(tint, 0.16) }]}>
                <Icon name={icon} size={40} tint={tint} />
              </View>
            </View>
            {card.mood === 'celebrate' ? (
              <>
                <View style={[styles.spark, styles.sparkA]}>
                  <Icon name="sparkles" size={18} tint={colors.accent} />
                </View>
                <View style={[styles.spark, styles.sparkB]}>
                  <Icon name="sparkles" size={14} tint={colors.accent} />
                </View>
              </>
            ) : null}
          </Animated.View>

          <AppText variant="overline" color="muted" center>
            {card.kind === 'morning' ? 'Your day ahead' : 'Tonight'}
          </AppText>
          <AppText variant="heading" center accessibilityRole="header">
            {card.title}
          </AppText>

          <View style={styles.amountBlock}>
            <Amount
              paise={card.amountPaise}
              variant="title"
              color={mood.amount}
              animated
              fit
              style={[styles.amount, colors.atmosphere.heroAmount]}
            />
            <AppText variant="caption" color="muted" center>
              {card.amountLabel}
            </AppText>
          </View>

          <AppText center>{card.message}</AppText>

          <View style={[styles.stats, { backgroundColor: colors.elevated }]}>
            {card.stats.map((s) => (
              <View
                key={s.label}
                style={styles.statRow}
                accessible
                accessibilityLabel={`${s.label}: ${s.value}`}
              >
                <AppText variant="caption" color="muted" style={styles.flex}>
                  {s.label}
                </AppText>
                <AppText variant="label" tabular>
                  {s.value}
                </AppText>
              </View>
            ))}
          </View>

          <Button label={card.action} variant="primary" onPress={onClose} />
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  backdrop: { flex: 1, justifyContent: 'center', padding: SPACE.lg },
  card: {
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    padding: SPACE.xl,
    gap: SPACE.md,
    maxWidth: 440,
    width: '100%',
    alignSelf: 'center',
  },
  art: { alignSelf: 'center', marginBottom: SPACE.xs },
  halo: {
    width: 112,
    height: 112,
    borderRadius: RADIUS.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disc: {
    width: 76,
    height: 76,
    borderRadius: RADIUS.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  spark: { position: 'absolute' },
  sparkA: { top: 4, right: 0 },
  sparkB: { bottom: 10, left: 2 },
  amountBlock: { alignItems: 'center' },
  amount: { fontSize: 40, lineHeight: 48 },
  stats: { borderRadius: RADIUS.md, paddingHorizontal: SPACE.md, paddingVertical: SPACE.sm },
  statRow: { flexDirection: 'row', alignItems: 'center', gap: SPACE.md, minHeight: 32 },
});
