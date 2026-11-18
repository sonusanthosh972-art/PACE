/**
 * The signed-in user's money situation, summarised for the AI assistant. Every figure is computed
 * here with the same rules as the phone (domain.ts); the model only explains them. Only one user's
 * documents are ever read (every query filters on userId). Notes, UPI ids, account numbers and
 * references are never included.
 */
import { getDb } from '../db/mongo.js';
import type { FixedExpenseDoc, TransactionDoc, UserDoc } from '../db/models.js';
import {
  addDays,
  budgetStartInCycle,
  countsAsRefund,
  countsAsSpend,
  cycleFor,
  daysLeftInCycle,
  diffDays,
  endOfDayMs,
  isEssential,
  isExpenseUpcomingInCycle,
  netSpend,
  nextDaysAverage,
  poolForCycle,
  rollingAllowance,
  simulatePurchase,
  spendableFor,
  startOfDayMs,
  toDateKey,
  type Cycle,
  type DateKey,
  type PurchaseSimulation,
} from '../domain.js';

/** Payments below this count as "small leaks" (same threshold as the insights endpoint). */
const SMALL_PAYMENT_PAISE = 500_00;
const RECENT_PAYMENTS = 8;
const TOP_CATEGORIES = 8;
const TOP_MERCHANTS = 5;
/** Largest amount the assistant will simulate (₹1 crore); anything above is surely a typo. */
const MAX_PURCHASE_PAISE = 1_00_00_000_00;

type TxLite = Pick<
  TransactionDoc,
  'amountPaise' | 'direction' | 'category' | 'isExcluded' | 'merchant' | 'merchantNorm' | 'occurredAt' | 'balancePaise'
>;

export interface CategoryTotal {
  category: string;
  totalPaise: number;
  count: number;
}

export interface FinancialContext {
  today: DateKey;
  hasProfile: boolean;
  profile: { salaryPaise: number; payday: number; savingsGoalPaise: number; fixedTotalPaise: number };
  cycle: Cycle & { budgetFrom: DateKey; daysLeft: number; daysElapsed: number; nextPayday: DateKey };
  budget: {
    spendablePaise: number;
    poolPaise: number;
    spentThroughTodayPaise: number;
    spentTodayPaise: number;
    allowanceTodayPaise: number;
    remainingTodayPaise: number;
    nextDaysAveragePaise: number | null;
    moneyLeftInCyclePaise: number;
    overspentInCyclePaise: number;
  };
  estimates: {
    averageDailySpendPaise: number;
    projectedCycleSpendPaise: number;
    projectedLeftAtPaydayPaise: number;
  };
  categories: CategoryTotal[];
  topMerchants: { merchant: string; totalPaise: number; count: number }[];
  essentialPaise: number;
  nonEssentialPaise: number;
  smallPayments: { count: number; totalPaise: number };
  refundsPaise: number;
  otherCreditsPaise: number;
  upcomingBills: { name: string; amountPaise: number; dueDay: number }[];
  lastBankBalance: { amountPaise: number; date: DateKey } | null;
  lastCycle: {
    start: DateKey;
    end: DateKey;
    totalSpendPaise: number;
    sameDaysSpendPaise: number;
    categories: CategoryTotal[];
  } | null;
  recentPayments: { date: DateKey; merchant: string; category: string; amountPaise: number }[];
  transactionCount: number;
  purchase: PurchaseSimulation | null;
}

function categoryTotals(txs: readonly TxLite[]): CategoryTotal[] {
  const map = new Map<string, CategoryTotal>();
  for (const t of txs) {
    if (!countsAsSpend(t)) continue;
    const c = map.get(t.category) ?? { category: t.category, totalPaise: 0, count: 0 };
    c.totalPaise += t.amountPaise;
    c.count += 1;
    map.set(t.category, c);
  }
  return [...map.values()].sort((a, b) => b.totalPaise - a.totalPaise);
}

/**
 * The rupee amount a question is about ("₹5,000", "Rs 12000", "5k", "1.5 lakh", "8000 rupees"),
 * in paise, or null. A bare number only counts when the question is about buying or affording.
 */
