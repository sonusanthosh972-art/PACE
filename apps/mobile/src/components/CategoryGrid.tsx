import { StyleSheet, View } from 'react-native';

import { PICKABLE_CATEGORIES, type CategoryId } from '@/domain/categories';
import { useTheme } from '@/theme/ThemeProvider';
import { MIN_TOUCH, RADIUS, SPACE } from '@/theme/tokens';

import { AppText } from './AppText';
import { PressableScale } from './PressableScale';

export function CategoryGrid({
  selected,
  onSelect,
}: {
  selected: CategoryId | null;
  onSelect: (id: CategoryId) => void;
}) {
  const { colors } = useTheme();
  return (
    <View style={styles.grid} accessibilityRole="radiogroup">
      {PICKABLE_CATEGORIES.map((c) => {
        const isSelected = c.id === selected;
        return (
          <PressableScale
            key={c.id}
            onPress={() => onSelect(c.id)}
            accessibilityRole="radio"
            accessibilityState={{ checked: isSelected }}
            accessibilityLabel={c.label}
            style={[
              styles.cell,
              {
                backgroundColor: isSelected ? colors.elevated : colors.surface,
                borderColor: isSelected ? colors.accent : colors.border,
              },
            ]}
          >
            <AppText variant="heading" accessible={false}>
              {c.emoji}
            </AppText>
            <AppText
              variant="caption"
              center
              numberOfLines={2}
              color={isSelected ? 'text' : 'muted'}
            >
              {isSelected ? '✓ ' : ''}
              {c.label}
            </AppText>
          </PressableScale>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.sm },
  cell: {
    width: '31.5%',
    minHeight: MIN_TOUCH * 2,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: SPACE.sm,
    gap: SPACE.xs,
  },
});
