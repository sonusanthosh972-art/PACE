import { router } from 'expo-router';
import { memo, useMemo, useState } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View,
  type TextStyle,
} from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { Amount } from '@/components/Amount';
import { HeaderBackground, ON_IMAGE_SHADOW, TAB_GUTTER } from '@/components/AppHeader';
import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { DonutChart } from '@/components/charts/DonutChart';
import { Icon, type IconName } from '@/components/Icon';
import { PressableScale } from '@/components/PressableScale';
import { Reveal } from '@/components/Reveal';
import { Screen } from '@/components/Screen';
import { useAfterTransition } from '@/components/useAfterTransition';
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
import { ICON, MIN_TOUCH, MOTION, RADIUS, SPACE, withAlpha } from '@/theme/tokens';

const CARD_PAD = SPACE.lg;

export default function InsightsScreen() {
  const [offset, setOffset] = useState(0);
  const insights = useInsights(offset);
  // The cards and chart are built after the tab has slid in, not during the slide.
  const settled = useAfterTransition();

  return (
    <Screen background={<HeaderBackground />} backgroundScrolls gutter={TAB_GUTTER}>
      <InsightsHeader offset={offset} onChangeOffset={setOffset} />
      {offset === 0 ? <SafeToSpendCard /> : null}
      {offset === 0 ? <AskAssistantCard /> : null}
      {insights.isPending || !settled ? (
        settled ? (
          <LoadingState label="Loading your money story" />
        ) : null
      ) : insights.isError ? (
        <ErrorState onRetry={() => insights.refetch()} />
      ) : !insights.data || !insights.data.hasData ? (
        <StoryEmpty past={offset > 0} />
      ) : (
        <InsightsContent data={insights.data} />
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
  const onImage: TextStyle = { color: colors.atmosphere.onImage, ...ON_IMAGE_SHADOW };
  const onImageMuted: TextStyle = { color: colors.atmosphere.onImageMuted, ...ON_IMAGE_SHADOW };
  const cycles =
    payday === null
      ? []
      : Array.from({ length: INSIGHT_CYCLES }, (_, i) => cycleAtOffset(today, payday, i));
  const current = cycles[offset];

  return (
    <View style={styles.header}>
      <View style={styles.titleRow}>
        <AppText variant="serifTitle" accessibilityRole="header" style={[styles.bigTitle, onImage]}>
          Insights
        </AppText>
        {current ? (
          <PressableScale
            onPress={() => setPicking(true)}
            accessibilityRole="button"
            accessibilityLabel={`Showing ${cycleLabel(current.start)}. Choose another month.`}
            style={[styles.monthPill, { backgroundColor: colors.atmosphere.chrome }]}
          >
            <Icon name="calendar-outline" size={ICON.sm} tint={colors.atmosphere.onImage} />
            <AppText variant="label" style={onImage}>
              {cycleLabel(current.start)}
            </AppText>
            <Icon name="chevron-down" size={ICON.sm} tint={colors.atmosphere.onImageMuted} />
          </PressableScale>
        ) : null}
      </View>
      <View style={styles.storyRow}>
        <Icon name="book-outline" size={ICON.md} tint={colors.accent} />
        <AppText variant="bodyStrong" style={[{ color: colors.accent }, ON_IMAGE_SHADOW]}>
          Your Money Story
        </AppText>
      </View>
      <AppText style={onImageMuted}>
        Tap a pattern to see its payments, or pick another month.
      </AppText>

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

const InsightsContent = memo(function InsightsContent({ data }: { data: InsightsData }) {
  return (
    <View style={styles.content}>
      <Reveal order={0}>
        <SummaryCard data={data} />
      </Reveal>
      <Reveal order={1}>
        <BreakdownCard data={data} />
      </Reveal>
      {data.patterns.length > 0 ? (
        <Reveal order={2}>
          <Patterns patterns={data.patterns} />
        </Reveal>
      ) : null}
      <Reveal order={3}>
        <Highlights data={data} />
      </Reveal>
    </View>
  );
});

const SummaryCard = memo(function SummaryCard({ data }: { data: InsightsData }) {
  const { colors } = useTheme();
  const used = data.poolPaise > 0 ? data.totalSpentPaise / data.poolPaise : 0;
  const ofIncome =
    data.incomePaise > 0 ? Math.round((data.totalSpentPaise / data.incomePaise) * 100) : null;
  const barColor = used > 1 ? colors.coral : used >= 0.8 ? colors.amber : colors.accent;

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: colors.atmosphere.card, borderColor: colors.atmosphere.cardBorder },
      ]}
    >
      <View style={styles.summaryTop}>
        <View style={styles.flex}>
          <Amount
            paise={data.totalSpentPaise}
            variant="title"
            animated
            fit
            style={[styles.summaryAmount, colors.atmosphere.heroAmount]}
          />
          <AppText color="muted">
            {data.inProgress ? 'spent this cycle' : `spent in ${data.label}`}
          </AppText>
          {ofIncome !== null ? (
            <AppText variant="caption" color="muted" tabular>
              {ofIncome}% of {formatINRWhole(data.incomePaise)} income
            </AppText>
          ) : null}
        </View>
        <View style={[styles.vDivider, { backgroundColor: colors.border }]} />
        <View style={styles.remaining}>
          <View style={[styles.iconTile, { backgroundColor: withAlpha(colors.accent, 0.14) }]}>
            <Icon name="speedometer-outline" size={ICON.md} tint={colors.accent} />
          </View>
          <View style={styles.shrink}>
            <Amount paise={data.remainingPaise} variant="bodyStrong" animated fit />
            <AppText variant="caption" color="muted" numberOfLines={1}>
              {data.inProgress ? 'remaining' : 'left unspent'}
            </AppText>
          </View>
        </View>
      </View>
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
    </View>
  );
});

const BreakdownCard = memo(function BreakdownCard({ data }: { data: InsightsData }) {
  const { colors } = useTheme();
  const { width, fontScale } = useWindowDimensions();
  const inner = width - TAB_GUTTER * 2 - CARD_PAD * 2;
  // Side by side on most phones; stacked on narrow screens or with large system text.
  const stacked = inner < 300 || fontScale > 1.3;
  const donutSize = stacked ? 150 : Math.round(Math.min(132, inner * 0.38));
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
      <View style={[styles.breakdown, stacked && styles.breakdownStacked]}>
        <DonutChart
          slices={slices}
          totalPaise={data.categoryTotalPaise}
          size={donutSize}
          stroke={Math.round(donutSize * 0.12)}
          centerLabel="Total spent"
        />
        <View style={[styles.flex, stacked && styles.fullWidth]}>
          <AppText variant="bodyStrong" accessibilityRole="header" style={styles.breakdownTitle}>
            Where your money went
          </AppText>
          {data.breakdown.map((r) => (
            <View
              key={r.key}
              style={styles.legendRow}
              accessible
              accessibilityLabel={`${r.category ? CATEGORIES[r.category].label : 'Others'}: ${formatINRWhole(r.totalPaise)}, ${r.pct} percent`}
            >
              <View style={[styles.dot, { backgroundColor: sliceColor(r) }]} />
              <AppText
                variant="caption"
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.8}
                style={styles.flex}
              >
                {r.label}
              </AppText>
              <AppText variant="caption" color="muted" tabular style={styles.legendPct}>
                {r.pct}%
              </AppText>
              <AppText
                variant="caption"
                tabular
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.7}
                style={styles.legendAmount}
              >
                {formatINRWhole(r.totalPaise)}
              </AppText>
            </View>
          ))}
        </View>
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
            <Icon name="trophy-outline" size={ICON.sm} tint={colors.amber} />
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

  header: { gap: SPACE.xs, marginBottom: SPACE.sm },
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
    borderRadius: RADIUS.md,
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

  content: { gap: SPACE.md },
  safeWrap: { marginBottom: SPACE.md },
  safeRow: { flexDirection: 'row', alignItems: 'center', gap: SPACE.md },
  safeCell: { flex: 1, gap: 2 },
  card: { borderRadius: RADIUS.lg, borderWidth: 1, padding: CARD_PAD, gap: SPACE.md },

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
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm, minHeight: 26 },
  dot: { width: 8, height: 8, borderRadius: RADIUS.pill },
  legendPct: { minWidth: 34, textAlign: 'right' },
  legendAmount: { minWidth: 58, textAlign: 'right' },

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
