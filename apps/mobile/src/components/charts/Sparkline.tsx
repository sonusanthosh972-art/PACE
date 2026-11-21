import { Canvas, LinearGradient, Path, Skia, vec } from '@shopify/react-native-skia';
import { memo, useMemo } from 'react';
import { View } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';
import { withAlpha } from '@/theme/tokens';

/**
 * A small, static trend line: running total of the values (e.g. spend per day), drawn as a teal
 * line over a soft fill. Decorative: the figure it sits next to carries the meaning.
 */
export const Sparkline = memo(function Sparkline({
  values,
  width,
  height,
}: {
  values: readonly number[];
  width: number;
  height: number;
}) {
  const { colors } = useTheme();

  const paths = useMemo(() => {
    if (values.length < 2) return null;
    let sum = 0;
    const running = values.map((v) => (sum += Math.max(0, v)));
    const max = running[running.length - 1] || 1;
    const pad = 2;
    const x = (i: number) => pad + (i / (running.length - 1)) * (width - pad * 2);
    const y = (v: number) => height - pad - (v / max) * (height - pad * 2);
    const line = Skia.PathBuilder.Make();
    running.forEach((v, i) => (i === 0 ? line.moveTo(x(i), y(v)) : line.lineTo(x(i), y(v))));
    const area = Skia.PathBuilder.Make();
    running.forEach((v, i) => (i === 0 ? area.moveTo(x(i), y(v)) : area.lineTo(x(i), y(v))));
    area
      .lineTo(x(running.length - 1), height)
      .lineTo(x(0), height)
      .close();
    return { line: line.detach(), area: area.detach() };
  }, [values, width, height]);

  if (!paths) return <View style={{ width, height }} />;
  return (
    <View
      style={{ width, height }}
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
    >
      <Canvas style={{ width, height }}>
        <Path path={paths.area}>
          <LinearGradient
            start={vec(0, 0)}
            end={vec(0, height)}
            colors={[withAlpha(colors.primary, 0.32), withAlpha(colors.primary, 0)]}
          />
        </Path>
        <Path
          path={paths.line}
          style="stroke"
          strokeWidth={2.5}
          strokeCap="round"
          strokeJoin="round"
          color={colors.primary}
        />
      </Canvas>
    </View>
  );
});
