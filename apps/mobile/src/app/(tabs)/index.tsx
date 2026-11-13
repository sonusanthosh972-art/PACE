import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { RefreshControl, StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, LinearTransition } from 'react-native-reanimated';

import { Amount } from '@/components/Amount';
import { AppHeader, HeaderBackground, TAB_GUTTER } from '@/components/AppHeader';
import { AppText } from '@/components/AppText';
import { BudgetRing } from '@/components/BudgetRing';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Icon, type IconName } from '@/components/Icon';
import { PaceLoader } from '@/components/PaceLoader';
import { PressableScale } from '@/components/PressableScale';
import { Reveal } from '@/components/Reveal';
import { Screen } from '@/components/Screen';
import { EmptyState, ErrorState, LoadingState } from '@/components/States';
import { TransactionRow } from '@/components/TransactionRow';
import { cycleLeft, type BudgetSnapshot } from '@/domain/budget';
import { CATEGORIES } from '@/domain/categories';
import { categoryTiles } from '@/domain/insights';
import { displayMerchant } from '@/domain/merchant';
import { formatINRWhole } from '@/domain/money';
import { getGreetingTitle } from '@/domain/timeOfDay';
import type { Transaction } from '@/domain/transaction';
import { formatShortDate } from '@/lib/format';
import { ringTone, statusCopy, yesterdayLine, type RingTone } from '@/lib/today';
import { useTimeOfDay } from '@/lib/useTimeOfDay';
import { refreshFromDevice } from '@/services/bootstrap';
import { useAuthStore } from '@/state/authStore';
import { useImportStatus } from '@/state/importStatus';
import { invalidateAll, useProfile, useSettings, useToday, type TodayData } from '@/state/queries';
import { useTheme } from '@/theme/ThemeProvider';
import { ICON, MOTION, RADIUS, SPACE, withAlpha } from '@/theme/tokens';

const CARD_PAD = SPACE.lg;

export default function TodayScreen() {
  const today = useToday();
  const client = useQueryClient();
  const importing = useImportStatus((s) => s.importing);
  const demoMode = useSettings().data?.demoMode ?? false;
  const userName = useAuthStore((s) => s.user?.name);
  const [refreshing, setRefreshing] = useState(false);
  const timeOfDay = useTimeOfDay();

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await refreshFromDevice();
    } finally {
      await invalidateAll(client);
      setRefreshing(false);
    }
  };

  return (
    <Screen
      background={<HeaderBackground />}
      backgroundScrolls
      gutter={TAB_GUTTER}
      footerDivider={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      footer={
        today.data ? (
          <Button
            label="Add cash spend"
            icon="add"
            pill
            onPress={() => router.push('/add')}
            accessibilityHint="Opens a quick form to record a cash payment"
          />
        ) : undefined
      }
    >
      <AppHeader
        page="index"
        title={`${getGreetingTitle(timeOfDay, userName)} 👋`}
        hint="See what's safe to spend today, and add cash in one tap."
      />
      {today.isPending ? (
        <LoadingState label="Loading today's budget" />
      ) : today.isError ? (
        <ErrorState onRetry={() => today.refetch()} />
      ) : !today.data ? (
        <EmptyState
          icon="wallet-outline"
          title="Set up your budget"
          body="Tell us your salary and fixed costs to get a daily budget."
          actionLabel="Start"
          onAction={() => router.replace('/onboarding')}
        />
      ) : (
        <TodayContent data={today.data} importing={importing} demoMode={demoMode} />
      )}
    </Screen>
  );
}

/* ---------------------------------------------------------------- content */

function TodayContent({
  data,
  importing,
  demoMode,
}: {
  data: TodayData;
  importing: boolean;
  demoMode: boolean;
}) {
  const { snapshot, transactions, streak } = data;
  const tone = ringTone(snapshot.usedRatio);
  const status = statusCopy({
    tone,
    usedRatio: snapshot.usedRatio,
    budgetPaise: snapshot.todayBudgetPaise,
    streak,
    yesterday: yesterdayLine(data.yesterday),
  });

  return (
    <>
      <Reveal order={0}>
        <HeroCard snapshot={snapshot} tone={tone} />
      </Reveal>
      <Reveal order={1}>
        <StatusCard tone={tone} title={status.title} body={status.body} />
      </Reveal>
      {demoMode ? <SampleDataBanner /> : null}
      {importing ? (
        <Card accessibilityLabel="Reading your bank SMS. This takes a few seconds.">
          <PaceLoader size="sm" />
          <AppText variant="bodyStrong">Reading your bank SMS…</AppText>
          <AppText color="muted">
            Importing the last 90 days from bank senders only. This takes a few seconds.
          </AppText>
        </Card>
      ) : null}
      <Reveal order={2}>
        <TodaySpending transactions={transactions} spentPaise={snapshot.spentTodayPaise} />
      </Reveal>
      <Reveal order={3}>
        <MonthGlance snapshot={snapshot} />
      </Reveal>
    </>
  );
}

