import { router } from 'expo-router';
import { memo, useMemo, useState, type ReactNode } from 'react';
import { Modal, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { Amount } from '@/components/Amount';
import { HeaderBackground, ON_IMAGE_SHADOW, TAB_GUTTER } from '@/components/AppHeader';
import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { DonutChart } from '@/components/charts/DonutChart';
import { Sparkline } from '@/components/charts/Sparkline';
import { Icon, type IconName } from '@/components/Icon';
import { PressableScale } from '@/components/PressableScale';
import { Reveal } from '@/components/Reveal';
import { InfoButton } from '@/components/InfoButton';
import { Screen } from '@/components/Screen';
import { useAfterTransition, useProgressiveCount } from '@/components/useAfterTransition';
import { ErrorState, LoadingState } from '@/components/States';
import { CATEGORIES } from '@/domain/categories';
import { formatINRWhole } from '@/domain/money';
import { cycleLabel, type BreakdownRow, type Pattern } from '@/domain/story';
import { formatDayLabel, formatShortDate } from '@/lib/format';
import { useTodayKey } from '@/lib/useTodayKey';
import {
  cycleAtOffset,
  INSIGHT_CYCLES,
  useInsights,
  useProfile,
  useToday,
  type InsightsData,
} from '@/state/queries';
import { useTheme } from '@/theme/ThemeProvider';
import { COLORS, ICON, MIN_TOUCH, MOTION, RADIUS, SPACE, withAlpha } from '@/theme/tokens';

const CARD_PAD = SPACE.lg;

export default function InsightsScreen() {
  const [offset, setOffset] = useState(0);
  const insights = useInsights(offset);
  // The cards and chart are built after the tab has slid in, not during the slide.
  const settled = useAfterTransition();

  return (
    <Screen background={<HeaderBackground />} backgroundScrolls gutter={TAB_GUTTER}>
      <InsightsHeader offset={offset} onChangeOffset={setOffset} />
      {insights.isPending || !settled ? (
        settled ? (
          <LoadingState label="Loading your money story" />
        ) : null
      ) : insights.isError ? (
        <ErrorState onRetry={() => insights.refetch()} />
      ) : !insights.data || !insights.data.hasData ? (
        <>
          <StoryEmpty past={offset > 0} />
          {offset === 0 ? <AskAssistantCard /> : null}
        </>
      ) : (
        <InsightsContent
          data={insights.data}
          middle={
            offset === 0 ? (
              <>
                <SafeToSpendCard />
                <AskAssistantCard />
              </>
            ) : null
          }
        />
      )}
    </Screen>
  );
}

/* ---------------------------------------------------------------- header + month picker */

function InsightsHeader({
  offset,
  onChangeOffset,
}: {
  offset: number;
  onChangeOffset: (offset: number) => void;
}) {
  const { colors } = useTheme();
  const today = useTodayKey();
  const payday = useProfile().data?.payday ?? null;
  const [picking, setPicking] = useState(false);
  const cycles =
    payday === null
      ? []
      : Array.from({ length: INSIGHT_CYCLES }, (_, i) => cycleAtOffset(today, payday, i));
  const current = cycles[offset];

  return (
    <View style={styles.header}>
      <View style={styles.titleRow}>
        <View style={styles.flex}>
          <AppText variant="serifTitle" accessibilityRole="header" style={ON_IMAGE_SHADOW}>
            Insights
          </AppText>
          <AppText
            variant="caption"
            style={[styles.subtitle, styles.onImageMuted, ON_IMAGE_SHADOW]}
          >
            {offset === 0 ? 'How you spent this month' : 'How you spent that month'}
          </AppText>
        </View>
        {current ? (
          <PressableScale
            onPress={() => setPicking(true)}
            accessibilityRole="button"
            accessibilityLabel={`Showing ${cycleLabel(current.start)}. Choose another month.`}
            style={[
              styles.monthPill,
              { backgroundColor: colors.surface, borderColor: colors.border },
            ]}
          >
            <AppText variant="caption">{cycleLabel(current.start)}</AppText>
            <Icon name="chevron-down" size={ICON.sm} color="muted" />
          </PressableScale>
        ) : null}
      </View>

      <Modal
        visible={picking}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setPicking(false)}
      >
        <Pressable
          style={[styles.backdrop, { backgroundColor: colors.scrim }]}
          onPress={() => setPicking(false)}
          accessibilityLabel="Close"
        >
          <View
            style={[styles.sheet, { backgroundColor: colors.surface, borderColor: colors.border }]}
            accessibilityRole="radiogroup"
            accessibilityLabel="Choose a month"
          >
            <AppText variant="heading" style={styles.sheetTitle}>
              Choose a month
            </AppText>
            {cycles.map((c, i) => {
              const selected = i === offset;
              return (
                <PressableScale
                  key={c.start}
                  onPress={() => {
                    onChangeOffset(i);
                    setPicking(false);
                  }}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: selected }}
                  accessibilityLabel={`${cycleLabel(c.start)}, ${formatShortDate(c.start)} to ${formatShortDate(c.end)}`}
                  style={[
                    styles.monthRow,
                    selected && { backgroundColor: withAlpha(colors.accent, 0.12) },
                  ]}
                >
                  <View style={styles.flex}>
                    <AppText variant="bodyStrong">
                      {cycleLabel(c.start)}
                      {i === 0 ? ' · this cycle' : ''}
                    </AppText>
                    <AppText variant="caption" color="muted">
                      {formatShortDate(c.start)} – {formatShortDate(c.end)}
                    </AppText>
                  </View>
                  {selected ? <Icon name="checkmark" size={ICON.md} color="accentText" /> : null}
                </PressableScale>
              );
            })}
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

