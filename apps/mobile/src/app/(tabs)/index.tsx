import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { RefreshControl, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, LinearTransition } from 'react-native-reanimated';

import { AppLogo } from '@/components/AppLogo';
import { Amount } from '@/components/Amount';
import { AppText } from '@/components/AppText';
import { BudgetRing } from '@/components/BudgetRing';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Icon } from '@/components/Icon';
import { Screen } from '@/components/Screen';
import { EmptyState, ErrorState, LoadingState } from '@/components/States';
import { TransactionRow } from '@/components/TransactionRow';
import { formatINRWhole } from '@/domain/money';
import type { Transaction } from '@/domain/transaction';
import { formatDayLabel } from '@/lib/format';
import { ringTone, yesterdayLine, type RingTone } from '@/lib/today';
import { refreshFromDevice } from '@/services/bootstrap';
import { useImportStatus } from '@/state/importStatus';
import { invalidateAll, useSettings, useToday, type TodayData } from '@/state/queries';
import { useTheme } from '@/theme/ThemeProvider';
import { RADIUS, SPACE } from '@/theme/tokens';

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

export default function TodayScreen() {
  const today = useToday();
  const client = useQueryClient();
  const importing = useImportStatus((s) => s.importing);
  const demoMode = useSettings().data?.demoMode ?? false;
  const [refreshing, setRefreshing] = useState(false);

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
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      footer={
        today.data ? (
          <Button
            label="Add cash spend"
            icon="add"
            onPress={() => router.push('/add')}
            accessibilityHint="Opens a quick form to record a cash payment"
          />
        ) : undefined
      }
    >
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
        <>
          {demoMode ? <SampleDataBanner /> : null}
          <TodayContent data={today.data} importing={importing} />
        </>
      )}
    </Screen>
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

function TodayContent({ data, importing }: { data: TodayData; importing: boolean }) {
  const { snapshot, transactions, streak } = data;
  const tone = ringTone(snapshot.usedRatio);
  const remaining = snapshot.remainingTodayPaise;
  const over = remaining < 0;
  const fraction =
    snapshot.todayBudgetPaise > 0 ? Math.max(0, remaining) / snapshot.todayBudgetPaise : 0;
  const needsReview = transactions.filter((t) => t.needsReview).length;
  const yesterday = yesterdayLine(data.yesterday);

  const greeting = getGreeting();

  return (
    <>
      <View style={styles.header}>
        <View style={styles.headerTitleWrap}>
          <View style={styles.logoRow}>
            <AppLogo size={28} variant="mark" animated />
            <AppText variant="caption" color="muted">
              {greeting} · {formatDayLabel(data.today, data.today)}
            </AppText>
          </View>
          <AppText variant="title" accessibilityRole="header">
            Today
          </AppText>
          <AppText variant="caption" color="muted">
            {snapshot.daysLeft} {snapshot.daysLeft === 1 ? 'day' : 'days'} left until next payday
          </AppText>
        </View>
        {streak > 0 ? <StreakPill days={streak} /> : null}
      </View>

      <BudgetRing
        remainingFraction={fraction}
        tone={tone}
        accessibilityLabel={
          over
            ? `Over today's budget by ${formatINRWhole(-remaining)}. Budget ${formatINRWhole(snapshot.todayBudgetPaise)}.`
            : `${formatINRWhole(remaining)} left today of ${formatINRWhole(snapshot.todayBudgetPaise)}.`
        }
      >
        <AppText variant="caption" color={over ? 'coralText' : 'muted'}>
          {over ? 'Over today by' : 'Safe to spend today'}
        </AppText>
        <Amount
          paise={Math.abs(remaining)}
          variant="hero"
          color={over ? 'coralText' : tone === 'warn' ? 'amberText' : 'text'}
          animated
        />
        <AppText variant="caption" color="muted" tabular>
          of {formatINRWhole(snapshot.todayBudgetPaise)} daily allowance
        </AppText>
      </BudgetRing>

      <StatusLine tone={tone} usedRatio={snapshot.usedRatio} budget={snapshot.todayBudgetPaise} />

      <View style={styles.stats}>
        <Stat label="Spent today" paise={snapshot.spentTodayPaise} />
        <Stat
          label="Left until payday"
          paise={Math.max(
            0,
            snapshot.spendablePaise - snapshot.spentBeforeTodayPaise - snapshot.spentTodayPaise,
          )}
        />
      </View>

      {yesterday ? (
        <AppText color="muted" center>
          {yesterday}
        </AppText>
      ) : null}

      {importing ? (
        <Card>
          <AppText variant="bodyStrong">Reading your bank SMS…</AppText>
          <AppText color="muted">
            Importing the last 90 days from bank senders only. This takes a few seconds.
          </AppText>
        </Card>
      ) : null}

      {needsReview > 0 ? (
        <Card
          onPress={() => router.push('/(tabs)/transactions')}
          accessibilityLabel={`${needsReview} payments need a category. Opens transactions.`}
        >
          <View style={styles.row}>
            <Icon name="pricetag-outline" color="amberText" />
            <AppText variant="bodyStrong" style={styles.flex}>
              {needsReview} {needsReview === 1 ? 'payment needs' : 'payments need'} a category
            </AppText>
            <Icon name="chevron-forward" size={18} color="muted" />
          </View>
        </Card>
      ) : null}

      <AppText variant="heading" accessibilityRole="header">
        Today&apos;s spending
      </AppText>
      <TodayList transactions={transactions} />
    </>
  );
}

