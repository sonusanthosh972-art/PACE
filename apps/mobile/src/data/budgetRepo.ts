import {
  budgetStartInCycle,
  cycleFor,
  daysLeftInCycle,
  onBudgetStreak,
  poolForCycle,
  rollingAllowance,
  snapshotForDay,
  type BudgetProfile,
  type BudgetSnapshot,
  type DayResult,
} from '@/domain/budget';
import { CATEGORIES } from '@/domain/categories';
import { addDays, IST_OFFSET_MS, startOfDayMs, toDateKey, type DateKey } from '@/domain/time';

import type { SqlDb } from './db';

/** Fixed-expense categories, inlined as SQL string literals (ids are fixed identifiers). */
const FIXED_SQL = Object.values(CATEGORIES)
  .filter((c) => c.isFixed)
  .map((c) => `'${c.id}'`)
  .join(', ');

/** SQL twin of countsAsSpend: non-excluded debits that are not fixed-expense payments. */
const SPEND_SQL = `direction = 'debit' AND is_excluded = 0 AND category NOT IN (${FIXED_SQL})`;

/** SQL twin of countsAsRefund. */
const REFUND_SQL = `direction = 'credit' AND is_excluded = 0
  AND category NOT IN ('other', 'transfers', ${FIXED_SQL})`;

/** Same result as totalSpend over the range, summed inside SQLite instead of loading every row. */
async function spendBetween(db: SqlDb, fromMs: number, toMs: number): Promise<number> {
  const row = await db.getFirstAsync<{ debits: number; refunds: number }>(
    `SELECT COALESCE(SUM(CASE WHEN ${SPEND_SQL} THEN amount_paise END), 0) AS debits,
            COALESCE(SUM(CASE WHEN ${REFUND_SQL} THEN amount_paise END), 0) AS refunds
     FROM transactions WHERE occurred_at >= ? AND occurred_at < ?`,
    [fromMs, toMs],
  );
  return Math.max(0, (row?.debits ?? 0) - (row?.refunds ?? 0));
}

/**
 * A day's carry-forward allowance from the stored transactions: this cycle's money left before the
 * day, shared over the days left. Each payment is counted once, in the day it happened.
 */
export async function computeDayAllowance(
  db: SqlDb,
  profile: BudgetProfile,
  day: DateKey,
): Promise<number> {
  const cycle = cycleFor(day, profile.payday);
  const from = budgetStartInCycle(cycle, profile.startDate);
  const before = from < day ? await spendBetween(db, startOfDayMs(from), startOfDayMs(day)) : 0;
  return rollingAllowance(poolForCycle(profile, cycle), before, daysLeftInCycle(day, cycle));
}

/** Saves the day's allowance, replacing an earlier value for the same day. */
async function storeBudget(db: SqlDb, day: DateKey, budget: number, now: number): Promise<void> {
  await db.runAsync(
    `INSERT INTO daily_budgets (date, budget_paise, computed_at) VALUES (?, ?, ?)
     ON CONFLICT(date) DO UPDATE SET budget_paise = excluded.budget_paise,
       computed_at = excluded.computed_at`,
    [day, budget, now],
  );
}

/**
 * Returns the day's allowance. Today's is recalculated on every call (a payment recorded late for
 * an earlier day still moves it); a past day keeps the value it was judged against (streaks,
 * yesterday's line), even if the salary is edited later.
 */
export async function getOrFreezeBudget(
  db: SqlDb,
  profile: BudgetProfile,
  day: DateKey,
  now: number,
): Promise<number> {
  if (day < toDateKey(now)) {
    const existing = await db.getFirstAsync<{ budget_paise: number }>(
      'SELECT budget_paise FROM daily_budgets WHERE date = ?',
      [day],
    );
    if (existing) return existing.budget_paise;
  }
  const budget = await computeDayAllowance(db, profile, day);
  await storeBudget(db, day, budget, now);
  return budget;
}

export async function getSnapshot(
  db: SqlDb,
  profile: BudgetProfile,
  now: number,
): Promise<BudgetSnapshot> {
  const today = toDateKey(now);
  const cycle = cycleFor(today, profile.payday);
  const todayStart = startOfDayMs(today);
  const [before, spentToday] = await Promise.all([
    spendBetween(db, startOfDayMs(budgetStartInCycle(cycle, profile.startDate)), todayStart),
    spendBetween(db, todayStart, startOfDayMs(addDays(today, 1))),
  ]);
  const budget = rollingAllowance(
    poolForCycle(profile, cycle),
    before,
    daysLeftInCycle(today, cycle),
  );
  await storeBudget(db, today, budget, now);
  return snapshotForDay({
    profile,
    today,
    cycleSpendBeforeTodayPaise: before,
    spentTodayPaise: spentToday,
    frozenTodayBudgetPaise: budget,
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
  // Net spend per IST day (spend − refunds, floored at zero): the same rule as "Spent today".
  const rows = await db.getAllAsync<{ day: string; spent: number }>(
    `SELECT date((occurred_at + ?) / 1000, 'unixepoch') AS day,
            MAX(0, COALESCE(SUM(CASE WHEN ${SPEND_SQL} THEN amount_paise END), 0)
                 - COALESCE(SUM(CASE WHEN ${REFUND_SQL} THEN amount_paise END), 0)) AS spent
     FROM transactions
     WHERE occurred_at >= ? AND occurred_at < ?
     GROUP BY day`,
    [IST_OFFSET_MS, startOfDayMs(sinceDay), startOfDayMs(untilDay)],
  );
  const spentByDay = new Map<DateKey, number>(rows.map((r) => [r.day, r.spent]));
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
 * Stores allowances for past days that have none (e.g. the app was not opened that day), using the
 * same carry-forward rule as 00:00 would have. Lets streaks and day cards work after gaps.
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