/* ---------------------------------------------------------------- safe to spend */

/**
 * The carry-forward numbers for the cycle in progress: what is left of today's allowance, and the
 * new daily average for the days after today if nothing more is spent today.
 */
/** Entry to the Money Assistant: questions answered from the user's own numbers. */
const AskAssistantCard = memo(function AskAssistantCard() {
  const { colors } = useTheme();
  return (
    <PressableScale
      onPress={() => router.push('/assistant')}
      accessibilityRole="button"
      accessibilityLabel="Ask the Money Assistant"
      accessibilityHint="Ask about your spending, savings or a purchase"
      testID="ask-assistant"
      style={[styles.askCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
    >
      <View style={[styles.askIcon, { backgroundColor: withAlpha(colors.accent, 0.16) }]}>
        <Icon name="sparkles" size={ICON.md} tint={colors.accent} />
      </View>
      <View style={styles.askText}>
        <AppText variant="bodyStrong">Ask your Money Assistant</AppText>
        <AppText variant="caption" color="muted">
          Spending, savings or &ldquo;can I afford this?&rdquo;, answered from your numbers.
        </AppText>
      </View>
      <Icon name="chevron-forward" size={ICON.md} color="muted" />
    </PressableScale>
  );
});

const SafeToSpendCard = memo(function SafeToSpendCard() {
  const { colors } = useTheme();
  const today = useToday();
  const snapshot = today.data?.snapshot;
  if (!snapshot) return null;

  const left = snapshot.remainingTodayPaise;
  const over = left < 0;
  const next = snapshot.nextDaysAveragePaise;
  const days = snapshot.daysLeft - 1;

  return (
    <Reveal order={0}>
      <View
        style={[
          styles.card,
          styles.safeWrap,
          { backgroundColor: colors.surface, borderColor: colors.border },
        ]}
        testID="safe-to-spend"
      >
        <View style={styles.sectionHead}>
          <Icon name="wallet-outline" size={ICON.sm} color="accentText" />
          <AppText variant="bodyStrong" accessibilityRole="header">
            Safe to spend
          </AppText>
        </View>
        <View style={styles.safeRow}>
          <View
            style={styles.safeCell}
            accessible
            accessibilityLabel={
              over
                ? `${formatINRWhole(-left)} over today's allowance of ${formatINRWhole(snapshot.todayBudgetPaise)}`
                : `${formatINRWhole(left)} left of today's allowance of ${formatINRWhole(snapshot.todayBudgetPaise)}`
            }
          >
            <Amount
              paise={over ? -left : left}
              variant="heading"
              color={over ? 'amberText' : 'accentText'}
              animated
              fit
            />
            <AppText variant="caption" color="muted">
              {over ? 'over today' : 'left today'}
            </AppText>
            <AppText variant="caption" color="muted" tabular>
              of {formatINRWhole(snapshot.todayBudgetPaise)}
            </AppText>
          </View>
          <View style={[styles.vDivider, { backgroundColor: colors.border }]} />
          <View
            style={styles.safeCell}
            accessible
            accessibilityLabel={
              next === null
                ? 'Payday is tomorrow'
                : `From tomorrow, ${formatINRWhole(next)} a day for ${days} days until payday`
            }
          >
            {next === null ? (
              <AppText variant="heading">Payday</AppText>
            ) : (
              <Amount paise={next} variant="heading" animated fit suffix=" /day" />
            )}
            <AppText variant="caption" color="muted">
              {next === null ? 'is tomorrow' : 'from tomorrow'}
            </AppText>
            {next === null ? null : (
              <AppText variant="caption" color="muted" tabular>
                for {days} {days === 1 ? 'day' : 'days'}
              </AppText>
            )}
          </View>
        </View>
        <AppText variant="caption" color="muted">
          Bills, EMIs and savings are set aside first. Money you don’t spend carries forward, and an
          overspend is shared across the days until payday.
        </AppText>
      </View>
    </Reveal>
  );
});

/* ---------------------------------------------------------------- empty */

function StoryEmpty({ past }: { past: boolean }) {
  const { colors } = useTheme();
  return (
    <Animated.View entering={FadeIn.duration(MOTION.screenMs)} style={styles.empty}>
      <View style={[styles.emptyMark, { backgroundColor: withAlpha(colors.accent, 0.12) }]}>
        <Icon name="book-outline" size={ICON.lg} color="accentText" />
      </View>
      <AppText variant="heading" center>
        {past ? 'No spending recorded that month' : 'Your story begins with your first payment'}
      </AppText>
      <AppText color="muted" center style={styles.emptyBody}>
        {past
          ? 'Pick another month above, or come back once more payments have arrived.'
          : 'As your everyday spending arrives, PACE gently turns it into clear patterns and useful insights.'}
      </AppText>
      {past ? null : (
        <Button
          label="Record cash spending"
          icon="add"
          variant="secondary"
          compact
          onPress={() => router.push('/add')}
        />
      )}
    </Animated.View>
  );
}

/* ---------------------------------------------------------------- content */

const InsightsContent = memo(function InsightsContent({
  data,
  middle,
}: {
  data: InsightsData;
  middle?: ReactNode;
}) {
  // One card per frame: the chart, the list and the patterns never mount together in one stall.
  const shown = useProgressiveCount(5);
  return (
    <View style={styles.content}>
      <Reveal order={0}>
        <SummaryCard data={data} />
      </Reveal>
      {shown >= 2 ? (
        <Reveal order={1}>
          <BreakdownCard data={data} />
        </Reveal>
      ) : null}
      {shown >= 3 ? middle : null}
      {shown >= 4 && data.patterns.length > 0 ? (
        <Reveal order={2}>
          <Patterns patterns={data.patterns} />
        </Reveal>
      ) : null}
      {shown >= 5 ? (
        <Reveal order={3}>
          <Highlights data={data} />
        </Reveal>
      ) : null}
    </View>
  );
});

const SummaryCard = memo(function SummaryCard({ data }: { data: InsightsData }) {
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const used = data.poolPaise > 0 ? data.totalSpentPaise / data.poolPaise : 0;
  const barColor = used > 1 ? colors.coral : used >= 0.8 ? colors.amber : colors.accent;
  // Change against the same number of days last cycle; lower spending is good (green).
  const change =
    data.previousSpentPaise > 0
      ? Math.round(
          ((data.totalSpentPaise - data.previousSpentPaise) / data.previousSpentPaise) * 100,
        )
      : null;
  const better = change !== null && change <= 0;
  const sparkWidth = Math.round(Math.min(140, (width - TAB_GUTTER * 2) * 0.36));

  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={styles.summaryTop}>
        <View style={styles.flex}>
          <View style={styles.titleWithInfo}>
            <AppText variant="label" color="muted">
              Total spent
            </AppText>
            <InfoButton topic="totalSpent" />
          </View>
          <Amount
            paise={data.totalSpentPaise}
            variant="title"
            animated
            fit
            style={colors.atmosphere.heroAmount}
          />
        </View>
        <Sparkline values={data.dailySpentPaise} width={sparkWidth} height={56} />
      </View>
      {change !== null ? (
        <View style={styles.changeRow}>
          <View
            style={[
              styles.changeBadge,
              { backgroundColor: withAlpha(better ? colors.accent : colors.coral, 0.16) },
            ]}
          >
            <Icon
              name={better ? 'arrow-down' : 'arrow-up'}
              size={12}
              color={better ? 'accentText' : 'coralText'}
            />
            <AppText variant="caption" color={better ? 'accentText' : 'coralText'} tabular>
              {Math.abs(change)}%
            </AppText>
          </View>
          <AppText variant="caption" color="muted">
            than last month, same days
          </AppText>
        </View>
      ) : null}
      <View
        style={[styles.bar, { backgroundColor: colors.track }]}
        accessible
        accessibilityRole="progressbar"
        accessibilityLabel={`${Math.round(used * 100)} percent of this cycle's spending money used`}
        accessibilityValue={{ min: 0, max: 100, now: Math.min(100, Math.round(used * 100)) }}
      >
        <View
          style={[
            styles.barFill,
            { width: `${Math.min(100, used * 100)}%`, backgroundColor: barColor },
          ]}
        />
      </View>
      <View style={styles.summaryFoot}>
        <AppText variant="caption" color="muted" tabular>
          {formatINRWhole(data.remainingPaise)}{' '}
          {data.inProgress ? 'left this month' : 'left unspent'}
        </AppText>
        {data.incomePaise > 0 ? (
          <AppText variant="caption" color="muted" tabular>
            {Math.round((data.totalSpentPaise / data.incomePaise) * 100)}% of income
          </AppText>
        ) : null}
      </View>
    </View>
  );
});

const BreakdownCard = memo(function BreakdownCard({ data }: { data: InsightsData }) {
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const inner = width - TAB_GUTTER * 2 - CARD_PAD * 2;
  const donutSize = Math.round(Math.min(168, inner * 0.55));
  const sliceColor = (row: BreakdownRow) =>
    row.category ? colors.categories[row.category] : colors.muted;

  const slices = useMemo(
    () =>
      data.breakdown.map((r) => ({
        key: r.key,
        category: r.category,
        totalPaise: r.totalPaise,
        color: r.category ? colors.categories[r.category] : colors.muted,
      })),
    [data.breakdown, colors.categories, colors.muted],
  );

  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <AppText variant="bodyStrong" accessibilityRole="header">
        Spending by category
      </AppText>
      <View style={styles.donutWrap}>
        <DonutChart
          slices={slices}
          totalPaise={data.categoryTotalPaise}
          size={donutSize}
          stroke={Math.round(donutSize * 0.14)}
          centerLabel="Spent"
        />
      </View>
      <View style={styles.legend}>
        {data.breakdown.map((r) => (
          <View
            key={r.key}
            style={styles.legendRow}
            accessible
            accessibilityLabel={`${r.category ? CATEGORIES[r.category].label : 'Others'}: ${formatINRWhole(r.totalPaise)}, ${r.pct} percent`}
          >
            <View style={[styles.dot, { backgroundColor: sliceColor(r) }]} />
            <AppText numberOfLines={1} style={styles.flex}>
              {r.label}
            </AppText>
            <AppText color="muted" tabular style={styles.legendPct}>
              {r.pct}%
            </AppText>
            <AppText tabular numberOfLines={1} style={styles.legendAmount}>
              {formatINRWhole(r.totalPaise)}
            </AppText>
          </View>
        ))}
      </View>
    </View>
  );
});