function StatusLine({
  tone,
  usedRatio,
  budget,
}: {
  tone: RingTone;
  usedRatio: number;
  budget: number;
}) {
  const text =
    budget === 0
      ? "This cycle's daily spendable pool is resting. Your essentials (rent, EMIs & savings) remain fully protected."
      : tone === 'over'
        ? "A little over today — and that's completely okay! Tomorrow gently recalibrates so you stay balanced."
        : tone === 'warn'
          ? `You've used ${Math.round(usedRatio * 100)}% of today's allowance. Gentle, mindful spending for tonight.`
          : 'You are right on track. Peaceful, calm, and steady.';
  return (
    <View style={styles.statusLine} accessibilityLiveRegion="polite">
      <Icon
        name={
          tone === 'over'
            ? 'alert-circle-outline'
            : tone === 'warn'
              ? 'time-outline'
              : 'leaf-outline'
        }
        size={18}
        color={tone === 'over' ? 'coralText' : tone === 'warn' ? 'amberText' : 'accentText'}
      />
      <AppText variant="caption" color="muted" style={styles.flex}>
        {text}
      </AppText>
    </View>
  );
}

function Stat({ label, paise }: { label: string; paise: number }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.stat, { backgroundColor: colors.surface }]}>
      <AppText variant="caption" color="muted">
        {label}
      </AppText>
      <Amount paise={paise} variant="heading" animated />
    </View>
  );
}

function StreakPill({ days }: { days: number }) {
  const { colors } = useTheme();
  return (
    <View
      style={[styles.pill, { backgroundColor: colors.surface, borderColor: colors.border }]}
      accessible
      accessibilityLabel={`${days} ${days === 1 ? 'day' : 'days'} in a row on budget`}
    >
      <Icon name="checkmark-circle" size={16} color="accentText" />
      <AppText variant="caption" tabular>
        {days}-day streak
      </AppText>
    </View>
  );
}

/** New transactions slide in at the top; rows already on screen at first render do not animate. */
function TodayList({ transactions }: { transactions: Transaction[] }) {
  const { reducedMotion } = useTheme();
  const [initialIds] = useState(() => new Set(transactions.map((t) => t.id)));

  if (transactions.length === 0) {
    return (
      <EmptyState
        icon="cafe-outline"
        title="Your day is peaceful and clear"
        body="No spending recorded yet today. Bank SMS and UPI payments will appear here automatically. Paid in cash? Tap the button below."
      />
    );
  }

  return (
    <View style={styles.list}>
      {transactions.map((tx) => {
        const isNew = !initialIds.has(tx.id);
        return (
          <Animated.View
            key={tx.id}
            entering={
              isNew ? (reducedMotion ? FadeIn.duration(200) : FadeInDown.duration(280)) : undefined
            }
            layout={reducedMotion ? undefined : LinearTransition.duration(220)}
          >
            <TransactionRow tx={tx} onPress={() => router.push(`/transaction/${tx.id}`)} />
          </Animated.View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  headerTitleWrap: { gap: 2 },
  logoRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 2 },
  stats: { flexDirection: 'row', gap: SPACE.md },
  stat: { flex: 1, padding: SPACE.lg, borderRadius: RADIUS.md, gap: 2 },
  statusLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.sm,
    justifyContent: 'center',
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: SPACE.md },
  flex: { flex: 1 },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: SPACE.md,
    paddingVertical: 6,
    borderRadius: RADIUS.pill,
    borderWidth: 1,
  },
  list: { gap: SPACE.sm },
});