export function parseRupeeAmount(question: string): number | null {
  const text = question.toLowerCase().replace(/(\d),(?=\d)/g, '$1');
  const unit = (n: number, u?: string) =>
    u === 'k' ? n * 1_000 : u === 'lakh' || u === 'lakhs' || u === 'lac' || u === 'l' ? n * 1_00_000 : n;
  const patterns = [
    /(?:₹|rs\.?|inr)\s*(\d+(?:\.\d+)?)\s*(k|lakhs?|lac|l)?\b/,
    /(\d+(?:\.\d+)?)\s*(k|lakhs?|lac)?\s*(?:rupees|rs\b|inr\b)/,
    /(\d+(?:\.\d+)?)\s*(k|lakhs?|lac)\b/,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) return toPaise(unit(Number(m[1]), m[2]));
  }
  if (/\b(afford|buy|purchase|spend on|splurge|get a|get an)\b/.test(text)) {
    const m = text.match(/\b(\d{3,8}(?:\.\d+)?)\b/);
    if (m) return toPaise(Number(m[1]));
  }
  return null;
}

function toPaise(rupees: number): number | null {
  if (!Number.isFinite(rupees) || rupees <= 0) return null;
  const paise = Math.round(rupees * 100);
  return paise > MAX_PURCHASE_PAISE ? null : paise;
}

