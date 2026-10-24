import * as Haptics from 'expo-haptics';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';
import { MIN_TOUCH, RADIUS, SPACE } from '@/theme/tokens';

import { AppText } from './AppText';
import { Icon, type IconName } from './Icon';
import { PressableScale } from './PressableScale';

interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  icon?: IconName;
  loading?: boolean;
  disabled?: boolean;
  accessibilityHint?: string;
  compact?: boolean;
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  icon,
  loading = false,
  disabled = false,
  accessibilityHint,
  compact = false,
}: ButtonProps) {
  const { colors } = useTheme();
  const inactive = disabled || loading;

  const palette = {
    primary: { bg: colors.accentFill, fg: 'onAccent' as const, border: colors.accentFill },
    secondary: { bg: colors.elevated, fg: 'text' as const, border: colors.border },
    ghost: { bg: 'transparent', fg: 'accentText' as const, border: 'transparent' },
    danger: { bg: colors.elevated, fg: 'coralText' as const, border: colors.coral },
  }[variant];

  return (
    <PressableScale
      onPress={() => {
        Haptics.selectionAsync().catch(() => undefined);
        onPress();
      }}
      disabled={inactive}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: inactive, busy: loading }}
      style={[
        styles.button,
        compact && styles.compact,
        { backgroundColor: palette.bg, borderColor: palette.border, opacity: inactive ? 0.55 : 1 },
      ]}
    >
      {loading ? (
        <ActivityIndicator color={colors[palette.fg]} />
      ) : (
        <View style={styles.row}>
          {icon ? <Icon name={icon} size={20} color={palette.fg} /> : null}
          <AppText variant="label" color={palette.fg}>
            {label}
          </AppText>
        </View>
      )}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: MIN_TOUCH + 4,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACE.xl,
  },
  compact: { minHeight: MIN_TOUCH, paddingHorizontal: SPACE.lg },
  row: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm },
});
