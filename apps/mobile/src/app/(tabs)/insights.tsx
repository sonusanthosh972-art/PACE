import { router } from 'expo-router';
import { Fragment } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { Amount } from '@/components/Amount';
import { AppHeader, HeaderBackground, TAB_GUTTER } from '@/components/AppHeader';
import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { DailyBars } from '@/components/charts/DailyBars';
import { DonutChart } from '@/components/charts/DonutChart';
import { Icon, type IconName } from '@/components/Icon';
import { Screen } from '@/components/Screen';
import { ErrorState, LoadingState } from '@/components/States';
import { CATEGORIES } from '@/domain/categories';
import { formatINRWhole } from '@/domain/money';
import type { StoryLine } from '@/domain/story';
import { formatShortDate } from '@/lib/format';
import { useInsights, type InsightsData } from '@/state/queries';
import { useTheme } from '@/theme/ThemeProvider';
import { ICON, MOTION, RADIUS, SPACE, withAlpha } from '@/theme/tokens';

export default function InsightsScreen() {
  const insights = useInsights();

  return (
    <Screen background={<HeaderBackground />} backgroundScrolls gutter={TAB_GUTTER}>
      <AppHeader title="Your Money Story" subtitle="Where your money went, in plain words." />
      {insights.isPending ? (
        <LoadingState label="Loading your money story" />
      ) : insights.isError ? (
        <ErrorState onRetry={() => insights.refetch()} />
      ) : !insights.data || !insights.data.hasData ? (
        <StoryEmpty />
      ) : (
        <InsightsContent data={insights.data} />
      )}
    </Screen>
  );
}

function StoryEmpty() {
  const { colors } = useTheme();
  return (
    <Animated.View entering={FadeIn.duration(MOTION.screenMs)} style={styles.empty}>
      <View style={[styles.emptyMark, { backgroundColor: withAlpha(colors.accent, 0.12) }]}>
        <Icon name="book-outline" size={ICON.lg} color="accentText" />
      </View>
      <AppText variant="heading" center>
        Your story begins with your first payment
      </AppText>
      <AppText color="muted" center style={styles.emptyBody}>
        As your everyday spending arrives, Paisa Pulse gently turns it into clear patterns and
        useful insights.
      </AppText>
      <Button
        label="Record cash spending"
        icon="add"
        variant="secondary"
        compact
        onPress={() => router.push('/add')}
      />
    </Animated.View>
  );
}

function SectionLabel({ title, aside }: { title: string; aside?: string }) {
  return (
    <View style={styles.sectionLabel}>
      <AppText variant="overline" color="muted" accessibilityRole="header">
        {title}
      </AppText>
      {aside ? (
        <AppText variant="caption" color="muted" numberOfLines={1} style={styles.aside}>
          {aside}
        </AppText>
      ) : null}
    </View>
  );
}

function StoryText({ line }: { line: StoryLine }) {
  return (
    <AppText style={styles.flex}>
      {line.parts.map((p, i) =>
        typeof p === 'string' ? (
          <Fragment key={i}>{p}</Fragment>
        ) : (
          <AppText key={i} variant="bodyStrong">
            {p.strong}
          </AppText>
        ),
      )}
    </AppText>
  );
}

