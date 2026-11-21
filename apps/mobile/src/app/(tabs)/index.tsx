import { useQueryClient } from '@tanstack/react-query';
import { router, type Href } from 'expo-router';
import { memo, useMemo, useState } from 'react';
import { RefreshControl, StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, LinearTransition } from 'react-native-reanimated';

import { Amount } from '@/components/Amount';
import { AppHeader, HeaderBackground, TAB_GUTTER } from '@/components/AppHeader';
import { AppText } from '@/components/AppText';
import { BudgetRing } from '@/components/BudgetRing';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Icon, type IconName } from '@/components/Icon';
import { InfoButton, type InfoTopic } from '@/components/InfoButton';
import { PaceLoader } from '@/components/PaceLoader';
import { PressableScale } from '@/components/PressableScale';
import { Reveal } from '@/components/Reveal';
import { Screen } from '@/components/Screen';
import { EmptyState, ErrorState, LoadingState } from '@/components/States';
import { TransactionRow } from '@/components/TransactionRow';
import { useAfterTransition } from '@/components/useAfterTransition';
import { getUpcomingBills } from '@/domain/afford';
import { cycleLeft, type BudgetSnapshot } from '@/domain/budget';
import { CATEGORIES } from '@/domain/categories';
import { categoryTiles } from '@/domain/insights';
import { displayMerchant } from '@/domain/merchant';
import { formatINRWhole } from '@/domain/money';
import { getGreetingTitle } from '@/domain/timeOfDay';
import type { DateKey } from '@/domain/time';
import type { Transaction } from '@/domain/transaction';
import { formatShortDate, ordinal } from '@/lib/format';
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
          <View style={styles.footerRow}>
            <View style={styles.footerCol}>
              <Button
                label="Add expense"
                icon="add"
                onPress={() => router.push('/add')}
                accessibilityHint="Opens a quick form to record a cash payment"
              />
            </View>
            <View style={styles.footerCol}>
              <Button
                label="Can I afford?"
                icon="calculator-outline"
                variant="secondary"
                onPress={() => router.push('/afford' as Href)}
                accessibilityHint="Opens the purchase affordability simulator"
              />
            </View>
          </View>
        ) : undefined
      }
    >
      <AppHeader
        page="index"
        title={`${getGreetingTitle(timeOfDay, userName)} 👋`}
        hint={
          today.data
            ? `${weekdayDate(today.data.today)} · Pay cycle ${formatShortDate(today.data.snapshot.cycle.start)} – ${formatShortDate(today.data.snapshot.cycle.end)}`
            : "Here's your money at a glance."
        }
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

