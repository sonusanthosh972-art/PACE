/**
 * Notification message builders. Every function is pure (data in → string out) so it is
 * trivially testable and never touches expo-notifications or the database.
 */
import { CATEGORIES } from '@/domain/categories';
import { type InsightTx, smallLeaks, topMerchants } from '@/domain/insights';
import { formatINRWhole, type Paise } from '@/domain/money';
import { displayMerchant } from '@/domain/merchant';

// ── Morning ──────────────────────────────────────────────────────────────────

export interface MorningInput {
  todayBudgetPaise: Paise;
  yesterdayBudgetPaise: Paise | null;
  yesterdaySpentPaise: Paise | null;
}

/** "Today's budget: ₹1,579. Yesterday: ₹2,100 spent (₹521 over)." */
export function morningBody(input: MorningInput): string {
  const budget = formatINRWhole(input.todayBudgetPaise);
  let msg = `Today's budget: ${budget}.`;
  if (input.yesterdayBudgetPaise != null && input.yesterdaySpentPaise != null) {
    const ySpent = formatINRWhole(input.yesterdaySpentPaise);
    const diff = input.yesterdaySpentPaise - input.yesterdayBudgetPaise;
    if (diff > 0) {
      msg += ` Yesterday: ${ySpent} spent (${formatINRWhole(diff)} over).`;
    } else if (diff < 0) {
      msg += ` Yesterday: saved ${formatINRWhole(-diff)}! 🎉`;
    } else {
      msg += ` Yesterday: exactly on budget.`;
    }
  }
  return msg;
}

// ── Live payment ─────────────────────────────────────────────────────────────

export interface LiveAlertInput {
  amountPaise: Paise;
  merchant: string | null;
  vpa: string | null;
  category: string;
  remainingTodayPaise: Paise;
}

/** "☕ ₹300 at Third Wave · ₹1,279 left today." */
export function liveAlertBody(input: LiveAlertInput): string {
  const emoji = CATEGORIES[input.category as keyof typeof CATEGORIES]?.emoji ?? '💳';
  const amt = formatINRWhole(input.amountPaise);
  const merchant = displayMerchant(input.merchant, input.vpa);
  const remaining = formatINRWhole(Math.max(0, input.remainingTodayPaise));
  return `${emoji} ${amt} at ${merchant} · ${remaining} left today.`;
}

// ── Budget warnings ──────────────────────────────────────────────────────────

export function warn80Body(spentPaise: Paise, budgetPaise: Paise): string {
  return `Heads up — you've used 80% of today's ${formatINRWhole(budgetPaise)} budget. ${formatINRWhole(budgetPaise - spentPaise)} left.`;
}

export function warn100Body(spentPaise: Paise, budgetPaise: Paise): string {
  const over = spentPaise - budgetPaise;
  if (over > 0) {
    return `Today's budget is spent. You're ${formatINRWhole(over)} over — tomorrow's budget will adjust.`;
  }
  return `Today's budget is fully used. Any more spending puts tomorrow under pressure.`;
}

// ── Night summary ────────────────────────────────────────────────────────────

export interface NightInput {
  budgetPaise: Paise;
  spentPaise: Paise;
  /** Top merchant by total spend today, with count. */
  biggestLeak: { merchant: string; totalPaise: Paise; count: number } | null;
}

/**
 * "Budget ₹1,579 · Spent ₹2,100 · Biggest leak: Zepto ₹800 (3 orders)"
 * or "Nice! You saved ₹420 today."
 */
export function nightBody(input: NightInput): string {
  const saved = input.budgetPaise - input.spentPaise;
  if (saved > 0) {
    return `Nice! You saved ${formatINRWhole(saved)} today. 🎉`;
  }
  let msg = `Budget ${formatINRWhole(input.budgetPaise)} · Spent ${formatINRWhole(input.spentPaise)}`;
  if (input.biggestLeak) {
    const { merchant, totalPaise, count } = input.biggestLeak;
    msg += ` · Biggest leak: ${merchant} ${formatINRWhole(totalPaise)} (${count} ${count === 1 ? 'order' : 'orders'})`;
  }
  return msg;
}

// ── Weekly review ────────────────────────────────────────────────────────────

export interface WeeklyInput {
  /** Transactions from the past 7 days. */
  weekTxs: readonly InsightTx[];
}

/**
 * "This week: 14 payments under ₹500 totalling ₹3,200.
 *  Top merchants: Zepto (₹1,800), Swiggy (₹1,400), Third Wave (₹900)"
 */
export function weeklyBody(input: WeeklyInput): string {
  const leaks = smallLeaks(input.weekTxs);
  const top = topMerchants(input.weekTxs, 3);

  const parts: string[] = [];
  if (leaks.count > 0) {
    parts.push(
      `This week: ${leaks.count} ${leaks.count === 1 ? 'payment' : 'payments'} under ₹500 totalling ${formatINRWhole(leaks.totalPaise)}.`,
    );
  } else {
    parts.push('No small payments under ₹500 this week. 🎯');
  }
  if (top.length > 0) {
    const list = top
      .map((m) => `${m.merchantDisplay} (${formatINRWhole(m.totalPaise)})`)
      .join(', ');
    parts.push(`Top merchants: ${list}`);
  }
  return parts.join('\n');
}
