import { Canvas, Path, Skia, type SkPath } from '@shopify/react-native-skia';
import { useEffect, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSharedValue, withTiming } from 'react-native-reanimated';

import { CATEGORIES, type CategoryId } from '@/domain/categories';
import { formatINRWhole } from '@/domain/money';
import { useTheme } from '@/theme/ThemeProvider';

import { AppText } from '../AppText';

export interface DonutSlice {
  category: CategoryId;
  totalPaise: number;
}

const GAP_DEG = 2;

/** Category donut. Colour is decorative: the legend next to it carries labels and amounts. */
export function DonutChart({
  slices,
  totalPaise,
  size = 200,
  stroke = 26,
}: {
  slices: readonly DonutSlice[];
  totalPaise: number;
  size?: number;
  stroke?: number;
}) {
  const { colors, reducedMotion } = useTheme();
  const reveal = useSharedValue(reducedMotion ? 1 : 0);

  useEffect(() => {
    reveal.value = reducedMotion ? 1 : withTiming(1, { duration: 600 });
  }, [reducedMotion, reveal, totalPaise]);

  const arcs = useMemo(() => {
    const inset = stroke / 2 + 1;
    const rect = { x: inset, y: inset, width: size - inset * 2, height: size - inset * 2 };
    const visible = slices.filter((s) => s.totalPaise > 0);
    const result: { key: CategoryId; path: SkPath; color: string }[] = [];
    for (let i = 0, angle = -90; i < visible.length; i += 1) {
      const s = visible[i];
      if (!s) continue;
      const sweep = totalPaise > 0 ? (s.totalPaise / totalPaise) * 360 : 0;
      const path = Skia.PathBuilder.Make()
        .addArc(rect, angle + GAP_DEG / 2, Math.max(0.5, sweep - GAP_DEG))
        .detach();
      angle += sweep;
      result.push({ key: s.category, path, color: colors.categories[s.category] });
    }
    return result;
  }, [slices, totalPaise, size, stroke, colors]);

  const summary = slices
    .slice(0, 4)
    .map((s) => `${CATEGORIES[s.category].label} ${formatINRWhole(s.totalPaise)}`)
    .join(', ');

  return (
    <View
      style={{ width: size, height: size }}
      accessible
      accessibilityRole="image"
      accessibilityLabel={`Spending by category. Total ${formatINRWhole(totalPaise)}. ${summary}`}
    >
      <Canvas style={StyleSheet.absoluteFill}>
        {arcs.map((a) => (
          <Path
            key={a.key}
            path={a.path}
            style="stroke"
            strokeWidth={stroke}
            color={a.color}
            start={0}
            end={reveal}
          />
        ))}
      </Canvas>
      <View style={styles.center} importantForAccessibility="no-hide-descendants">
        <AppText variant="caption" color="muted">
          This cycle
        </AppText>
        <AppText variant="heading" tabular>
          {formatINRWhole(totalPaise)}
        </AppText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
