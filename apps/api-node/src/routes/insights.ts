import { Router, Response } from 'express';
import { AuthenticatedRequest, requireAuth } from '../middleware/auth.js';
import { getDb } from '../db/mongo.js';
import { UserDoc, TransactionDoc } from '../db/models.js';

export const insightsRouter = Router();
insightsRouter.use(requireAuth);

const ESSENTIAL_CATEGORIES = new Set(['groceries', 'bills', 'health', 'transport']);

export function countsAsSpend(tx: { direction: string; isExcluded: boolean; category: string }): boolean {
  return (
    tx.direction.toLowerCase() === 'debit' &&
    !tx.isExcluded &&
    tx.category.toLowerCase() !== 'rent_emi'
  );
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function computeCycle(today: Date, payday: number): { start: Date; end: Date; totalDays: number } {
  const clampedPayday = Math.min(31, Math.max(1, payday));
  const year = today.getFullYear();
  const month = today.getMonth() + 1; // 1-12

  const thisMonthMaxDays = daysInMonth(year, month);
  const thisMonthPayday = Math.min(clampedPayday, thisMonthMaxDays);

  let start: Date;
  let nextStart: Date;

  if (today.getDate() >= thisMonthPayday) {
    start = new Date(year, month - 1, thisMonthPayday);
    const nextYear = month === 12 ? year + 1 : year;
    const nextMonth = month === 12 ? 1 : month + 1;
    const nextMax = daysInMonth(nextYear, nextMonth);
    const nextPayday = Math.min(clampedPayday, nextMax);
    nextStart = new Date(nextYear, nextMonth - 1, nextPayday);
  } else {
    const prevYear = month === 1 ? year - 1 : year;
    const prevMonth = month === 1 ? 12 : month - 1;
    const prevMax = daysInMonth(prevYear, prevMonth);
    const prevPayday = Math.min(clampedPayday, prevMax);
    start = new Date(prevYear, prevMonth - 1, prevPayday);
    nextStart = new Date(year, month - 1, thisMonthPayday);
  }

  const end = new Date(nextStart.getTime() - 24 * 60 * 60 * 1000);
  const diffTime = Math.abs(end.getTime() - start.getTime());
  const totalDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;

  return { start, end, totalDays };
}

// GET /api/v1/insights/cycle
insightsRouter.get('/cycle', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const userId = req.userId!;
  const db = getDb();
  const user = await db.collection<UserDoc>('users').findOne({ id: userId });
  if (!user) {
    res.status(404).json({ status: 404, title: 'User not found' });
    return;
  }

  const now = new Date();
  const cycle = computeCycle(now, user.payday ?? 1);

  const startMs = new Date(cycle.start.getFullYear(), cycle.start.getMonth(), cycle.start.getDate(), 0, 0, 0, 0).getTime();
  const endMs = new Date(cycle.end.getFullYear(), cycle.end.getMonth(), cycle.end.getDate(), 23, 59, 59, 999).getTime();

  const transactions = await db
    .collection<TransactionDoc>('transactions')
    .find({
      userId,
      occurredAt: { $gte: startMs, $lte: endMs },
    })
    .sort({ occurredAt: -1 })
    .toArray();

  const spendTxs = transactions.filter(countsAsSpend);
  const totalSpendPaise = spendTxs.reduce((sum, t) => sum + (t.amountPaise || 0), 0);

  // Category totals
  const catMap = new Map<string, { total: number; count: number }>();
  for (const t of spendTxs) {
    const amt = t.amountPaise;
    const current = catMap.get(t.category) || { total: 0, count: 0 };
    current.total += amt;
    current.count += 1;
    catMap.set(t.category, current);
  }

  const categoryTotals = Array.from(catMap.entries())
    .map(([category, data]) => ({
      category,
      totalPaise: data.total,
      count: data.count,
    }))
    .sort((a, b) => b.totalPaise - a.totalPaise);

  // Small leaks (< ₹500 = 50,000 paise)
  const smallLeaksList = spendTxs.filter((t) => t.amountPaise < 50000);
  const smallLeaks = {
    count: smallLeaksList.length,
    totalPaise: smallLeaksList.reduce((sum, t) => sum + t.amountPaise, 0),
  };

  // Top 3 merchants
  const merchMap = new Map<string, { display: string; total: number; count: number }>();
  for (const t of spendTxs) {
    const norm = t.merchantNorm || t.merchant;
    if (!norm) continue;
    const current = merchMap.get(norm) || { display: t.merchant || norm, total: 0, count: 0 };
    current.total += t.amountPaise;
    current.count += 1;
    merchMap.set(norm, current);
  }

  const topMerchants = Array.from(merchMap.entries())
    .map(([norm, data]) => ({
      merchantNorm: norm,
      merchantDisplay: data.display,
      totalPaise: data.total,
      count: data.count,
    }))
    .sort((a, b) => (b.totalPaise !== a.totalPaise ? b.totalPaise - a.totalPaise : b.count - a.count))
    .slice(0, 3);

  // Essential split
  const essentialSpend = spendTxs
    .filter((t) => ESSENTIAL_CATEGORIES.has(t.category.toLowerCase()))
    .reduce((sum, t) => sum + t.amountPaise, 0);
  const nonEssentialSpend = totalSpendPaise - essentialSpend;

  const daysRemaining = Math.max(1, Math.ceil((cycle.end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));

  res.status(200).json({
    totalSpendPaise,
    categoryTotals,
    smallLeaks,
    topMerchants,
    essentialSplit: {
      essentialPaise: essentialSpend,
      nonEssentialPaise: nonEssentialSpend,
    },
    cycle: {
      start: formatDate(cycle.start),
      end: formatDate(cycle.end),
      totalDays: cycle.totalDays,
      daysRemaining,
    },
  });
});

// GET /api/v1/insights/daily
insightsRouter.get('/daily', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const userId = req.userId!;
  const db = getDb();
  const user = await db.collection<UserDoc>('users').findOne({ id: userId });
  if (!user) {
    res.status(404).json({ status: 404, title: 'User not found' });
    return;
  }

  const now = new Date();
  const cycle = computeCycle(now, user.payday ?? 1);

  const startMs = new Date(cycle.start.getFullYear(), cycle.start.getMonth(), cycle.start.getDate(), 0, 0, 0, 0).getTime();
  const endMs = new Date(cycle.end.getFullYear(), cycle.end.getMonth(), cycle.end.getDate(), 23, 59, 59, 999).getTime();

  const transactions = await db
    .collection<TransactionDoc>('transactions')
    .find({
      userId,
      occurredAt: { $gte: startMs, $lte: endMs },
    })
    .sort({ occurredAt: -1 })
    .toArray();

  const spendTxs = transactions.filter(countsAsSpend);
  const dailyMap = new Map<string, { total: number; count: number }>();

  // Pre-populate each day of cycle with 0
  const cur = new Date(cycle.start);
  while (cur <= now) {
    dailyMap.set(formatDate(cur), { total: 0, count: 0 });
    cur.setDate(cur.getDate() + 1);
  }

  for (const t of spendTxs) {
    const key = formatDate(new Date(t.occurredAt));
    if (dailyMap.has(key)) {
      const data = dailyMap.get(key)!;
      data.total += t.amountPaise;
      data.count += 1;
    } else {
      dailyMap.set(key, { total: t.amountPaise, count: 1 });
    }
  }

  const result = Array.from(dailyMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([dateKey, val]) => ({
      dateKey,
      totalSpendPaise: val.total,
      count: val.count,
    }));

  res.status(200).json(result);
});
