import { CATEGORIES, type CategoryId } from './categories';
import { divideRound, sumPaise, type Paise } from './money';
import { addDays, daysInMonth, diffDays, formatYmd, parseDateKey, type DateKey } from './time';
import type { Direction } from './transaction';

export interface FixedExpense {
  id: string;
  name: string;
  amountPaise: Paise;
  dueDay: number; // 1–31
}

export interface BudgetProfile {
  monthlySalaryPaise: Paise;
  payday: number; // 1–31
  fixedExpenses: readonly FixedExpense[];
  monthlySavingsGoalPaise: Paise;
  /** Day the budget was first set up; the cycle containing it is prorated from this day. */
  startDate?: DateKey | null;
}

export interface Cycle {
  start: DateKey; // payday (inclusive)
  end: DateKey; // day before the next payday (inclusive)
  totalDays: number;
}

/** Payday clamped to the month length: payday 31 in February → 28th/29th. */
export function effectivePayday(year: number, month: number, payday: number): number {
  return Math.min(Math.max(1, Math.trunc(payday)), daysInMonth(year, month));
}

function shiftMonth(year: number, month: number, delta: number): { year: number; month: number } {
  const index = year * 12 + (month - 1) + delta;
  return { year: Math.floor(index / 12), month: (index % 12) + 1 };
}

/** The salary cycle containing `today`. */
export function cycleFor(today: DateKey, payday: number): Cycle {
  const { year, month, day } = parseDateKey(today);
  const thisMonthPayday = effectivePayday(year, month, payday);

  const startMonth = day >= thisMonthPayday ? { year, month } : shiftMonth(year, month, -1);
  const start = formatYmd(
    startMonth.year,
    startMonth.month,
    effectivePayday(startMonth.year, startMonth.month, payday),
  );
  const next = shiftMonth(startMonth.year, startMonth.month, 1);
  const nextStart = formatYmd(
    next.year,
    next.month,
    effectivePayday(next.year, next.month, payday),
  );
  const end = addDays(nextStart, -1);

  return { start, end, totalDays: diffDays(start, end) + 1 };
}

/** Days remaining in the cycle including today (minimum 1). */
export function daysLeftInCycle(today: DateKey, cycle: Cycle): number {
  return Math.max(1, diffDays(today, cycle.end) + 1);
}

/** spendable = salary − Σ fixedExpenses − savingsGoal (may be negative). */
export function spendableForCycle(profile: BudgetProfile): Paise {
  return (
    profile.monthlySalaryPaise -
    sumPaise(profile.fixedExpenses.map((f) => f.amountPaise)) -
    profile.monthlySavingsGoalPaise
  );
}

/**
 * First day whose spending counts in this cycle: the setup day when the budget was set up
 * part-way through the cycle, otherwise the cycle start.
 */
export function budgetStartInCycle(cycle: Cycle, startDate?: DateKey | null): DateKey {
  return startDate && startDate > cycle.start && startDate <= cycle.end ? startDate : cycle.start;
}

/**
 * Money available for the cycle. A cycle joined part-way only gets its share for the days covered
 * (spendable × coveredDays ÷ totalDays), so the first day's budget matches the usual per-day pace
 * instead of the whole month being squeezed into the days that are left.
 */
export function poolForCycle(profile: BudgetProfile, cycle: Cycle): Paise {
  const spendable = spendableForCycle(profile);
  const from = budgetStartInCycle(cycle, profile.startDate);
  if (from === cycle.start) return spendable;
  const coveredDays = diffDays(from, cycle.end) + 1;
  return divideRound(spendable * coveredDays, cycle.totalDays);
}

export interface SpendLike {
  amountPaise: Paise;
  direction: Direction;
  category: CategoryId;
  isExcluded: boolean;
}

/**
 * Counts against the daily budget: non-excluded debits that are not fixed-expense payments.
 * Self-transfers are excluded by the user ("Not an expense"), which sets isExcluded.
 */
export function countsAsSpend(tx: SpendLike): boolean {
  return tx.direction === 'debit' && !tx.isExcluded && !CATEGORIES[tx.category].isFixed;
}

/**
 * Valid refund/reversal credits that net against spending (e.g. Amazon refund).
 * Does not include transfers to people, other general income/deposits, or fixed expenses.
 */
export function countsAsRefund(tx: SpendLike): boolean {
  return (
    tx.direction === 'credit' &&
    !tx.isExcluded &&
    tx.category !== 'other' &&
    tx.category !== 'transfers' &&
    !CATEGORIES[tx.category]?.isFixed
  );
}

