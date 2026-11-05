import * as Haptics from 'expo-haptics';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { PICKABLE_CATEGORIES, type CategoryId } from '@/domain/categories';
import { useTheme } from '@/theme/ThemeProvider';
import { ICON, MIN_TOUCH, RADIUS, SPACE, withAlpha } from '@/theme/tokens';

import { AppText } from './AppText';
import { Icon, type IconName } from './Icon';
import { PressableScale } from './PressableScale';

const COLUMNS = 3;
const GAP = SPACE.sm;

/**
 * Even three-column grid of compact tiles: icon above a one-line label. Tile width comes from the
 * measured container, so it fits any phone; long labels shrink slightly instead of being cut off.
 */
export function CategoryGrid({
  selected,
  onSelect,
}: {
  selected: CategoryId | null;
  onSelect: (id: CategoryId) => void;
}) {
  const { colors } = useTheme();
  const [width, setWidth] = useState(0);
  const tileWidth = width > 0 ? Math.floor((width - GAP * (COLUMNS - 1)) / COLUMNS) : undefined;

  return (
    <View
      style={styles.grid}
      accessibilityRole="radiogroup"
      accessibilityLabel="Category"
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
    >
      {PICKABLE_CATEGORIES.map((c) => {
        const isSelected = c.id === selected;
        const catColor = colors.categories[c.id];

        return (
          <PressableScale
            key={c.id}
            onPress={() => {
              Haptics.selectionAsync().catch(() => undefined);
              onSelect(c.id);
            }}
            accessibilityRole="radio"
            accessibilityState={{ checked: isSelected }}
            accessibilityLabel={c.label}
            style={[
              styles.tile,
              tileWidth ? { width: tileWidth } : styles.tileFallback,
              {
                backgroundColor: isSelected ? withAlpha(catColor, 0.14) : colors.surface,
                borderColor: isSelected ? colors.accent : 'transparent',
              },
            ]}
          >
            <Icon name={c.icon as IconName} size={ICON.md} tint={catColor} />
            <AppText
              variant="caption"
              color={isSelected ? 'text' : 'muted'}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.8}
              center
            >
              {c.shortLabel}
            </AppText>
          </PressableScale>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: GAP,
  },
  tile: {
    minHeight: MIN_TOUCH + SPACE.xl,
    paddingVertical: SPACE.sm,
    paddingHorizontal: SPACE.xs,
    borderRadius: RADIUS.md,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACE.xs,
  },
  // Before the first layout pass: roughly a third, so nothing jumps much.
  tileFallback: { width: '31%' },
});