function HeroCard({ snapshot, tone }: { snapshot: BudgetSnapshot; tone: RingTone }) {
  const { colors } = useTheme();
  const { width, fontScale } = useWindowDimensions();
  const income = useProfile().data?.monthlySalaryPaise ?? null;
  const remaining = snapshot.remainingTodayPaise;
  const over = remaining < 0;
  const fraction =
    snapshot.todayBudgetPaise > 0 ? Math.max(0, remaining) / snapshot.todayBudgetPaise : 0;

  // Side by side on most phones; stacked on narrow screens or with large system text.
  const inner = width - TAB_GUTTER * 2 - CARD_PAD * 2;
  const stacked = inner < 290 || fontScale > 1.3;
  const ringSize = stacked
    ? Math.min(220, inner)
    : Math.round(Math.min(184, Math.max(140, inner * 0.52)));

  return (
    <View
      style={[
        styles.heroCard,
        stacked && styles.heroCardStacked,
        { backgroundColor: colors.atmosphere.card, borderColor: colors.atmosphere.cardBorder },
      ]}
    >
      <BudgetRing
        remainingFraction={fraction}
        tone={tone}
        size={ringSize}
        strokeWidth={Math.round(ringSize * 0.075)}
        accessibilityLabel={
          over
            ? `Over today's budget by ${formatINRWhole(-remaining)}. Budget ${formatINRWhole(snapshot.todayBudgetPaise)}.`
            : `${formatINRWhole(remaining)} safe to spend today, of ${formatINRWhole(snapshot.todayBudgetPaise)}.`
        }
      >
        {/* Near the top of the circle the space between the ring's sides is narrower. */}
        <AppText
          variant="caption"
          color={over ? 'coralText' : 'muted'}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.6}
          style={{ maxWidth: ringSize * 0.56 }}
        >
          {over ? 'Over today by' : 'Safe to spend today'}
        </AppText>
        <Amount
          paise={Math.abs(remaining)}
          variant="hero"
          color={over ? 'coralText' : tone === 'warn' ? 'amberText' : 'text'}
          animated
          fit
          style={colors.atmosphere.heroAmount}
        />
        <AppText
          variant="caption"
          color="muted"
          tabular
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.7}
          style={{ maxWidth: ringSize * 0.56 }}
        >
          of {formatINRWhole(snapshot.todayBudgetPaise)}
        </AppText>
      </BudgetRing>

      {stacked ? null : <View style={[styles.heroDivider, { backgroundColor: colors.border }]} />}

      <View style={[styles.heroStats, stacked && styles.heroStatsStacked]}>
        <HeroStat
          icon="calendar-outline"
          value={`${snapshot.daysLeft} ${snapshot.daysLeft === 1 ? 'day' : 'days'}`}
          label="until next payday"
        />
        {income !== null ? (
          <HeroStat icon="wallet-outline" value={formatINRWhole(income)} label="monthly income" />
        ) : null}
        <HeroStat icon="time-outline" paise={snapshot.spentTodayPaise} label="spent today" />
      </View>
    </View>
  );
}

function HeroStat({
  icon,
  label,
  value,
  paise,
}: {
  icon: IconName;
  label: string;
  value?: string;
  paise?: number;
}) {
  return (
    <View
      style={styles.heroStat}
      accessible
      accessibilityLabel={`${value ?? formatINRWhole(paise ?? 0)} ${label}`}
    >
      <Icon name={icon} size={ICON.lg} color="accentText" />
      <View style={styles.flex}>
        {paise !== undefined ? (
          <Amount paise={paise} variant="bodyStrong" animated fit />
        ) : (
          <AppText
            variant="bodyStrong"
            tabular
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.7}
          >
            {value}
          </AppText>
        )}
        <AppText
          variant="caption"
          color="muted"
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.8}
        >
          {label}
        </AppText>
      </View>
    </View>
  );
}