function InsightsContent({ data }: { data: InsightsData }) {
  const { colors } = useTheme();
  const budgetDays = data.days.filter((d) => d.budgetPaise !== null);
  const budgetLine = budgetDays.length
    ? Math.round(budgetDays.reduce((s, d) => s + (d.budgetPaise ?? 0), 0) / budgetDays.length)
    : 0;

  return (
    <View style={styles.content}>
      {/* The headline number */}
      <View style={styles.hero}>
        <AppText variant="overline" color="muted">
          {formatShortDate(data.cycleStart)} – {formatShortDate(data.cycleEnd)}
        </AppText>
        <Amount paise={data.totalSpentPaise} variant="hero" animated fit />
        <AppText color="muted">spent this cycle</AppText>
        {data.week.thisWeekPaise > 0 ? (
          <AppText variant="caption" color="muted" tabular>
            {formatINRWhole(data.week.thisWeekPaise)} this week so far
          </AppText>
        ) : null}
      </View>

      {/* Your patterns: plain sentences, no card */}
      {data.story.length > 0 ? (
        <View style={styles.section}>
          <SectionLabel title="Your patterns" />
          <View>
            {data.story.map((line, i) => (
              <View
                key={line.id}
                style={[
                  styles.storyRow,
                  i > 0 && {
                    borderTopColor: colors.border,
                    borderTopWidth: StyleSheet.hairlineWidth,
                  },
                ]}
              >
                <Icon name={line.icon as IconName} size={ICON.md} color="accentText" />
                <StoryText line={line} />
              </View>
            ))}
          </View>
        </View>
      ) : null}

      {/* Where your money went */}
      <View style={styles.section}>
        <SectionLabel
          title="Where your money went"
          aside={`${data.byCategory.length} ${data.byCategory.length === 1 ? 'category' : 'categories'}`}
        />
        <View style={[styles.surface, { backgroundColor: colors.surface }]}>
          <View style={styles.donut}>
            <DonutChart
              slices={data.byCategory}
              totalPaise={data.categoryTotalPaise}
              size={150}
              stroke={18}
            />
          </View>
          {data.byCategory.map((c) => {
            const pct =
              data.categoryTotalPaise > 0
                ? Math.round((c.totalPaise / data.categoryTotalPaise) * 100)
                : 0;
            const def = CATEGORIES[c.category];
            const tint = colors.categories[c.category];
            return (
              <View
                key={c.category}
                style={styles.categoryRow}
                accessible
                accessibilityLabel={`${def.label}: ${formatINRWhole(c.totalPaise)}, ${pct} percent, ${c.count} ${c.count === 1 ? 'payment' : 'payments'}`}
              >
                <View style={[styles.badge, { backgroundColor: withAlpha(tint, 0.14) }]}>
                  <Icon name={def.icon as IconName} size={ICON.sm} tint={tint} />
                </View>
                <View style={styles.flex}>
                  <View style={styles.categoryTop}>
                    <AppText variant="bodyStrong" numberOfLines={1} style={styles.flex}>
                      {def.label}
                    </AppText>
                    <AppText variant="bodyStrong" tabular>
                      {formatINRWhole(c.totalPaise)}
                    </AppText>
                  </View>
                  <View style={styles.categoryBottom}>
                    <View style={[styles.track, { backgroundColor: colors.track }]}>
                      <View style={[styles.fill, { width: `${pct}%`, backgroundColor: tint }]} />
                    </View>
                    <AppText variant="caption" color="muted" tabular>
                      {pct}%
                    </AppText>
                  </View>
                </View>
              </View>
            );
          })}
        </View>
      </View>

      {/* Daily rhythm */}
      <View style={styles.section}>
        <SectionLabel
          title="Daily rhythm"
          aside={budgetLine > 0 ? `allowance ${formatINRWhole(budgetLine)}/day` : undefined}
        />
        <View style={[styles.surface, styles.chart, { backgroundColor: colors.surface }]}>
          <DailyBars days={data.days} typicalBudgetPaise={budgetLine} />
        </View>
      </View>

      {/* Places you paid most */}
      {data.merchants.length > 0 ? (
        <View style={styles.section}>
          <SectionLabel title="Where you paid most" />
          <View>
            {data.merchants.map((m, i) => (
              <View
                key={m.merchantNorm}
                style={[
                  styles.merchantRow,
                  i > 0 && {
                    borderTopColor: colors.border,
                    borderTopWidth: StyleSheet.hairlineWidth,
                  },
                ]}
                accessible
                accessibilityLabel={`${m.merchantDisplay}: ${formatINRWhole(m.totalPaise)} over ${m.count} ${m.count === 1 ? 'payment' : 'payments'}`}
              >
                <View style={styles.flex}>
                  <AppText variant="bodyStrong" numberOfLines={1}>
                    {m.merchantDisplay}
                  </AppText>
                  <AppText variant="caption" color="muted">
                    {m.count} {m.count === 1 ? 'payment' : 'payments'}
                  </AppText>
                </View>
                <AppText variant="bodyStrong" tabular numberOfLines={1} style={styles.amount}>
                  {formatINRWhole(m.totalPaise)}
                </AppText>
              </View>
            ))}
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { gap: SPACE.xl },

  empty: { alignItems: 'center', gap: SPACE.md, paddingTop: SPACE.xxl, paddingBottom: SPACE.xl },
  emptyMark: {
    width: 56,
    height: 56,
    borderRadius: RADIUS.pill,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACE.xs,
  },
  emptyBody: { maxWidth: 320, marginBottom: SPACE.sm },

  hero: { gap: SPACE.xs },
  section: { gap: SPACE.sm },
  sectionLabel: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: SPACE.md,
  },
  aside: { flexShrink: 1, textAlign: 'right' },

  storyRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACE.md,
    paddingVertical: SPACE.md,
  },

  surface: { borderRadius: RADIUS.lg, padding: SPACE.lg, gap: SPACE.md },
  chart: { padding: SPACE.md },
  donut: { alignItems: 'center', paddingBottom: SPACE.xs },
  categoryRow: { flexDirection: 'row', alignItems: 'center', gap: SPACE.md },
  badge: {
    width: 36,
    height: 36,
    borderRadius: RADIUS.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  categoryTop: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm },
  categoryBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.sm,
    marginTop: SPACE.xs,
  },
  track: { flex: 1, height: 4, borderRadius: RADIUS.pill, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: RADIUS.pill },

  merchantRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.md,
    paddingVertical: SPACE.md,
  },
  amount: { maxWidth: '45%' },
});
