import * as Haptics from 'expo-haptics';
import type { ReactNode } from 'react';
import { StyleSheet, Switch, View } from 'react-native';

import { ordinal } from '@/lib/format';
import { useTheme } from '@/theme/ThemeProvider';
import { MIN_TOUCH, RADIUS, SPACE } from '@/theme/tokens';

import { AppText } from './AppText';
import { Icon, type IconName } from './Icon';
import { PressableScale } from './PressableScale';

/** Day-of-month picker (1–31) as a 7-column grid of ≥ 48dp targets. */
export function DayPicker({
  value,
  onChange,
  label,
}: {
  value: number;
  onChange: (day: number) => void;
  label: string;
}) {
  const { colors } = useTheme();
  return (
    <View style={styles.dayGrid} accessibilityRole="radiogroup" accessibilityLabel={label}>
      {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => {
        const selected = day === value;
        return (
          <PressableScale
            key={day}
            onPress={() => {
              Haptics.selectionAsync().catch(() => undefined);
              onChange(day);
            }}
            accessibilityRole="radio"
            accessibilityState={{ checked: selected }}
            accessibilityLabel={`${ordinal(day)} of the month`}
            style={[
              styles.day,
              {
                backgroundColor: selected ? colors.accentFill : colors.surface,
                borderColor: selected ? colors.accentFill : colors.border,
              },
            ]}
          >
            <AppText variant="label" tabular color={selected ? 'onAccent' : 'text'}>
              {day}
            </AppText>
          </PressableScale>
        );
      })}
    </View>
  );
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  label: string;
}) {
  const { colors } = useTheme();
  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={label}
      style={[styles.segmented, { backgroundColor: colors.surface, borderColor: colors.border }]}
    >
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <PressableScale
            key={o.value}
            onPress={() => onChange(o.value)}
            accessibilityRole="radio"
            accessibilityState={{ checked: selected }}
            accessibilityLabel={o.label}
            style={[styles.segment, selected && { backgroundColor: colors.elevated }]}
          >
            <AppText variant="label" color={selected ? 'text' : 'muted'}>
              {o.label}
            </AppText>
          </PressableScale>
        );
      })}
    </View>
  );
}

interface ListRowProps {
  icon?: IconName;
  title: string;
  value?: string;
  subtitle?: string;
  onPress?: () => void;
  danger?: boolean;
  right?: ReactNode;
}

export function ListRow({ icon, title, value, subtitle, onPress, danger, right }: ListRowProps) {
  const { colors } = useTheme();
  return (
    <PressableScale
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={[title, value, subtitle].filter(Boolean).join(', ')}
      style={[styles.listRow, { backgroundColor: colors.surface }]}
    >
      {icon ? <Icon name={icon} color={danger ? 'coralText' : 'muted'} /> : null}
      <View style={styles.listMiddle}>
        <AppText variant="bodyStrong" color={danger ? 'coralText' : 'text'}>
          {title}
        </AppText>
        {subtitle ? (
          <AppText variant="caption" color="muted">
            {subtitle}
          </AppText>
        ) : null}
      </View>
      {value ? (
        <AppText color="muted" tabular>
          {value}
        </AppText>
      ) : null}
      {right}
      {onPress && !right ? <Icon name="chevron-forward" size={18} color="muted" /> : null}
    </PressableScale>
  );
}

export function SwitchRow({
  title,
  subtitle,
  value,
  onChange,
}: {
  title: string;
  subtitle?: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  const { colors } = useTheme();
  return (
    <View style={[styles.listRow, { backgroundColor: colors.surface }]}>
      <View style={styles.listMiddle}>
        <AppText variant="bodyStrong">{title}</AppText>
        {subtitle ? (
          <AppText variant="caption" color="muted">
            {subtitle}
          </AppText>
        ) : null}
      </View>
      <Switch
        accessibilityLabel={title}
        value={value}
        onValueChange={onChange}
        trackColor={{ true: colors.accentFill, false: colors.track }}
        thumbColor={colors.surface}
      />
    </View>
  );
}

export function SectionTitle({ children }: { children: string }) {
  return (
    <AppText variant="label" color="muted" accessibilityRole="header" style={styles.section}>
      {children}
    </AppText>
  );
}

export function StepHeader({
  step,
  total,
  title,
  body,
}: {
  step: number;
  total: number;
  title: string;
  body?: string;
}) {
  const { colors } = useTheme();
  return (
    <View style={styles.stepHeader}>
      <View style={styles.dots} accessible accessibilityLabel={`Step ${step} of ${total}`}>
        {Array.from({ length: total }, (_, i) => (
          <View
            key={i}
            style={[
              styles.dot,
              {
                backgroundColor: i < step ? colors.accent : colors.track,
                width: i === step - 1 ? 28 : 10,
              },
            ]}
          />
        ))}
      </View>
      <AppText variant="caption" color="muted">
        Step {step} of {total}
      </AppText>
      <AppText variant="title" accessibilityRole="header">
        {title}
      </AppText>
      {body ? <AppText color="muted">{body}</AppText> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  dayGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  day: {
    width: MIN_TOUCH,
    height: MIN_TOUCH,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmented: { flexDirection: 'row', borderRadius: RADIUS.md, borderWidth: 1, padding: 4, gap: 4 },
  segment: {
    flex: 1,
    minHeight: MIN_TOUCH - 4,
    borderRadius: RADIUS.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listRow: {
    minHeight: MIN_TOUCH + 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.md,
    paddingHorizontal: SPACE.lg,
    paddingVertical: SPACE.md,
    borderRadius: RADIUS.md,
  },
  listMiddle: { flex: 1, gap: 2 },
  section: { marginTop: SPACE.md, textTransform: 'uppercase', letterSpacing: 0.8 },
  stepHeader: { gap: SPACE.sm, marginBottom: SPACE.md },
  dots: { flexDirection: 'row', gap: 6, marginBottom: SPACE.sm },
  dot: { height: 6, borderRadius: 3 },
});
