import { queryOptions, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';

import { getAppDb } from '@/data/appDb';
import { dayResults, getSnapshot, getStreak } from '@/data/budgetRepo';
import { getProfile } from '@/data/profileRepo';
import { getSettings } from '@/data/settingsRepo';
import {
  countReviewQueue,
  getById,
  listReviewQueue,
  listTransactions,
  type TxFilter,
} from '@/data/transactionsRepo';
import {
  budgetStartInCycle,
  cycleFor,
  daysLeftInCycle,
  poolForCycle,
  rollingAllowance,
  totalSpend,
  type BudgetSnapshot,
} from '@/domain/budget';
import { dailySpend, totalsByCategory, type InsightTx } from '@/domain/insights';
import { displayMerchant } from '@/domain/merchant';
import {
  biggestDay,
  breakdown,
  buildPatterns,
  cycleLabel,
  quietWin,
  type BiggestDay,
  type BreakdownRow,
  type Pattern,
  type PatternInput,
  type QuietWin,
} from '@/domain/story';
import { addDays, diffDays, startOfDayMs, toDateKey, type DateKey } from '@/domain/time';
import type { Transaction } from '@/domain/transaction';

export const KEYS = {
  settings: ['settings'] as const,
  profile: ['profile'] as const,
  today: ['today'] as const,
  transactions: (f: TxFilter) => ['transactions', f] as const,
  insights: ['insights'] as const,
  tx: (id: string) => ['tx', id] as const,
  review: ['review'] as const,
  reviewCount: ['reviewCount'] as const,
};

export function useSettings() {
  return useQuery({
    queryKey: KEYS.settings,
    queryFn: async () => getSettings(await getAppDb()),
    staleTime: 60_000,
  });
}

export function useProfile() {
  return useQuery({
    queryKey: KEYS.profile,
    queryFn: async () => getProfile(await getAppDb()),
    staleTime: 60_000,
  });
}

export interface TodayData {
  snapshot: BudgetSnapshot;
  streak: number;
  transactions: Transaction[];
  yesterday: { budgetPaise: number; spentPaise: number } | null;
  today: DateKey;
}

export function useToday() {
  return useQuery({
    queryKey: KEYS.today,
    queryFn: async (): Promise<TodayData | null> => {
      const db = await getAppDb();
      const profile = await getProfile(db);
      if (!profile) return null;
      const now = Date.now();
      const today = toDateKey(now);
      const yesterdayKey = addDays(today, -1);
      const [snapshot, streak, transactions, yesterdayRows] = await Promise.all([
        getSnapshot(db, profile, now),
        getStreak(db, now),
        listTransactions(db, {
          from: startOfDayMs(today),
          to: startOfDayMs(addDays(today, 1)),
          limit: 200,
        }),
        dayResults(db, yesterdayKey, today),
      ]);
      const y = yesterdayRows[0];
      const yesterday = y ? { budgetPaise: y.budgetPaise, spentPaise: y.spentPaise } : null;
      return { snapshot, streak, transactions, yesterday, today };
    },
  });
}

/** The Transactions tab's opening filter (this pay cycle), shared with the background prefetch. */
export function defaultTxFilter(today: DateKey, payday: number | null): TxFilter {
  const f: TxFilter = { limit: 2000 };
  if (payday !== null) f.from = startOfDayMs(cycleFor(today, payday).start);
  return f;
}

export function useTransactions(filter: TxFilter) {
  return useQuery({
    queryKey: KEYS.transactions(filter),
    queryFn: async () => listTransactions(await getAppDb(), filter),
  });
}

export interface InsightsData {
  cycleStart: DateKey;
  cycleEnd: DateKey;
  /** "Nov 2026". */
  label: string;
  /** False for a cycle that has finished. */
  inProgress: boolean;
  /** Spend − refunds this cycle: the same number the home screen counts. */
  totalSpentPaise: number;
  /** The cycle's spending money (income − fixed costs − savings, prorated when set up part-way). */
  poolPaise: number;
  remainingPaise: number;
  incomePaise: number;
  /** Spend over the same number of days in the previous cycle (already used by the patterns). */
  previousSpentPaise: number;
  /** Spend per day from the cycle start to the last day shown, for the small trend line. */
  dailySpentPaise: number[];
  breakdown: BreakdownRow[];
  /** Σ spend by category before refunds: the base for the breakdown percentages. */
  categoryTotalPaise: number;
  patterns: Pattern[];
  biggestDay: BiggestDay | null;
  quietWin: QuietWin | null;
  hasData: boolean;
}

export function toInsightTx(t: Transaction): InsightTx {
  return { ...t, merchantDisplay: displayMerchant(t.merchant, t.vpa) };
}

/** Cycles the month selector offers, newest first: this one and the five before it. */
export const INSIGHT_CYCLES = 6;

/** The cycle `offset` cycles before the current one (0 = current). */
export function cycleAtOffset(today: DateKey, payday: number, offset: number) {
  let cycle = cycleFor(today, payday);
  for (let i = 0; i < offset; i++) cycle = cycleFor(addDays(cycle.start, -1), payday);
  return cycle;
}

/** Shared by useInsights and the background prefetch, so both use the same cache entry. */
export function insightsQuery(offset = 0) {
  return queryOptions({
    queryKey: [...KEYS.insights, offset],
    staleTime: offset > 0 ? 5 * 60_000 : 30_000,
    queryFn: async (): Promise<InsightsData | null> => {
      const db = await getAppDb();
      const profile = await getProfile(db);
      if (!profile) return null;
      const today = toDateKey(Date.now());
      const cycle = cycleAtOffset(today, profile.payday, offset);
      const inProgress = offset === 0;
      const last = inProgress ? today : cycle.end;
      const previous = cycleFor(addDays(cycle.start, -1), profile.payday);

      const all = (
        await listTransactions(db, {
          from: startOfDayMs(previous.start),
          to: startOfDayMs(addDays(last, 1)),
          limit: 5_000,
        })
      ).map(toInsightTx);
      const cycleFrom = startOfDayMs(cycle.start);
      const txs = all.filter((t) => t.occurredAt >= cycleFrom);

      // The previous cycle over the same number of days, so a cycle in progress is compared fairly.
      const elapsed = diffDays(cycle.start, last);
      const prevLast =
        addDays(previous.start, elapsed) < previous.end
          ? addDays(previous.start, elapsed)
          : previous.end;
      const prevTxs = all.filter(
        (t) => t.occurredAt < cycleFrom && t.occurredAt < startOfDayMs(addDays(prevLast, 1)),
      );

      const perDay = dailySpend(txs);
      const budgets = await db.getAllAsync<{ date: string; budget_paise: number }>(
        'SELECT date, budget_paise FROM daily_budgets WHERE date >= ? AND date <= ?',
        [cycle.start, last],
      );
      const budgetByDay = new Map(budgets.map((b) => [b.date, b.budget_paise]));
      // Days without a stored budget get the carry-forward allowance they would have had, from
      // the day budgeting began: the cycle's money left before the day ÷ the days left.
      const poolPaise = poolForCycle(profile, cycle);
      const budgetFrom = budgetStartInCycle(cycle, profile.startDate);
      const days: PatternInput['days'][number][] = [];
      let spentBefore = 0;
      for (let d = cycle.start; d <= last; d = addDays(d, 1)) {
        const spentPaise = perDay.get(d) ?? 0;
        const budgeted = d >= budgetFrom;
        days.push({
          date: d,
          spentPaise,
          budgetPaise:
            budgetByDay.get(d) ??
            (budgeted ? rollingAllowance(poolPaise, spentBefore, daysLeftInCycle(d, cycle)) : null),
        });
        if (budgeted) spentBefore += spentPaise;
      }
      const lastFinishedDay = inProgress ? addDays(today, -1) : cycle.end;
      const daysWithin = days.filter(
        (d) =>
          d.date <= lastFinishedDay &&
          d.budgetPaise !== null &&
          d.budgetPaise > 0 &&
          d.spentPaise <= d.budgetPaise,
      ).length;

      const byCategory = totalsByCategory(txs);
      const totalSpentPaise = totalSpend(txs);
      return {
        cycleStart: cycle.start,
        cycleEnd: cycle.end,
        label: cycleLabel(cycle.start),
        inProgress,
        totalSpentPaise,
        poolPaise,
        remainingPaise: Math.max(0, poolPaise - totalSpentPaise),
        incomePaise: profile.monthlySalaryPaise,
        previousSpentPaise: totalSpend(prevTxs),
        dailySpentPaise: days.map((d) => d.spentPaise),
        breakdown: breakdown(byCategory),
        categoryTotalPaise: byCategory.reduce((s, c) => s + c.totalPaise, 0),
        patterns: buildPatterns({
          byCategory,
          totalSpentPaise,
          days,
          lastFinishedDay,
          previousPaise: totalSpend(prevTxs),
          previousStart: previous.start,
          inProgress,
        }),
        biggestDay: biggestDay(txs),
        quietWin: quietWin({
          current: byCategory,
          previous: totalsByCategory(prevTxs),
          daysWithin,
        }),
        hasData: byCategory.length > 0,
      };
    },
  });
}

export function useInsights(offset = 0) {
  return useQuery(insightsQuery(offset));
}

/** How many payments still need a category (shown on the home screen). */
export function useReviewCount() {
  return useQuery({
    queryKey: KEYS.reviewCount,
    queryFn: async () => countReviewQueue(await getAppDb()),
  });
}

/** The review list shows this many at a time; the next ones appear as these are tagged. */
export const REVIEW_PAGE = 100;

export function useReviewQueue() {
  return useQuery({
    queryKey: KEYS.review,
    queryFn: async () => {
      const db = await getAppDb();
      const [items, total] = await Promise.all([
        listReviewQueue(db, REVIEW_PAGE),
        countReviewQueue(db),
      ]);
      return { items, total };
    },
  });
}

export function useTransaction(id: string) {
  return useQuery({
    queryKey: KEYS.tx(id),
    queryFn: async () => getById(await getAppDb(), id),
  });
}

/** Everything is derived from SQLite, so any write simply invalidates all queries. */
export function invalidateAll(client: QueryClient): Promise<void> {
  return client.invalidateQueries();
}

export function useInvalidateAll() {
  const client = useQueryClient();
  return useCallback(() => invalidateAll(client), [client]);
}

/**
 * Loads the Insights and Transactions data in the background once the app has settled, so the
 * first visit to those tabs shows content at once instead of a loader swapping to a full page in
 * the middle of the tab animation. Already-fresh data is not fetched again.
 */
export async function prefetchTabData(client: QueryClient): Promise<void> {
  const profile = await client.fetchQuery({
    queryKey: KEYS.profile,
    queryFn: async () => getProfile(await getAppDb()),
    staleTime: 60_000,
  });
  if (!profile) return;
  await Promise.all([
    client.prefetchQuery(insightsQuery(0)),
    client.prefetchQuery({
      queryKey: KEYS.transactions(defaultTxFilter(toDateKey(Date.now()), profile.payday)),
      queryFn: async () =>
        listTransactions(await getAppDb(), defaultTxFilter(toDateKey(Date.now()), profile.payday)),
    }),
  ]);
}