export function totalSpend(txs: readonly SpendLike[]): Paise {
  let debits = 0;
  let refunds = 0;
  for (const t of txs) {
    if (countsAsSpend(t)) debits += t.amountPaise;
    else if (countsAsRefund(t)) refunds += t.amountPaise;
  }
  return Math.max(0, debits - refunds);
}

/**
 * The fixed allowance for each day of the cycle: (salary − fixed costs − savings) ÷ days in the
 * cycle, rounded to the paisa, never negative. It is the same every day: money not spent on one day
 * does not pile up into later days, and overspending one day does not shrink the next.
 */
export function dailyAllowance(profile: BudgetProfile, cycle: Cycle): Paise {
  const spendable = spendableForCycle(profile);
  if (spendable <= 0) return 0;
  return divideRound(spendable, cycle.totalDays);
}

/** remainingToday = todayBudget − spentToday (negative means overspent). */
export function remainingToday(todayBudgetPaise: Paise, spentTodayPaise: Paise): Paise {
  return todayBudgetPaise - spentTodayPaise;
}

export interface BudgetSnapshot {
  cycle: Cycle;
  daysLeft: number;
  spendablePaise: Paise;
  spentBeforeTodayPaise: Paise;
  spentTodayPaise: Paise;
  todayBudgetPaise: Paise;
  remainingTodayPaise: Paise;
  /** Fraction of today's budget used; > 1 when overspent; 1 when the budget is 0 and anything was spent. */
  usedRatio: number;
}

/**
 * Full snapshot for a day. `frozenTodayBudgetPaise` is the value stored for the day; when absent
 * it is today's fixed daily allowance. `spendablePaise` is the money for this cycle (prorated when
 * the budget was set up part-way), used for "left until payday".
 */
export function snapshotForDay(args: {
  profile: BudgetProfile;
  today: DateKey;
  cycleSpendBeforeTodayPaise: Paise;
  spentTodayPaise: Paise;
  frozenTodayBudgetPaise?: Paise | null;
}): BudgetSnapshot {
  const cycle = cycleFor(args.today, args.profile.payday);
  const daysLeft = daysLeftInCycle(args.today, cycle);
  const spendablePaise = poolForCycle(args.profile, cycle);
  const todayBudgetPaise = args.frozenTodayBudgetPaise ?? dailyAllowance(args.profile, cycle);
  const usedRatio =
    todayBudgetPaise > 0
      ? args.spentTodayPaise / todayBudgetPaise
      : args.spentTodayPaise > 0
        ? 1
        : 0;

  return {
    cycle,
    daysLeft,
    spendablePaise,
    spentBeforeTodayPaise: args.cycleSpendBeforeTodayPaise,
    spentTodayPaise: args.spentTodayPaise,
    todayBudgetPaise,
    remainingTodayPaise: remainingToday(todayBudgetPaise, args.spentTodayPaise),
    usedRatio,
  };
}

export interface CycleLeft {
  /** Money for this cycle (prorated when the budget was set up part-way). */
  poolPaise: Paise;
  /** Spent this cycle so far, including today (spend − refunds). */
  spentPaise: Paise;
  /** poolPaise − spentPaise, never below 0: what is left until payday. */
  leftPaise: Paise;
  /** How far spending has gone past the cycle's money (0 when within it). */
  overPaise: Paise;
}

/** "Left until payday": this cycle's money minus everything spent in it so far. */
export function cycleLeft(snapshot: BudgetSnapshot): CycleLeft {
  const spentPaise = snapshot.spentBeforeTodayPaise + snapshot.spentTodayPaise;
  const balance = snapshot.spendablePaise - spentPaise;
  return {
    poolPaise: snapshot.spendablePaise,
    spentPaise,
    leftPaise: Math.max(0, balance),
    overPaise: Math.max(0, -balance),
  };
}

export interface DayResult {
  date: DateKey;
  budgetPaise: Paise;
  spentPaise: Paise;
}

/**
 * Consecutive completed days (ending yesterday) on which spending stayed within budget.
 * Days with no stored record break the streak.
 */
export function onBudgetStreak(today: DateKey, days: readonly DayResult[]): number {
  const byDate = new Map(days.map((d) => [d.date, d]));
  let streak = 0;
  for (let date = addDays(today, -1); ; date = addDays(date, -1)) {
    const day = byDate.get(date);
    if (!day || day.spentPaise > day.budgetPaise) return streak;
    streak += 1;
  }
}