function StatusCard({ tone, title, body }: { tone: RingTone; title: string; body: string }) {
  const { colors } = useTheme();
  const hue = tone === 'over' ? colors.coral : tone === 'warn' ? colors.amber : colors.accent;
  const icon: IconName =
    tone === 'over' ? 'sunny-outline' : tone === 'warn' ? 'time-outline' : 'leaf-outline';
  return (
    <PressableScale
      onPress={() => router.push('/insights')}
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${body}`}
      accessibilityHint="Opens your money story"
      style={[
        styles.status,
        {
          backgroundColor: withAlpha(hue, colors.softTint),
          borderColor: withAlpha(hue, colors.softTint * 2.5),
        },
      ]}
    >
      <View style={[styles.statusIcon, { backgroundColor: withAlpha(hue, colors.softTint * 2) }]}>
        <Icon name={icon} size={ICON.md} tint={hue} />
      </View>
      <View style={styles.flex} accessibilityLiveRegion="polite">
        <AppText variant="bodyStrong">{title}</AppText>
        <AppText variant="caption" color="muted">
          {body}
        </AppText>
      </View>
      <Icon name="chevron-forward" size={ICON.md} color="muted" />
    </PressableScale>
  );
}

function SampleDataBanner() {
  return (
    <Card
      onPress={() => router.push('/settings/exit-sample')}
      accessibilityLabel="You are looking at sample data. Opens the option to switch to your real bank SMS."
    >
      <View style={styles.row}>
        <Icon name="flask-outline" color="amberText" />
        <View style={styles.flex}>
          <AppText variant="bodyStrong">You&apos;re viewing sample data</AppText>
          <AppText color="muted">Tap to switch to your real bank SMS.</AppText>
        </View>
      </View>
    </Card>
  );
}

/* ---------------------------------------------------------------- today's spending */

function TodaySpending({
  transactions,
  spentPaise,
}: {
  transactions: Transaction[];
  spentPaise: number;
}) {
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const tiles = categoryTiles(
    transactions.map((t) => ({ ...t, merchantDisplay: displayMerchant(t.merchant, t.vpa) })),
  );
  // Five tiles always share the row exactly; labels shrink a little on very narrow phones.
  const tileWidth = Math.floor((width - TAB_GUTTER * 2 - SPACE.sm * 4) / 5);
  const tileStyle = [
    styles.tile,
    { width: tileWidth, backgroundColor: colors.surface, borderColor: colors.border },
  ];

  return (
    <View style={styles.section}>
      <View style={styles.sectionHead}>
        <AppText variant="heading" accessibilityRole="header">
          Today&apos;s spending
        </AppText>
        <Amount paise={spentPaise} variant="heading" animated />
      </View>
      <View style={styles.tiles}>
        {tiles.map((t) => (
          <PressableScale
            key={t.category}
            onPress={() =>
              router.push({
                pathname: '/transactions',
                params: { category: t.category, at: String(Date.now()) },
              })
            }
            accessibilityRole="button"
            accessibilityLabel={`${CATEGORIES[t.category].label}: ${formatINRWhole(t.totalPaise)} today`}
            style={tileStyle}
          >
            <Icon
              name={CATEGORIES[t.category].icon as IconName}
              size={ICON.lg}
              tint={colors.categories[t.category]}
            />
            <AppText
              variant="caption"
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.7}
            >
              {CATEGORIES[t.category].shortLabel}
            </AppText>
            <AppText
              variant="caption"
              color="muted"
              tabular
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.7}
            >
              {formatINRWhole(t.totalPaise)}
            </AppText>
          </PressableScale>
        ))}
        <PressableScale
          onPress={() => router.push('/transactions')}
          accessibilityRole="button"
          accessibilityLabel="All categories and payments"
          style={tileStyle}
        >
          <Icon name="ellipsis-horizontal" size={ICON.lg} color="text" />
          <AppText variant="caption">More</AppText>
        </PressableScale>
      </View>
      <TodayList transactions={transactions} />
    </View>
  );
}

/** Today's payments; new ones slide in at the top, rows already on screen do not animate. */
function TodayList({ transactions }: { transactions: Transaction[] }) {
  const { reducedMotion } = useTheme();
  const [initialIds] = useState(() => new Set(transactions.map((t) => t.id)));
  if (transactions.length === 0) return null;

  return (
    <View style={styles.list}>
      {transactions.map((tx) => (
        <Animated.View
          key={tx.id}
          entering={
            initialIds.has(tx.id)
              ? undefined
              : reducedMotion
                ? FadeIn.duration(MOTION.fadeMs)
                : FadeInDown.duration(MOTION.screenMs)
          }
          layout={reducedMotion ? undefined : LinearTransition.duration(MOTION.fadeMs)}
        >
          <TransactionRow tx={tx} onPress={() => router.push(`/transaction/${tx.id}`)} />
        </Animated.View>
      ))}
    </View>
  );
}

/* ---------------------------------------------------------------- this cycle */

function MonthGlance({ snapshot }: { snapshot: BudgetSnapshot }) {
  const { colors } = useTheme();
  const left = cycleLeft(snapshot);
  const usedRatio = left.poolPaise > 0 ? left.spentPaise / left.poolPaise : 0;
  const usedPct = Math.round(usedRatio * 100);

  return (
    <View style={styles.section}>
      <View style={styles.sectionHead}>
        <AppText variant="heading" accessibilityRole="header" style={styles.shrink}>
          This month at a glance
        </AppText>
        <AppText variant="caption" color="muted" numberOfLines={1}>
          {formatShortDate(snapshot.cycle.start)} – {formatShortDate(snapshot.cycle.end)}
        </AppText>
      </View>
      <View
        style={[styles.glance, { backgroundColor: colors.surface, borderColor: colors.border }]}
      >
        <View
          style={styles.glanceCell}
          accessible
          accessibilityLabel={`${formatINRWhole(left.spentPaise)} spent this cycle`}
        >
          <Amount paise={left.spentPaise} variant="bodyStrong" animated fit />
          <AppText variant="caption" color="muted" numberOfLines={1}>
            Spent
          </AppText>
        </View>
        <View style={[styles.glanceDivider, { backgroundColor: colors.border }]} />
        <View
          style={styles.glanceCell}
          accessible
          accessibilityLabel={`${formatINRWhole(left.poolPaise)} spending budget this cycle`}
        >
          <Amount paise={left.poolPaise} variant="bodyStrong" fit />
          <AppText variant="caption" color="muted" numberOfLines={1}>
            Budget
          </AppText>
        </View>
        <View style={[styles.glanceDivider, { backgroundColor: colors.border }]} />
        <View style={[styles.glanceCell, styles.glanceUsed]}>
          <BudgetRing
            remainingFraction={Math.min(1, usedRatio)}
            tone={ringTone(usedRatio)}
            size={40}
            strokeWidth={4}
            accessibilityLabel={`${usedPct} percent of this cycle's budget used`}
          >
            <Icon name="stats-chart" size={ICON.sm} color="accentText" />
          </BudgetRing>
          <View style={styles.shrink}>
            <AppText variant="bodyStrong" tabular numberOfLines={1}>
              {usedPct}%
            </AppText>
            <AppText variant="caption" color="muted" numberOfLines={1}>
              used
            </AppText>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  shrink: { flexShrink: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: SPACE.md },
  heroCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: CARD_PAD,
    gap: SPACE.lg,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
  },
  heroCardStacked: { flexDirection: 'column' },
  heroDivider: { width: StyleSheet.hairlineWidth, alignSelf: 'stretch' },
  heroStats: { flex: 1, gap: SPACE.lg },
  heroStatsStacked: { alignSelf: 'stretch', flex: 0 },
  heroStat: { flexDirection: 'row', alignItems: 'center', gap: SPACE.md },

  status: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.md,
    padding: SPACE.lg,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
  },
  statusIcon: {
    width: 40,
    height: 40,
    borderRadius: RADIUS.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },

  section: { gap: SPACE.md, marginTop: SPACE.xs },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: SPACE.md,
  },
  tiles: { flexDirection: 'row', gap: SPACE.sm },
  tile: {
    minHeight: 92,
    paddingVertical: SPACE.md,
    paddingHorizontal: SPACE.xs / 2,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACE.xs,
  },
  list: { gap: SPACE.sm },

  glance: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACE.lg,
    paddingHorizontal: SPACE.sm,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
  },
  glanceCell: { flex: 1, paddingHorizontal: SPACE.sm, gap: SPACE.xs / 2 },
  glanceUsed: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm, flex: 1.2 },
  glanceDivider: { width: StyleSheet.hairlineWidth, alignSelf: 'stretch' },
});
