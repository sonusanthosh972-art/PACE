import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import type { BottomTabBarProps } from 'expo-router/js-tabs';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

import { useTheme } from '@/theme/ThemeProvider';
import { FONT, ICON, MIN_TOUCH, MOTION, RADIUS, SPACE, withAlpha } from '@/theme/tokens';

import { AppText } from './AppText';
import { isTabPage, TAB_PAGES } from './tabPages';

/** Gap between the highlight and the edges of its tab. */
const PILL_INSET = SPACE.xs;

/**
 * The app's bottom navigation: four equal-width items and a soft mint highlight that slides to the
 * tab you tap. The phone's bottom inset is added below, so it always sits above the gesture /
 * button area. Built by hand (instead of the navigator's default bar) so labels use our own text
 * measurement and never get cut off.
 */
export function TabBar({ state, descriptors, navigation, insets }: BottomTabBarProps) {
  const { colors, reducedMotion } = useTheme();
  const [rowWidth, setRowWidth] = useState(0);
  const itemWidth = rowWidth > 0 ? rowWidth / state.routes.length : 0;

  // The highlight's left edge, animated to the active tab. It is placed without motion the first
  // time the bar is measured, then springs to each tab you tap.
  const x = useSharedValue(0);
  const placed = useRef(false);
  useEffect(() => {
    if (itemWidth === 0) return;
    const target = state.index * itemWidth;
    if (!placed.current || reducedMotion) {
      x.value = target;
      placed.current = true;
    } else {
      x.value = withSpring(target, MOTION.spring);
    }
  }, [state.index, itemWidth, reducedMotion, x]);
  const slide = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));

  return (
    <View
      style={[
        styles.bar,
        {
          backgroundColor: colors.nav,
          borderTopColor: colors.border,
          paddingBottom: Math.max(insets.bottom, SPACE.sm),
        },
      ]}
    >
      <View
        style={styles.row}
        onLayout={(e) => setRowWidth(e.nativeEvent.layout.width)}
        accessibilityRole="tablist"
      >
        {itemWidth > 0 ? (
          <Animated.View
            pointerEvents="none"
            testID="tab-highlight"
            style={[
              styles.highlight,
              {
                width: itemWidth - PILL_INSET * 2,
                backgroundColor: withAlpha(colors.accent, 0.14),
              },
              slide,
            ]}
          />
        ) : null}

        {state.routes.map((route, index) => {
          const options = descriptors[route.key]?.options;
          const page = isTabPage(route.name) ? TAB_PAGES[route.name] : null;
          const label = options?.title ?? page?.label ?? route.name;
          const focused = state.index === index;
          const tint = focused ? colors.accentText : colors.muted;

          const onPress = () => {
            const event = navigation.emit({
              type: 'tabPress',
              target: route.key,
              canPreventDefault: true,
            });
            if (!focused && !event.defaultPrevented) {
              Haptics.selectionAsync().catch(() => undefined);
              navigation.navigate(route.name, route.params);
            }
          };

          return (
            <Pressable
              key={route.key}
              onPress={onPress}
              onLongPress={() => navigation.emit({ type: 'tabLongPress', target: route.key })}
              accessibilityRole="tab"
              accessibilityState={{ selected: focused }}
              accessibilityLabel={options?.tabBarAccessibilityLabel ?? label}
              style={styles.item}
            >
              <Ionicons name={page?.icon ?? 'ellipse-outline'} size={ICON.lg} color={tint} />
              <AppText
                variant="caption"
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.8}
                maxFontSizeMultiplier={1.3}
                style={[styles.label, { color: tint }, focused && styles.labelActive]}
              >
                {label}
              </AppText>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: SPACE.sm,
    paddingHorizontal: SPACE.sm,
  },
  row: { flexDirection: 'row' },
  // Sits behind the items, one tab wide, and slides between them. Explicit edges: the
  // `absoluteFillObject` shortcut no longer exists in this React Native version.
  highlight: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: PILL_INSET,
    borderRadius: RADIUS.md,
  },
  // Equal-width items; the whole column is the touch target.
  item: {
    flex: 1,
    minHeight: MIN_TOUCH + SPACE.md,
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACE.xs / 2,
    paddingVertical: SPACE.sm,
    paddingHorizontal: SPACE.xs,
  },
  label: { fontSize: 12, lineHeight: 16 },
  labelActive: { fontFamily: FONT.semibold },
});
