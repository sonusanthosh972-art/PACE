import * as Haptics from 'expo-haptics';
import { StyleSheet, View } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';
import { ICON, MIN_TOUCH, RADIUS, SPACE } from '@/theme/tokens';

import { AppText } from './AppText';
import { Icon, type IconName } from './Icon';
import { PressableScale } from './PressableScale';

interface ChipProps {
  label: string;
  selected: boolean;
  onPress: () => void;
  icon?: IconName;
  /** Colour for the icon (e.g. the category colour). */
  tint?: string;
  accessibilityLabel?: string;
}

/** Filter / choice chip. Selection is shown by fill + a check mark, never colour alone. */
export function Chip({ label, selected, onPress, icon, tint, accessibilityLabel }: ChipProps) {
  const { colors } = useTheme();
  return (
    <PressableScale
      onPress={() => {
        Haptics.selectionAsync().catch(() => undefined);
        onPress();
      }}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={accessibilityLabel ?? label}
      style={[
        styles.chip,
        {
          backgroundColor: selected ? colors.primary : colors.surface,
          borderColor: selected ? colors.primary : colors.border,
        },
      ]}
    >
      {selected ? (
        <View testID="chip-check">
          <Icon name="checkmark" size={ICON.sm} tint={colors.onAccent} />
        </View>
      ) : icon ? (
        <Icon name={icon} size={ICON.sm} tint={tint} color="muted" />
      ) : null}
      <AppText variant="label" color={selected ? 'onAccent' : 'text'} numberOfLines={1}>
        {label}
      </AppText>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  chip: {
    minHeight: MIN_TOUCH,
    paddingHorizontal: SPACE.lg,
    borderRadius: RADIUS.pill,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.sm,
  },
});