/** Builds the context for one user. `question` is only used to spot an amount to simulate. */
export async function buildFinancialContext(
  userId: string,
  now: number,
  question = '',
): Promise<FinancialContext | null> {
  const db = getDb();
  const user = await db.collection<UserDoc>('users').findOne({ id: userId });
  if (!user) return null;

  const today = toDateKey(now);
  const payday = user.payday ?? 1;
  const cycle = cycleFor(today, payday);
  const lastCycle = cycleFor(addDays(cycle.start, -1), payday);

  const [fixedExpenses, txs] = await Promise.all([
    db.collection<FixedExpenseDoc>('fixedExpenses').find({ userId }).toArray(),
    db
      .collection<TransactionDoc>('transactions')
      .find(
        { userId, occurredAt: { $gte: startOfDayMs(lastCycle.start), $lte: endOfDayMs(today) } },
        {
          projection: {
            _id: 0,
            amountPaise: 1,
            direction: 1,
            category: 1,
            isExcluded: 1,
            merchant: 1,
            merchantNorm: 1,
            occurredAt: 1,
            balancePaise: 1,
          },
        },
      )
      .sort({ occurredAt: -1 })
      .toArray() as Promise<TxLite[]>,
  ]);

  const spendable = spendableFor(user, fixedExpenses);
  const budgetFrom = budgetStartInCycle(cycle, user.budgetStartDate);
  const pool = poolForCycle(spendable, cycle, user.budgetStartDate);
  const daysLeft = daysLeftInCycle(today, cycle);
  const fromMs = startOfDayMs(budgetFrom);
  const todayMs = startOfDayMs(today);

  const inBudget = txs.filter((t) => t.occurredAt >= fromMs);
  const inCycle = txs.filter((t) => t.occurredAt >= startOfDayMs(cycle.start));
  const spentBefore = netSpend(inBudget.filter((t) => t.occurredAt < todayMs));
  const spentToday = netSpend(inBudget.filter((t) => t.occurredAt >= todayMs));
  const spentThroughToday = spentBefore + spentToday;
  const allowanceToday = rollingAllowance(pool, spentBefore, daysLeft);
  const remainingToday = allowanceToday - spentToday;

  const daysElapsed = Math.max(1, diffDays(budgetFrom, today) + 1);
  const countedDays = diffDays(budgetFrom, cycle.end) + 1;
  const averageDaily = Math.round(spentThroughToday / daysElapsed);
  const projectedSpend = averageDaily * countedDays;

  const spendInCycle = inCycle.filter(countsAsSpend);
  const merchants = new Map<string, { merchant: string; totalPaise: number; count: number }>();
  let essential = 0;
  let nonEssential = 0;
  let smallCount = 0;
  let smallTotal = 0;
  for (const t of spendInCycle) {
    if (isEssential(t.category)) essential += t.amountPaise;
    else nonEssential += t.amountPaise;
    if (t.amountPaise < SMALL_PAYMENT_PAISE) {
      smallCount += 1;
      smallTotal += t.amountPaise;
    }
    const key = t.merchantNorm || t.merchant;
    if (key) {
      const m = merchants.get(key) ?? { merchant: (t.merchant || key).slice(0, 40), totalPaise: 0, count: 0 };
      m.totalPaise += t.amountPaise;
      m.count += 1;
      merchants.set(key, m);
    }
  }

  const refunds = inCycle.filter(countsAsRefund).reduce((s, t) => s + t.amountPaise, 0);
  const otherCredits = inCycle
    .filter((t) => t.direction === 'credit' && !t.isExcluded && !countsAsRefund(t))
    .reduce((s, t) => s + t.amountPaise, 0);

  const withBalance = txs.find((t) => typeof t.balancePaise === 'number');
  const lastCycleTxs = txs.filter((t) => t.occurredAt < startOfDayMs(cycle.start));
  const sameDayInLastCycle = addDays(lastCycle.start, diffDays(cycle.start, today));
  const lastCycleSameDays = lastCycleTxs.filter((t) => t.occurredAt <= endOfDayMs(sameDayInLastCycle));

  const purchaseAmount = parseRupeeAmount(question);

  return {
    today,
    hasProfile: (user.salaryPaise ?? 0) > 0,
    profile: {
      salaryPaise: user.salaryPaise ?? 0,
      payday,
      savingsGoalPaise: user.savingsGoalPaise ?? 0,
      fixedTotalPaise: fixedExpenses.reduce((s, f) => s + f.amountPaise, 0),
    },
    cycle: { ...cycle, budgetFrom, daysLeft, daysElapsed, nextPayday: addDays(cycle.end, 1) },
    budget: {
      spendablePaise: spendable,
      poolPaise: pool,
      spentThroughTodayPaise: spentThroughToday,
      spentTodayPaise: spentToday,
      allowanceTodayPaise: allowanceToday,
      remainingTodayPaise: remainingToday,
      nextDaysAveragePaise: nextDaysAverage(pool, spentThroughToday, daysLeft),
      moneyLeftInCyclePaise: Math.max(0, pool - spentThroughToday),
      overspentInCyclePaise: Math.max(0, spentThroughToday - pool),
    },
    estimates: {
      averageDailySpendPaise: averageDaily,
      projectedCycleSpendPaise: projectedSpend,
      projectedLeftAtPaydayPaise: pool - projectedSpend,
    },
    categories: categoryTotals(inCycle).slice(0, TOP_CATEGORIES),
    topMerchants: [...merchants.values()].sort((a, b) => b.totalPaise - a.totalPaise).slice(0, TOP_MERCHANTS),
    essentialPaise: essential,
    nonEssentialPaise: nonEssential,
    smallPayments: { count: smallCount, totalPaise: smallTotal },
    refundsPaise: refunds,
    otherCreditsPaise: otherCredits,
    upcomingBills: fixedExpenses
      .filter((f) => isExpenseUpcomingInCycle(today, cycle.end, f.dueDay))
      .sort((a, b) => a.dueDay - b.dueDay)
      .map((f) => ({ name: f.name.slice(0, 40), amountPaise: f.amountPaise, dueDay: f.dueDay })),
    lastBankBalance:
      withBalance && typeof withBalance.balancePaise === 'number'
        ? { amountPaise: withBalance.balancePaise, date: toDateKey(withBalance.occurredAt) }
        : null,
    lastCycle:
      lastCycleTxs.length > 0
        ? {
            start: lastCycle.start,
            end: lastCycle.end,
            totalSpendPaise: netSpend(lastCycleTxs),
            sameDaysSpendPaise: netSpend(lastCycleSameDays),
            categories: categoryTotals(lastCycleTxs).slice(0, TOP_CATEGORIES),
          }
        : null,
    recentPayments: inCycle
      .filter(countsAsSpend)
      .slice(0, RECENT_PAYMENTS)
      .map((t) => ({
        date: toDateKey(t.occurredAt),
        merchant: (t.merchant || t.merchantNorm || t.category).slice(0, 40),
        category: t.category,
        amountPaise: t.amountPaise,
      })),
    transactionCount: inCycle.length,
    purchase:
      purchaseAmount === null
        ? null
        : simulatePurchase({
            purchasePaise: purchaseAmount,
            poolPaise: pool,
            spentThroughTodayPaise: spentThroughToday,
            remainingTodayPaise: remainingToday,
            daysLeft,
            savingsGoalPaise: user.savingsGoalPaise ?? 0,
          }),
  };
}
