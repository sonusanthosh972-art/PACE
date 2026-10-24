import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';
import { RADIUS, SPACE } from '@/theme/tokens';

import { PressableScale } from './PressableScale';

interface CardProps {
  children: ReactNode;
  onPress?: () => void;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  style?: StyleProp<ViewStyle>;
  tone?: 'surface' | 'elevated';
}

/** Soft rounded card. Pressable cards get the 0.97 press-scale. */
export function Card({
  children,
  onPress,
  accessibilityLabel,
  accessibilityHint,
  style,
  tone = 'surface',
}: CardProps) {
  const { colors } = useTheme();
  const base = [styles.card, { backgroundColor: colors[tone], borderColor: colors.border }, style];
  if (!onPress) return <View style={base}>{children}</View>;
  return (
    <PressableScale
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      style={base}
    >
      {children}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: RADIUS.lg,
    padding: SPACE.lg + 4,
    gap: SPACE.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
});
