import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';

import { getAppDb } from '@/data/appDb';
import { dayResults, getSnapshot, getStreak } from '@/data/budgetRepo';
import { getProfile } from '@/data/profileRepo';
import { getSettings } from '@/data/settingsRepo';
import { getById, listTransactions, type TxFilter } from '@/data/transactionsRepo';
import { cycleFor, totalSpend, type BudgetSnapshot } from '@/domain/budget';
import {
  dailySpend,
  essentialSplit,
  smallLeaks,
  topMerchants,
  totalsByCategory,
  type InsightTx,
} from '@/domain/insights';
import { displayMerchant } from '@/domain/merchant';
import { addDays, startOfDayMs, toDateKey, type DateKey } from '@/domain/time';
import type { Transaction } from '@/domain/transaction';

export const KEYS = {
  settings: ['settings'] as const,
  profile: ['profile'] as const,
  today: ['today'] as const,
  transactions: (f: TxFilter) => ['transactions', f] as const,
  insights: ['insights'] as const,
  tx: (id: string) => ['tx', id] as const,
};

export function useSettings() {
  return useQuery({
    queryKey: KEYS.settings,
    queryFn: async () => getSettings(await getAppDb()),
  });
}

export function useProfile() {
  return useQuery({
    queryKey: KEYS.profile,
    queryFn: async () => getProfile(await getAppDb()),
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

export function useTransactions(filter: TxFilter) {
  return useQuery({
    queryKey: KEYS.transactions(filter),
    queryFn: async () => listTransactions(await getAppDb(), filter),
  });
}

export interface InsightsData {
  cycleStart: DateKey;
  cycleEnd: DateKey;
  today: DateKey;
  /** Spend − refunds this cycle: the same number the home screen counts. */
  totalSpentPaise: number;
  /** Σ spend by category before refunds: the base for category percentages. */
  categoryTotalPaise: number;
  byCategory: ReturnType<typeof totalsByCategory>;
  leaks: ReturnType<typeof smallLeaks>;
  merchants: ReturnType<typeof topMerchants>;
  split: ReturnType<typeof essentialSplit>;
  days: { date: DateKey; spentPaise: number; budgetPaise: number | null }[];
  hasData: boolean;
}

export function toInsightTx(t: Transaction): InsightTx {
  return { ...t, merchantDisplay: displayMerchant(t.merchant, t.vpa) };
}

export function useInsights() {
  return useQuery({
    queryKey: KEYS.insights,
    queryFn: async (): Promise<InsightsData | null> => {
      const db = await getAppDb();
      const profile = await getProfile(db);
      if (!profile) return null;
      const today = toDateKey(Date.now());
      const cycle = cycleFor(today, profile.payday);
      const txs = (
        await listTransactions(db, {
          from: startOfDayMs(cycle.start),
          to: startOfDayMs(addDays(today, 1)),
          limit: 100_000,
        })
      ).map(toInsightTx);
      const perDay = dailySpend(txs);
      const budgets = await db.getAllAsync<{ date: string; budget_paise: number }>(
        'SELECT date, budget_paise FROM daily_budgets WHERE date >= ? AND date <= ?',
        [cycle.start, today],
      );
      const budgetByDay = new Map(budgets.map((b) => [b.date, b.budget_paise]));
      const days: InsightsData['days'] = [];
      for (let d = cycle.start; d <= today; d = addDays(d, 1)) {
        days.push({
          date: d,
          spentPaise: perDay.get(d) ?? 0,
          budgetPaise: budgetByDay.get(d) ?? null,
        });
      }
      const byCategory = totalsByCategory(txs);
      return {
        cycleStart: cycle.start,
        cycleEnd: cycle.end,
        today,
        totalSpentPaise: totalSpend(txs),
        categoryTotalPaise: byCategory.reduce((s, c) => s + c.totalPaise, 0),
        byCategory,
        leaks: smallLeaks(txs),
        merchants: topMerchants(txs, 5),
        split: essentialSplit(txs),
        days,
        hasData: byCategory.length > 0,
      };
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