const Patterns = memo(function Patterns({ patterns }: { patterns: Pattern[] }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={styles.sectionHead}>
        <Icon name="stats-chart" size={ICON.sm} color="accentText" />
        <AppText variant="bodyStrong" accessibilityRole="header">
          Your patterns
        </AppText>
      </View>
      {patterns.map((p) => (
        <PatternRow key={p.id} pattern={p} />
      ))}
    </View>
  );
});

const PatternRow = memo(function PatternRow({ pattern }: { pattern: Pattern }) {
  const { colors } = useTheme();
  const tint =
    pattern.tone === 'category' && pattern.category
      ? colors.categories[pattern.category]
      : pattern.tone === 'amber'
        ? colors.amber
        : colors.accent;
  const open = () => {
    if (pattern.id === 'top' && pattern.category) {
      router.push({
        pathname: '/transactions',
        params: { category: pattern.category, at: String(Date.now()) },
      });
    } else if (pattern.id === 'allowance') {
      router.push('/');
    } else {
      router.push('/transactions');
    }
  };

  return (
    <PressableScale
      onPress={open}
      accessibilityRole="button"
      accessibilityLabel={`${pattern.title} ${pattern.detail}${pattern.badge ? `. ${pattern.badge}` : ''}`}
      style={[styles.pattern, { backgroundColor: colors.elevated }]}
    >
      <View style={[styles.iconTile, { backgroundColor: withAlpha(tint, 0.16) }]}>
        <Icon name={pattern.icon as IconName} size={ICON.md} tint={tint} />
      </View>
      <View style={styles.flex}>
        <AppText variant="label">{pattern.title}</AppText>
        <View style={styles.detailRow}>
          <AppText variant="caption" color="muted" style={styles.shrink}>
            {pattern.detail}
          </AppText>
          {pattern.badge ? (
            <View
              style={[
                styles.badge,
                {
                  backgroundColor: withAlpha(colors.accent, 0.12),
                  borderColor: withAlpha(colors.accent, 0.4),
                },
              ]}
            >
              <Icon name="checkmark-circle-outline" size={ICON.sm - 2} color="accentText" />
              <AppText variant="caption" color="accentText">
                {pattern.badge}
              </AppText>
            </View>
          ) : null}
        </View>
      </View>
      <Icon name="chevron-forward" size={ICON.md} color="muted" />
    </PressableScale>
  );
});

