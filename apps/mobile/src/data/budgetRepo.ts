import {
  cycleFor,
  daysLeftInCycle,
  computeTodayBudget,
  onBudgetStreak,
  snapshotForDay,
  spendableForCycle,
  totalSpend,
  type BudgetProfile,
  type BudgetSnapshot,
  type DayResult,
} from '@/domain/budget';
import { addDays, startOfDayMs, toDateKey, type DateKey } from '@/domain/time';

import type { SqlDb } from './db';
import { listTransactions } from './transactionsRepo';

async function spendBetween(db: SqlDb, fromMs: number, toMs: number): Promise<number> {
  return totalSpend(await listTransactions(db, { from: fromMs, to: toMs, limit: 100_000 }));
}

/**
 * Returns today's budget, computing and freezing it on first access of the day.
 * The frozen value is what "00:00" saw: it only depends on spending before today, so it is the
 * same whether it is first computed at 00:01 or 14:00.
 */
export async function getOrFreezeBudget(
  db: SqlDb,
  profile: BudgetProfile,
  today: DateKey,
  now: number,
): Promise<number> {
  const existing = await db.getFirstAsync<{ budget_paise: number }>(
    'SELECT budget_paise FROM daily_budgets WHERE date = ?',
    [today],
  );
  if (existing) return existing.budget_paise;

  const cycle = cycleFor(today, profile.payday);
  const spentBefore = await spendBetween(db, startOfDayMs(cycle.start), startOfDayMs(today));
  const budget = computeTodayBudget({
    spendablePaise: spendableForCycle(profile),
    spentBeforeTodayPaise: spentBefore,
    daysLeft: daysLeftInCycle(today, cycle),
  });
  await db.runAsync(
    'INSERT OR IGNORE INTO daily_budgets (date, budget_paise, computed_at) VALUES (?, ?, ?)',
    [today, budget, now],
  );
  return budget;
}

export async function getSnapshot(
  db: SqlDb,
  profile: BudgetProfile,
  now: number,
): Promise<BudgetSnapshot> {
  const today = toDateKey(now);
  const cycle = cycleFor(today, profile.payday);
  const frozen = await getOrFreezeBudget(db, profile, today, now);
  const todayStart = startOfDayMs(today);
  const [before, spentToday] = await Promise.all([
    spendBetween(db, startOfDayMs(cycle.start), todayStart),
    spendBetween(db, todayStart, startOfDayMs(addDays(today, 1))),
  ]);
  return snapshotForDay({
    profile,
    today,
    cycleSpendBeforeTodayPaise: before,
    spentTodayPaise: spentToday,
    frozenTodayBudgetPaise: frozen,
  });
}

/** Past days with a frozen budget and what was actually spent. */
export async function dayResults(
  db: SqlDb,
  sinceDay: DateKey,
  untilDay: DateKey,
): Promise<DayResult[]> {
  const budgets = await db.getAllAsync<{ date: string; budget_paise: number }>(
    'SELECT date, budget_paise FROM daily_budgets WHERE date >= ? AND date < ? ORDER BY date',
    [sinceDay, untilDay],
  );
  if (budgets.length === 0) return [];
  const txs = await listTransactions(db, {
    from: startOfDayMs(sinceDay),
    to: startOfDayMs(untilDay),
    limit: 100_000,
  });
  const spentByDay = new Map<DateKey, number>();
  for (const tx of txs) {
    const key = toDateKey(tx.occurredAt);
    spentByDay.set(key, (spentByDay.get(key) ?? 0) + totalSpend([tx]));
  }
  return budgets.map((b) => ({
    date: b.date,
    budgetPaise: b.budget_paise,
    spentPaise: spentByDay.get(b.date) ?? 0,
  }));
}

export async function getStreak(db: SqlDb, now: number): Promise<number> {
  const today = toDateKey(now);
  return onBudgetStreak(today, await dayResults(db, addDays(today, -400), today));
}

/**
 * Freezes budgets for past days that have none (e.g. the app was not opened that day), using the
 * same rule as 00:00 would have. Lets streaks and night summaries work after gaps.
 */
export async function backfillBudgets(
  db: SqlDb,
  profile: BudgetProfile,
  fromDay: DateKey,
  untilDay: DateKey,
  now: number,
): Promise<void> {
  for (let day = fromDay; day < untilDay; day = addDays(day, 1)) {
    await getOrFreezeBudget(db, profile, day, now);
  }
}

/** Forgets frozen budgets from `fromDay` onwards (used when the profile changes). */
export async function clearBudgetsFrom(db: SqlDb, fromDay: DateKey): Promise<void> {
  await db.runAsync('DELETE FROM daily_budgets WHERE date >= ?', [fromDay]);
}
