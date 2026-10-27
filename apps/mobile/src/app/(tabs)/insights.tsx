import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { Amount } from '@/components/Amount';
import { AppText } from '@/components/AppText';
import { Card } from '@/components/Card';
import { DailyBars } from '@/components/charts/DailyBars';
import { DonutChart } from '@/components/charts/DonutChart';
import { Icon } from '@/components/Icon';
import { Screen } from '@/components/Screen';
import { EmptyState, ErrorState, LoadingState } from '@/components/States';
import { CATEGORIES } from '@/domain/categories';
import { formatINRWhole } from '@/domain/money';
import { formatShortDate } from '@/lib/format';
import { useInsights, useToday, type InsightsData } from '@/state/queries';
import { useTheme } from '@/theme/ThemeProvider';
import { RADIUS, SPACE } from '@/theme/tokens';

export default function InsightsScreen() {
  const insights = useInsights();
  const today = useToday();

  return (
    <Screen>
      <View style={styles.screenHeader}>
        <AppText variant="title" accessibilityRole="header">
          Your Money Story
        </AppText>
        <AppText variant="caption" color="muted">
          Where your money went this cycle — honest, clear, and judgment-free.
        </AppText>
      </View>
      {insights.isPending ? (
        <LoadingState label="Loading insights" />
      ) : insights.isError ? (
        <ErrorState onRetry={() => insights.refetch()} />
      ) : !insights.data || !insights.data.hasData ? (
        <EmptyState
          icon="pie-chart-outline"
          title="Your story begins with your first payment"
          body="As your everyday payments arrive via bank SMS or UPI, Paisa Pulse gently organizes them into clear patterns. No spreadsheets, no guilt."
          actionLabel="Record cash spending"
          onAction={() => router.push('/add')}
        />
      ) : (
        <InsightsContent
          data={insights.data}
          typicalBudgetPaise={today.data?.snapshot.todayBudgetPaise ?? 0}
        />
      )}
    </Screen>
  );
}

