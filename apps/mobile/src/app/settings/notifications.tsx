import { useQueryClient } from '@tanstack/react-query';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { SectionTitle, SwitchRow } from '@/components/Controls';
import { Icon } from '@/components/Icon';
import { PressableScale } from '@/components/PressableScale';
import { Screen } from '@/components/Screen';
import { ErrorState, LoadingState } from '@/components/States';
import type { Settings, TimeOfDay } from '@/data/settingsRepo';
import { formatTimeOfDay, shiftTime } from '@/lib/format';
import { updateSetting } from '@/services/actions';
import { invalidateAll, useSettings } from '@/state/queries';
import { useTheme } from '@/theme/ThemeProvider';
import { MIN_TOUCH, RADIUS, SPACE } from '@/theme/tokens';

type TimeKey = 'morningTime' | 'nightTime' | 'weeklyTime';

const TIMES: { key: TimeKey; title: string; subtitle: string }[] = [
  {
    key: 'morningTime',
    title: 'Morning budget',
    subtitle: "Today's budget and how yesterday went",
  },
  { key: 'nightTime', title: 'Night summary', subtitle: 'What you spent and your biggest leak' },
  {
    key: 'weeklyTime',
    title: 'Weekly review (Sundays)',
    subtitle: 'Small payments and top merchants',
  },
];

export default function NotificationSettings() {
  const settings = useSettings();
  const client = useQueryClient();

  if (settings.isPending) {
    return (
      <Screen edges={[]}>
        <LoadingState label="Loading notification settings" />
      </Screen>
    );
  }
  if (settings.isError || !settings.data) {
    return (
      <Screen edges={[]}>
        <ErrorState onRetry={() => settings.refetch()} />
      </Screen>
    );
  }
  const s = settings.data;

  const set = async <K extends keyof Settings>(key: K, value: Settings[K]) => {
    await updateSetting(key, value);
    await invalidateAll(client);
  };

  return (
    <Screen edges={['bottom']}>
      <SwitchRow
        title="Notifications"
        subtitle="Scheduled on this phone, so they work offline"
        value={s.notificationsEnabled}
        onChange={(v) => set('notificationsEnabled', v)}
      />
      <SwitchRow
        title="Live payment alerts"
        subtitle="“☕ ₹300 at Third Wave · ₹1,279 left today”, plus 80% and 100% warnings"
        value={s.liveAlertsEnabled}
        onChange={(v) => set('liveAlertsEnabled', v)}
      />
      <SectionTitle>Times</SectionTitle>
      {TIMES.map((t) => (
        <TimeRow
          key={t.key}
          title={t.title}
          subtitle={t.subtitle}
          value={s[t.key]}
          disabled={!s.notificationsEnabled}
          onChange={(v) => set(t.key, v)}
        />
      ))}
    </Screen>
  );
}

function TimeRow({
  title,
  subtitle,
  value,
  onChange,
  disabled,
}: {
  title: string;
  subtitle: string;
  value: TimeOfDay;
  onChange: (v: TimeOfDay) => void;
  disabled: boolean;
}) {
  const { colors } = useTheme();
  const step = (minutes: number) => onChange(shiftTime(value, minutes));
  return (
    <View style={[styles.row, { backgroundColor: colors.surface, opacity: disabled ? 0.5 : 1 }]}>
      <View style={styles.flex}>
        <AppText variant="bodyStrong">{title}</AppText>
        <AppText variant="caption" color="muted">
          {subtitle}
        </AppText>
      </View>
      <View style={styles.stepper}>
        <PressableScale
          disabled={disabled}
          onPress={() => step(-15)}
          accessibilityRole="button"
          accessibilityLabel={`${title}: 15 minutes earlier`}
          style={[styles.stepBtn, { backgroundColor: colors.elevated }]}
        >
          <Icon name="remove" />
        </PressableScale>
        <AppText
          variant="bodyStrong"
          tabular
          style={styles.time}
          accessibilityLabel={`${title} at ${formatTimeOfDay(value)}`}
        >
          {formatTimeOfDay(value)}
        </AppText>
        <PressableScale
          disabled={disabled}
          onPress={() => step(15)}
          accessibilityRole="button"
          accessibilityLabel={`${title}: 15 minutes later`}
          style={[styles.stepBtn, { backgroundColor: colors.elevated }]}
        >
          <Icon name="add" />
        </PressableScale>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    borderRadius: RADIUS.md,
    padding: SPACE.lg,
    gap: SPACE.md,
  },
  flex: { gap: 2 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: SPACE.md, alignSelf: 'flex-start' },
  stepBtn: {
    width: MIN_TOUCH,
    height: MIN_TOUCH,
    borderRadius: RADIUS.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  time: { minWidth: 88, textAlign: 'center' },
});
