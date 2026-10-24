import * as Haptics from 'expo-haptics';
import { StyleSheet } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';
import { MIN_TOUCH, RADIUS, SPACE } from '@/theme/tokens';

import { AppText } from './AppText';
import { PressableScale } from './PressableScale';

interface ChipProps {
  label: string;
  selected: boolean;
  onPress: () => void;
}

/** Filter / choice chip. Selection is shown by fill + a check mark, never colour alone. */
export function Chip({ label, selected, onPress }: ChipProps) {
  const { colors } = useTheme();
  return (
    <PressableScale
      onPress={() => {
        Haptics.selectionAsync().catch(() => undefined);
        onPress();
      }}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
      style={[
        styles.chip,
        {
          backgroundColor: selected ? colors.elevated : 'transparent',
          borderColor: selected ? colors.accent : colors.border,
        },
      ]}
    >
      <AppText variant="label" color={selected ? 'text' : 'muted'}>
        {selected ? '✓ ' : ''}
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
    justifyContent: 'center',
  },
});