const Highlights = memo(function Highlights({ data }: { data: InsightsData }) {
  const { colors } = useTheme();
  const today = useTodayKey();
  const { biggestDay, quietWin } = data;
  if (!biggestDay && !quietWin) return null;

  return (
    <View style={styles.highlights}>
      {biggestDay ? (
        <View
          style={[
            styles.card,
            styles.highlight,
            { backgroundColor: colors.surface, borderColor: colors.border },
          ]}
          accessible
          accessibilityLabel={`Biggest spending day: ${formatDayLabel(biggestDay.date, today)}, ${formatINRWhole(biggestDay.totalPaise)}`}
        >
          <View style={styles.sectionHead}>
            <Icon name="calendar-outline" size={ICON.sm} color="accentText" />
            <AppText variant="caption" numberOfLines={1} style={styles.shrink}>
              Biggest spending day
            </AppText>
          </View>
          <AppText variant="bodyStrong" numberOfLines={1}>
            {formatDayLabel(biggestDay.date, today)}
          </AppText>
          <Amount paise={biggestDay.totalPaise} variant="heading" fit />
          <AppText variant="caption" color="muted" numberOfLines={2}>
            {biggestDay.categories.map((c) => CATEGORIES[c].shortLabel).join(' · ')}
          </AppText>
        </View>
      ) : null}
      {quietWin ? (
        <View
          style={[
            styles.card,
            styles.highlight,
            {
              backgroundColor: withAlpha(colors.accent, colors.softTint),
              borderColor: withAlpha(colors.accent, colors.softTint * 2.5),
            },
          ]}
          accessible
          accessibilityLabel={`A quiet win: ${quietWin.before}${quietWin.strong}${quietWin.after}`}
        >
          <View style={styles.sectionHead}>
            <Icon name="trophy-outline" size={ICON.sm} tint={colors.accent} />
            <AppText variant="caption" numberOfLines={1} style={styles.shrink}>
              A quiet win
            </AppText>
          </View>
          <AppText>
            {quietWin.before}
            <AppText variant="bodyStrong" color="accentText">
              {quietWin.strong}
            </AppText>
            {quietWin.after}
          </AppText>
        </View>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  askCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.md,
    padding: SPACE.lg,
    borderRadius: RADIUS.lg,
    borderWidth: StyleSheet.hairlineWidth,
    minHeight: MIN_TOUCH + SPACE.lg,
  },
  askIcon: {
    width: 40,
    height: 40,
    borderRadius: RADIUS.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  askText: { flex: 1, gap: 2 },
  flex: { flex: 1 },
  shrink: { flexShrink: 1 },
  fullWidth: { alignSelf: 'stretch' },

  header: { gap: SPACE.xs, marginBottom: SPACE.xs },
  subtitle: { fontSize: 14, lineHeight: 20, marginTop: SPACE.xs },
  onImageMuted: { color: COLORS.atmosphere.onImageMuted },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: SPACE.md,
  },
  bigTitle: { fontSize: 32, lineHeight: 40 },
  monthPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.xs,
    minHeight: MIN_TOUCH - SPACE.sm,
    paddingHorizontal: SPACE.md,
    borderRadius: RADIUS.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  storyRow: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm },

  backdrop: { flex: 1, justifyContent: 'center', padding: SPACE.xl },
  sheet: { borderRadius: RADIUS.lg, borderWidth: 1, padding: SPACE.sm },
  sheetTitle: { paddingHorizontal: SPACE.md, paddingVertical: SPACE.sm },
  monthRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.md,
    minHeight: MIN_TOUCH + SPACE.sm,
    paddingHorizontal: SPACE.md,
    borderRadius: RADIUS.md,
  },

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

  content: { gap: SPACE.lg },
  safeWrap: {},
  safeRow: { flexDirection: 'row', alignItems: 'center', gap: SPACE.md },
  safeCell: { flex: 1, gap: 2 },
  card: {
    borderRadius: RADIUS.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: CARD_PAD + 4,
    gap: SPACE.md,
  },
  titleWithInfo: { flexDirection: 'row', alignItems: 'center', gap: SPACE.xs },
  changeRow: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm },
  changeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: SPACE.sm,
    paddingVertical: 2,
    borderRadius: RADIUS.pill,
  },
  summaryFoot: { flexDirection: 'row', justifyContent: 'space-between', gap: SPACE.md },
  donutWrap: { alignItems: 'center', paddingVertical: SPACE.sm },
  legend: { gap: SPACE.xs },

  summaryTop: { flexDirection: 'row', alignItems: 'center', gap: SPACE.md },
  summaryAmount: { fontSize: 30, lineHeight: 38 },
  vDivider: { width: StyleSheet.hairlineWidth, alignSelf: 'stretch' },
  remaining: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm, maxWidth: '45%' },
  iconTile: {
    width: 40,
    height: 40,
    borderRadius: RADIUS.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bar: { height: 8, borderRadius: RADIUS.pill, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: RADIUS.pill },

  breakdown: { flexDirection: 'row', alignItems: 'center', gap: SPACE.lg },
  breakdownStacked: { flexDirection: 'column' },
  breakdownTitle: { marginBottom: SPACE.xs },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: SPACE.md, minHeight: 34 },
  dot: { width: 10, height: 10, borderRadius: RADIUS.pill },
  legendPct: { minWidth: 44, textAlign: 'right' },
  legendAmount: { minWidth: 72, textAlign: 'right' },

  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm },
  pattern: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.md,
    padding: SPACE.md,
    borderRadius: RADIUS.md,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: SPACE.sm,
    marginTop: SPACE.xs / 2,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.xs,
    paddingHorizontal: SPACE.sm,
    borderRadius: RADIUS.pill,
    borderWidth: 1,
  },

  highlights: { flexDirection: 'row', gap: SPACE.md },
  highlight: { flex: 1, gap: SPACE.xs },
});