const TodayContent = memo(function TodayContent({
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
  // Today's amount and status draw first; the sections below the fold are built a moment later,
  // so the number people open the app for appears as soon as possible.
  const settled = useAfterTransition(MOTION.screenMs);

  return (
    <>
      <Reveal order={0}>
        <HeroCard snapshot={snapshot} tone={tone} />
      </Reveal>
      <Reveal order={1}>
        <StatusCard tone={tone} title={status.title} body={status.body} />
      </Reveal>
      {settled ? (
        <Reveal order={2}>
          <UpcomingBills today={data.today} snapshot={snapshot} />
        </Reveal>
      ) : null}
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
      {settled ? (
        <>
          <Reveal order={3}>
            <TodaySpending transactions={transactions} spentPaise={snapshot.spentTodayPaise} />
          </Reveal>
          <Reveal order={4}>
            <MonthGlance snapshot={snapshot} />
          </Reveal>
        </>
      ) : null}
    </>
  );
});

const HeroCard = memo(function HeroCard({
  snapshot,
  tone,
}: {
  snapshot: BudgetSnapshot;
  tone: RingTone;
}) {
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const remaining = snapshot.remainingTodayPaise;
  const over = remaining < 0;
  const fraction =
    snapshot.todayBudgetPaise > 0 ? Math.max(0, remaining) / snapshot.todayBudgetPaise : 0;
  const left = cycleLeft(snapshot);

  const inner = width - TAB_GUTTER * 2 - CARD_PAD * 2;
  const ringSize = Math.round(Math.min(236, Math.max(180, inner * 0.68)));

  return (
    <View
      style={[styles.heroCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
    >
      {/* A 270° gauge is open at the bottom: pull the stats up into that empty space. */}
      <View style={{ marginBottom: -Math.round(ringSize * 0.16) }}>
        <BudgetRing
          remainingFraction={fraction}
          tone={tone}
          size={ringSize}
          sweep={270}
          strokeWidth={Math.round(ringSize * 0.06)}
          accessibilityLabel={
            over
              ? `Over today's budget by ${formatINRWhole(-remaining)}. Budget ${formatINRWhole(snapshot.todayBudgetPaise)}.`
              : `${formatINRWhole(remaining)} safe to spend today, of ${formatINRWhole(snapshot.todayBudgetPaise)}.`
          }
        >
          <AppText variant="caption" color={over ? 'coralText' : 'muted'} numberOfLines={1}>
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
          <AppText variant="caption" color="muted" tabular numberOfLines={1}>
            of {formatINRWhole(snapshot.todayBudgetPaise)} today
          </AppText>
        </BudgetRing>
      </View>
      {/* Outside the ring's accessibility group, so it stays a separate, tappable control. */}
      <View style={styles.ringInfo}>
        <InfoButton topic="safeToSpend" />
      </View>

      <View style={[styles.heroStats, { borderTopColor: colors.border }]}>
        <HeroStat label="Spent today" paise={snapshot.spentTodayPaise} />
        <View style={[styles.heroStatDivider, { backgroundColor: colors.border }]} />
        <HeroStat
          label={left.overPaise > 0 ? 'Over this month' : 'Left this month'}
          paise={left.overPaise > 0 ? left.overPaise : left.leftPaise}
          tone={left.overPaise > 0 ? 'coralText' : 'accentText'}
          info="leftThisMonth"
        />
        <View style={[styles.heroStatDivider, { backgroundColor: colors.border }]} />
        <HeroStat
          label="To payday"
          value={`${snapshot.daysLeft} ${snapshot.daysLeft === 1 ? 'day' : 'days'}`}
        />
      </View>
    </View>
  );
});

function HeroStat({
  label,
  value,
  paise,
  tone = 'text',
  info,
}: {
  label: string;
  value?: string;
  paise?: number;
  tone?: 'text' | 'accentText' | 'coralText';
  info?: InfoTopic;
}) {
  return (
    <View style={styles.heroStat}>
      <View style={styles.statLabelRow}>
        <AppText variant="caption" color="muted" numberOfLines={1}>
          {label}
        </AppText>
        {info ? <InfoButton topic={info} size={14} /> : null}
      </View>
      <View accessible accessibilityLabel={`${label}: ${value ?? formatINRWhole(paise ?? 0)}`}>
        {paise !== undefined ? (
          <Amount paise={paise} variant="heading" color={tone} animated fit />
        ) : (
          <AppText variant="heading" tabular numberOfLines={1}>
            {value}
          </AppText>
        )}
      </View>
    </View>
  );
}

/** Rent, EMIs and bills still due before payday (already set aside from the daily amount). */
const UpcomingBills = memo(function UpcomingBills({
  today,
  snapshot,
}: {
  today: DateKey;
  snapshot: BudgetSnapshot;
}) {
  const { colors } = useTheme();
  const profile = useProfile().data;
  const bills = useMemo(
    () => (profile ? getUpcomingBills(today, snapshot.cycle, profile.fixedExpenses) : null),
    [profile, today, snapshot.cycle],
  );
  if (!bills || bills.upcomingExpenses.length === 0) return null;
  const sorted = [...bills.upcomingExpenses].sort(
    (a, b) => dueOrder(a.dueDay, today) - dueOrder(b.dueDay, today),
  );

  return (
    <View style={styles.section}>
      <View style={styles.sectionHead}>
        <AppText variant="heading" accessibilityRole="header">
          Upcoming bills
        </AppText>
        <AppText variant="label" color="amberText" tabular>
          {formatINRWhole(bills.upcomingPaise)}
        </AppText>
      </View>
      <View style={[styles.bills, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        {sorted.slice(0, 4).map((f, i) => (
          <View
            key={f.id}
            style={[
              styles.billRow,
              i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
            ]}
            accessible
            accessibilityLabel={`${f.name}, ${formatINRWhole(f.amountPaise)}, due on the ${ordinal(f.dueDay)}`}
          >
            <View style={[styles.billIcon, { backgroundColor: withAlpha(colors.amber, 0.12) }]}>
              <Icon name="calendar-clear-outline" size={ICON.md} color="amberText" />
            </View>
            <View style={styles.flex}>
              <AppText variant="bodyStrong" numberOfLines={1}>
                {f.name}
              </AppText>
              <AppText variant="caption" color="muted">
                Due on the {ordinal(f.dueDay)} · set aside
              </AppText>
            </View>
            <AppText variant="bodyStrong" tabular>
              {formatINRWhole(f.amountPaise)}
            </AppText>
          </View>
        ))}
      </View>
    </View>
  );
});

/** Days from today until a monthly due day (for ordering bills soonest first). */
function dueOrder(dueDay: number, today: DateKey): number {
  const day = Number(today.slice(8, 10));
  return dueDay >= day ? dueDay - day : dueDay + 31 - day;
}

/** "Thu, 20 Nov" for a date key. */
function weekdayDate(key: DateKey): string {
  const [y, m, d] = key.split('-').map(Number) as [number, number, number];
  const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][
    new Date(Date.UTC(y, m - 1, d)).getUTCDay()
  ];
  return `${weekday}, ${formatShortDate(key)}`;
}

const StatusCard = memo(function StatusCard({
  tone,
  title,
  body,
}: {
  tone: RingTone;
  title: string;
  body: string;
}) {
  const { colors } = useTheme();
  const hue = tone === 'over' ? colors.coral : tone === 'warn' ? colors.amber : colors.accent;
  const icon: IconName =
    tone === 'over' ? 'alert-circle-outline' : tone === 'warn' ? 'time-outline' : 'checkmark';
  return (
    <PressableScale
      onPress={() => router.push('/insights')}
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${body}`}
      accessibilityHint="Opens your money story"
      style={[styles.status, { backgroundColor: colors.surface, borderColor: colors.border }]}
    >
      <View
        style={[styles.statusIcon, { borderColor: hue, backgroundColor: withAlpha(hue, 0.12) }]}
      >
        <Icon name={icon} size={ICON.md} tint={hue} />
      </View>
      <View style={styles.flex} accessibilityLiveRegion="polite">
        <View style={styles.titleWithInfo}>
          <AppText variant="bodyStrong">{title}</AppText>
          {tone === 'ok' ? <InfoButton topic="onTrack" /> : null}
        </View>
        <AppText variant="caption" color="muted">
          {body}
        </AppText>
      </View>
      <Icon name="chevron-forward" size={ICON.md} color="muted" />
    </PressableScale>
  );
});

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

const TodaySpending = memo(function TodaySpending({
  transactions,
  spentPaise,
}: {
  transactions: Transaction[];
  spentPaise: number;
}) {
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const tiles = useMemo(
    () =>
      categoryTiles(
        transactions.map((t) => ({ ...t, merchantDisplay: displayMerchant(t.merchant, t.vpa) })),
      ),
    [transactions],
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
});

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

const MonthGlance = memo(function MonthGlance({ snapshot }: { snapshot: BudgetSnapshot }) {
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
});

const styles = StyleSheet.create({
  flex: { flex: 1 },
  shrink: { flexShrink: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: SPACE.md },
  heroCard: {
    alignItems: 'center',
    paddingHorizontal: CARD_PAD,
    paddingTop: SPACE.xl,
    paddingBottom: SPACE.lg,
    gap: SPACE.md,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
  },
  ringLabel: { flexDirection: 'row', alignItems: 'center', gap: SPACE.xs },
  ringInfo: { position: 'absolute', top: SPACE.lg, right: SPACE.lg },
  heroStats: {
    flexDirection: 'row',
    alignSelf: 'stretch',
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: SPACE.lg,
    marginTop: SPACE.xs,
  },
  heroStat: { flex: 1, alignItems: 'center', gap: SPACE.xs, paddingHorizontal: SPACE.xs },
  statLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  heroStatDivider: { width: StyleSheet.hairlineWidth, alignSelf: 'stretch' },
  bills: {
    borderRadius: RADIUS.lg,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: SPACE.lg,
  },
  billRow: { flexDirection: 'row', alignItems: 'center', gap: SPACE.md, paddingVertical: SPACE.md },
  billIcon: {
    width: 40,
    height: 40,
    borderRadius: RADIUS.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleWithInfo: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm },

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
    borderWidth: 1.5,
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
  footerRow: {
    flexDirection: 'row',
    gap: SPACE.md,
    width: '100%',
  },
  footerCol: {
    flex: 1,
  },
});