function InsightsContent({
  data,
  typicalBudgetPaise,
}: {
  data: InsightsData;
  typicalBudgetPaise: number;
}) {
  const { colors } = useTheme();
  const splitTotal = data.split.essentialPaise + data.split.nonEssentialPaise;
  const essentialPct =
    splitTotal > 0 ? Math.round((data.split.essentialPaise / splitTotal) * 100) : 0;
  const budgetLine =
    typicalBudgetPaise ||
    Math.round(
      data.days.reduce((s, d) => s + (d.budgetPaise ?? 0), 0) / Math.max(1, data.days.length),
    );

  return (
    <>
      <View>
        <AppText color="muted">
          {formatShortDate(data.cycleStart)} – {formatShortDate(data.cycleEnd)}
        </AppText>
        <Amount paise={data.totalSpentPaise} variant="hero" animated />
        <AppText color="muted">spent this cycle</AppText>
      </View>

      <Card>
        <AppText variant="heading" accessibilityRole="header">
          By category
        </AppText>
        <View style={styles.donutRow}>
          <DonutChart
            slices={data.byCategory}
            totalPaise={data.totalSpentPaise}
            size={168}
            stroke={22}
          />
        </View>
        <View style={styles.legend}>
          {data.byCategory.map((c) => {
            const pct =
              data.totalSpentPaise > 0
                ? Math.round((c.totalPaise / data.totalSpentPaise) * 100)
                : 0;
            return (
              <View
                key={c.category}
                style={styles.legendRow}
                accessible
                accessibilityLabel={`${CATEGORIES[c.category].label}: ${formatINRWhole(c.totalPaise)}, ${pct} percent, ${c.count} payments`}
              >
                <View style={[styles.swatch, { backgroundColor: colors.categories[c.category] }]} />
                <AppText style={styles.flex} numberOfLines={1}>
                  {CATEGORIES[c.category].emoji} {CATEGORIES[c.category].label}
                </AppText>
                <AppText color="muted" tabular>
                  {pct}%
                </AppText>
                <AppText variant="bodyStrong" tabular style={styles.amountCol}>
                  {formatINRWhole(c.totalPaise)}
                </AppText>
              </View>
            );
          })}
        </View>
      </Card>

      <Card>
        <AppText variant="heading" accessibilityRole="header">
          Daily spend vs budget
        </AppText>
        <DailyBars days={data.days} typicalBudgetPaise={budgetLine} />
      </Card>

      <Card>
        <View style={styles.row}>
          <Icon name="sparkles-outline" color="amberText" />
          <AppText variant="heading" accessibilityRole="header">
            Everyday comforts (under ₹500)
          </AppText>
        </View>
        <AppText color="muted">
          Chai, auto rides, snacks, quick treats. They add flavor to daily life — seeing the total
          helps you stay mindful.
        </AppText>
        <View style={styles.row}>
          <Amount paise={data.leaks.totalPaise} variant="title" animated />
          <AppText color="muted" tabular>
            across {data.leaks.count} {data.leaks.count === 1 ? 'payment' : 'payments'}
          </AppText>
        </View>
        {data.leaks.count > 0 ? (
          <AppText variant="caption" color="muted">
            Averages about{' '}
            {formatINRWhole(Math.round(data.leaks.totalPaise / Math.max(1, data.days.length)))} a
            day in small everyday comforts.
          </AppText>
        ) : null}
      </Card>

      <Card>
        <AppText variant="heading" accessibilityRole="header">
          Places you visited most
        </AppText>
        {data.merchants.map((m, i) => (
          <View
            key={m.merchantNorm}
            style={styles.legendRow}
            accessible
            accessibilityLabel={`${i + 1}. ${m.merchantDisplay}: ${formatINRWhole(m.totalPaise)} over ${m.count} payments`}
          >
            <AppText color="muted" tabular style={styles.rank}>
              {i + 1}
            </AppText>
            <View style={styles.flex}>
              <AppText variant="bodyStrong" numberOfLines={1}>
                {m.merchantDisplay}
              </AppText>
              <AppText variant="caption" color="muted">
                {m.count} {m.count === 1 ? 'payment' : 'payments'}
              </AppText>
            </View>
            <AppText variant="bodyStrong" tabular>
              {formatINRWhole(m.totalPaise)}
            </AppText>
          </View>
        ))}
      </Card>

      <Card>
        <AppText variant="heading" accessibilityRole="header">
          Essentials vs life&apos;s extras
        </AppText>
        <AppText variant="caption" color="muted">
          Essentials sustain your family and life. Extras bring joy. Finding harmony between both
          creates lasting calm.
        </AppText>
        <View
          style={[styles.splitBar, { backgroundColor: colors.track }]}
          accessible
          accessibilityLabel={`Essentials ${essentialPct} percent, extras ${100 - essentialPct} percent`}
        >
          <View
            style={[
              styles.splitFill,
              { width: `${essentialPct}%`, backgroundColor: colors.accent },
            ]}
          />
        </View>
        <View style={styles.splitLegend}>
          <View>
            <AppText variant="caption" color="muted">
              Essentials · {essentialPct}%
            </AppText>
            <AppText variant="bodyStrong" tabular>
              {formatINRWhole(data.split.essentialPaise)}
            </AppText>
          </View>
          <View style={styles.alignEnd}>
            <AppText variant="caption" color="muted">
              Extras · {100 - essentialPct}%
            </AppText>
            <AppText variant="bodyStrong" tabular>
              {formatINRWhole(data.split.nonEssentialPaise)}
            </AppText>
          </View>
        </View>
      </Card>
    </>
  );
}

const styles = StyleSheet.create({
  screenHeader: { gap: 4, marginBottom: SPACE.xs },
  donutRow: { alignItems: 'center', paddingVertical: SPACE.sm },
  legend: { gap: SPACE.sm },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: SPACE.md, minHeight: 32 },
  swatch: { width: 12, height: 12, borderRadius: 6 },
  amountCol: { minWidth: 76, textAlign: 'right' },
  rank: { width: 20 },
  row: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm, flexWrap: 'wrap' },
  flex: { flex: 1 },
  splitBar: { height: 14, borderRadius: RADIUS.pill, overflow: 'hidden' },
  splitFill: { height: '100%', borderRadius: RADIUS.pill },
  splitLegend: { flexDirection: 'row', justifyContent: 'space-between' },
  alignEnd: { alignItems: 'flex-end' },
});
