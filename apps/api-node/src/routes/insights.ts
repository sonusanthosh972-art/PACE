import { Router, Response } from 'express';
import { AuthenticatedRequest, requireAuth, userIdOf } from '../middleware/auth.js';
import { getDb } from '../db/mongo.js';
import { UserDoc, TransactionDoc } from '../db/models.js';
import {
  addDays,
  countsAsRefund,
  countsAsSpend,
  cycleFor,
  daysLeftInCycle,
  endOfDayMs,
  isEssential,
  netSpend,
  startOfDayMs,
  toDateKey,
  type Cycle,
  type DateKey,
} from '../domain.js';
import { problem } from '../http.js';

export const insightsRouter = Router();
insightsRouter.use(requireAuth);

export const SMALL_LEAK_LIMIT_PAISE = 500_00;

async function loadCycle(userId: string): Promise<{ today: DateKey; cycle: Cycle; txs: TransactionDoc[] } | null> {
  const db = getDb();
  const user = await db.collection<UserDoc>('users').findOne({ id: userId });
  if (!user) return null;

  const today = toDateKey(Date.now());
  const cycle = cycleFor(today, user.payday ?? 1);
  const txs = await db
    .collection<TransactionDoc>('transactions')
    .find({ userId, occurredAt: { $gte: startOfDayMs(cycle.start), $lte: endOfDayMs(cycle.end) } })
    .toArray();
  return { today, cycle, txs };
}

// GET /api/v1/insights/cycle
insightsRouter.get('/cycle', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const data = await loadCycle(userIdOf(req));
  if (!data) {
    problem(res, 404, 'User not found');
    return;
  }
  const { today, cycle, txs } = data;
  const spendTxs = txs.filter(countsAsSpend);

  const categories = new Map<string, { totalPaise: number; count: number }>();
  const merchants = new Map<string, { merchantDisplay: string; totalPaise: number; count: number }>();
  let essentialPaise = 0;
  let nonEssentialPaise = 0;
  let leakCount = 0;
  let leakTotal = 0;

  for (const t of spendTxs) {
    const cat = categories.get(t.category) ?? { totalPaise: 0, count: 0 };
    cat.totalPaise += t.amountPaise;
    cat.count += 1;
    categories.set(t.category, cat);

    if (t.merchantNorm) {
      const m = merchants.get(t.merchantNorm) ?? {
        merchantDisplay: t.merchant || t.merchantNorm,
        totalPaise: 0,
        count: 0,
      };
      m.totalPaise += t.amountPaise;
      m.count += 1;
      merchants.set(t.merchantNorm, m);
    }

    if (isEssential(t.category)) essentialPaise += t.amountPaise;
    else nonEssentialPaise += t.amountPaise;

    if (t.amountPaise < SMALL_LEAK_LIMIT_PAISE) {
      leakCount += 1;
      leakTotal += t.amountPaise;
    }
  }

  res.status(200).json({
    totalSpendPaise: netSpend(txs),
    categoryTotals: [...categories.entries()]
      .map(([category, v]) => ({ category, ...v }))
      .sort((a, b) => b.totalPaise - a.totalPaise),
    smallLeaks: { count: leakCount, totalPaise: leakTotal },
    topMerchants: [...merchants.entries()]
      .map(([merchantNorm, v]) => ({ merchantNorm, ...v }))
      .sort((a, b) => b.totalPaise - a.totalPaise || b.count - a.count)
      .slice(0, 3),
    essentialSplit: { essentialPaise, nonEssentialPaise },
    cycle: { ...cycle, daysRemaining: daysLeftInCycle(today, cycle) },
  });
});

// GET /api/v1/insights/daily — one row per day from cycle start to today (refunds net off)
insightsRouter.get('/daily', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const data = await loadCycle(userIdOf(req));
  if (!data) {
    problem(res, 404, 'User not found');
    return;
  }
  const { today, cycle, txs } = data;

  const days = new Map<DateKey, { totalSpendPaise: number; count: number }>();
  for (let key = cycle.start; key <= today; key = addDays(key, 1)) {
    days.set(key, { totalSpendPaise: 0, count: 0 });
  }

  for (const t of txs) {
    const day = days.get(toDateKey(t.occurredAt));
    if (!day) continue;
    if (countsAsSpend(t)) {
      day.totalSpendPaise += t.amountPaise;
      day.count += 1;
    } else if (countsAsRefund(t)) {
      day.totalSpendPaise = Math.max(0, day.totalSpendPaise - t.amountPaise);
    }
  }

  res.status(200).json([...days.entries()].map(([dateKey, v]) => ({ dateKey, ...v })));
});
