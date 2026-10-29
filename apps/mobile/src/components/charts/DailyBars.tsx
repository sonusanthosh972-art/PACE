import { Canvas, DashPathEffect, Line, RoundedRect, vec } from '@shopify/react-native-skia';
import { useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';

import { formatINRWhole } from '@/domain/money';
import type { DateKey } from '@/domain/time';
import { formatShortDate } from '@/lib/format';
import { useTheme } from '@/theme/ThemeProvider';
import { SPACE } from '@/theme/tokens';

import { AppText } from '../AppText';

export interface DayBar {
  date: DateKey;
  spentPaise: number;
  budgetPaise: number | null;
}

const HEIGHT = 160;

/**
 * Daily spend bars vs the budget line. Over-budget days are coral *and* taller than the dashed
 * line; the text summary below states the count, so colour is never the only signal.
 */
export function DailyBars({
  days,
  typicalBudgetPaise,
}: {
  days: readonly DayBar[];
  typicalBudgetPaise: number;
}) {
  const { colors } = useTheme();
  const [width, setWidth] = useState(0);

  const max = Math.max(typicalBudgetPaise * 1.4, ...days.map((d) => d.spentPaise), 1);
  const slot = days.length > 0 ? width / days.length : 0;
  const barWidth = Math.max(3, Math.min(18, slot * 0.62));
  const y = (paise: number) => HEIGHT - (paise / max) * HEIGHT;
  const budgetY = y(typicalBudgetPaise);
  const overDays = days.filter((d) => d.budgetPaise !== null && d.spentPaise > d.budgetPaise);

  const first = days[0];
  const last = days[days.length - 1];

  return (
    <View style={styles.wrap}>
      <View
        onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}
        style={{ height: HEIGHT }}
        accessible
        accessibilityRole="image"
        accessibilityLabel={`Daily spending for ${days.length} days. ${overDays.length} days over budget. Typical daily budget ${formatINRWhole(typicalBudgetPaise)}.`}
      >
        {width > 0 ? (
          <Canvas style={StyleSheet.absoluteFill}>
            {days.map((d, i) => {
              const over = d.budgetPaise !== null && d.spentPaise > d.budgetPaise;
              const h = Math.max(2, HEIGHT - y(d.spentPaise));
              return (
                <RoundedRect
                  key={d.date}
                  x={i * slot + (slot - barWidth) / 2}
                  y={HEIGHT - h}
                  width={barWidth}
                  height={h}
                  r={Math.min(4, barWidth / 2)}
                  color={over ? colors.coral : colors.accent}
                />
              );
            })}
            <Line
              p1={vec(0, budgetY)}
              p2={vec(width, budgetY)}
              color={colors.muted}
              strokeWidth={1.5}
            >
              <DashPathEffect intervals={[6, 6]} />
            </Line>
          </Canvas>
        ) : null}
      </View>
      <View style={styles.axis}>
        <AppText variant="caption" color="muted">
          {first ? formatShortDate(first.date) : ''}
        </AppText>
        <AppText
          variant="caption"
          color="muted"
          style={styles.axisMiddle}
          center
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.5}
        >
          - - budget {formatINRWhole(typicalBudgetPaise)}/day
        </AppText>
        <AppText variant="caption" color="muted">
          {last ? formatShortDate(last.date) : ''}
        </AppText>
      </View>
      <AppText variant="caption" color={overDays.length > 0 ? 'coralText' : 'accentText'}>
        {overDays.length === 0
          ? 'On budget every day so far this cycle.'
          : `Over budget on ${overDays.length} of ${days.length} days.`}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: SPACE.sm },
  axis: { flexDirection: 'row', justifyContent: 'space-between', gap: SPACE.sm },
  axisMiddle: { flex: 1 },
});
