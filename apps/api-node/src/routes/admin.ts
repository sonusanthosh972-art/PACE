import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { getDb } from '../db/mongo.js';
import { UserDoc, TransactionDoc, FixedExpenseDoc, DailySummaryDoc } from '../db/models.js';
import { addDays, cycleFor, daysLeftInCycle, startOfDayMs, toDateKey, DAY_MS } from '../domain.js';
import { validationProblem } from '../http.js';
import { rateLimitHits24h } from '../metrics.js';

/** Operator dashboard API. Mounted behind requireAdminKey in app.ts. */
export const adminRouter = Router();

const ACTIVE_WINDOW_MS = 7 * DAY_MS;
const NEAR_LIMIT_RATIO = 0.8;

const limitQuery = z.object({ limit: z.coerce.number().int().min(1).max(500).default(100) });
const pageQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(500).default(100),
});

async function userNames(): Promise<Map<string, string>> {
  const users = await getDb()
    .collection<UserDoc>('users')
    .find({}, { projection: { id: 1, name: 1 } })
    .toArray();
  return new Map(users.map((u) => [u.id, u.name]));
}

// GET /api/v1/admin/stats
adminRouter.get('/stats', async (_req: Request, res: Response) => {
  const db = getDb();
  const now = Date.now();
  const today = toDateKey(now);
  const transactions = db.collection<TransactionDoc>('transactions');

  const pingStarted = performance.now();
  await db.command({ ping: 1 });
  const latencyMs = Math.round(performance.now() - pingStarted);

  const [
    totalUsers,
    totalTransactionsCount,
    excludedCount,
    activeUserIds,
    activeUserIds24h,
    volume,
    todayVolume,
    fixed,
    savings,
    budgets,
  ] = await Promise.all([
    db.collection('users').countDocuments(),
    transactions.countDocuments(),
    transactions.countDocuments({ isExcluded: true }),
    transactions.distinct('userId', { updatedAt: { $gte: now - ACTIVE_WINDOW_MS } }),
    transactions.distinct('userId', { updatedAt: { $gte: now - DAY_MS } }),
    transactions
      .aggregate<{ total: number }>([
        { $match: { direction: 'debit', isExcluded: false } },
        { $group: { _id: null, total: { $sum: '$amountPaise' } } },
      ])
      .toArray(),
    transactions
      .aggregate<{ total: number }>([
        { $match: { direction: 'debit', isExcluded: false, occurredAt: { $gte: startOfDayMs(today) } } },
        { $group: { _id: null, total: { $sum: '$amountPaise' } } },
      ])
      .toArray(),
    db
      .collection<FixedExpenseDoc>('fixedExpenses')
      .aggregate<{ total: number }>([{ $group: { _id: null, total: { $sum: '$amountPaise' } } }])
      .toArray(),
    db
      .collection<UserDoc>('users')
      .aggregate<{ total: number }>([{ $group: { _id: null, total: { $sum: '$savingsGoalPaise' } } }])
      .toArray(),
    db
      .collection<DailySummaryDoc>('dailySummaries')
      .aggregate<{ avg: number }>([
        { $match: { dateKey: addDays(today, -1) } },
        { $group: { _id: null, avg: { $avg: '$budgetPaise' } } },
      ])
      .toArray(),
  ]);

  res.status(200).json({
    stats: {
      totalUsers,
      activeUsers: activeUserIds.length,
      totalVolumePaise: volume[0]?.total ?? 0,
      totalTransactionsCount,
      totalFixedExpensesPaise: fixed[0]?.total ?? 0,
      totalSavingsGoalsPaise: savings[0]?.total ?? 0,
      todayVolumePaise: todayVolume[0]?.total ?? 0,
      avgDailyBudgetPaise: Math.round(budgets[0]?.avg ?? 0),
      exclusionRatio: totalTransactionsCount > 0 ? Number((excludedCount / totalTransactionsCount).toFixed(3)) : 0,
    },
    health: {
      database: 'connected',
      latencyMs,
      activeUsers24h: activeUserIds24h.length,
      rateLimitHits: rateLimitHits24h(),
      totalSyncedTxs: totalTransactionsCount,
      memoryUsageMb: Math.round((process.memoryUsage().heapUsed / 1024 / 1024) * 10) / 10,
      uptimeHours: Math.round((process.uptime() / 3600) * 10) / 10,
    },
    timestamp: now,
  });
});

// GET /api/v1/admin/users?page&pageSize — newest accounts first
adminRouter.get('/users', async (req: Request, res: Response) => {
  const parse = pageQuery.safeParse(req.query);
  if (!parse.success) {
    validationProblem(res, parse.error);
    return;
  }
  const { page, pageSize } = parse.data;
  const db = getDb();
  const now = Date.now();
  const [users, total] = await Promise.all([
    db
      .collection<UserDoc>('users')
      .find({}, { projection: { passwordHash: 0, refreshTokenHash: 0 } })
      .sort({ createdAt: -1, id: 1 })
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .toArray(),
    db.collection<UserDoc>('users').countDocuments(),
  ]);
  // Activity only for the users on this page (uses the userId index instead of scanning everything).
  const activity = await db
    .collection<TransactionDoc>('transactions')
    .aggregate<{ _id: string; count: number; lastAt: number }>([
      { $match: { userId: { $in: users.map((u) => u.id) } } },
      { $group: { _id: '$userId', count: { $sum: 1 }, lastAt: { $max: '$updatedAt' } } },
    ])
    .toArray();
  const byUser = new Map(activity.map((a) => [a._id, a]));

  const mapped = users.map((u) => {
    const a = byUser.get(u.id);
    const lastActiveAt = Math.max(new Date(u.updatedAt).getTime(), a?.lastAt ?? 0);
    const status = !(u.salaryPaise > 0) ? 'pending_setup' : now - lastActiveAt <= ACTIVE_WINDOW_MS ? 'active' : 'idle';
    return {
      id: u.id,
      email: u.email,
      name: u.name,
      salaryPaise: u.salaryPaise ?? 0,
      payday: u.payday ?? 1,
      savingsGoalPaise: u.savingsGoalPaise ?? 0,
      timezone: u.timezone || 'Asia/Kolkata',
      createdAt: new Date(u.createdAt).getTime(),
      lastActiveAt,
      txCount: a?.count ?? 0,
      status,
    };
  });

  res.status(200).json({ users: mapped, total, page, pageSize, totalPages: Math.ceil(total / pageSize) });
});

// GET /api/v1/admin/transactions?limit
adminRouter.get('/transactions', async (req: Request, res: Response) => {
  const parse = limitQuery.safeParse(req.query);
  if (!parse.success) {
    validationProblem(res, parse.error);
    return;
  }
  const [txs, names] = await Promise.all([
    getDb()
      .collection<TransactionDoc>('transactions')
      .find({}, { projection: { _id: 0 } })
      .sort({ occurredAt: -1 })
      .limit(parse.data.limit)
      .toArray(),
    userNames(),
  ]);

  const mapped = txs.map((t) => ({ ...t, merchantNorm: t.merchantNorm ?? '', userName: names.get(t.userId) ?? 'Unknown user' }));
  res.status(200).json({ transactions: mapped, total: mapped.length });
});

// GET /api/v1/admin/fixed-expenses
adminRouter.get('/fixed-expenses', async (_req: Request, res: Response) => {
  const [items, names] = await Promise.all([
    getDb().collection<FixedExpenseDoc>('fixedExpenses').find({}, { projection: { _id: 0 } }).sort({ dueDay: 1 }).toArray(),
    userNames(),
  ]);
  const mapped = items.map((f) => ({
    ...f,
    userName: names.get(f.userId) ?? 'Unknown user',
    frequency: 'monthly',
    category: 'rent_emi',
  }));
  res.status(200).json({ fixedExpenses: mapped, total: mapped.length });
});

// GET /api/v1/admin/summaries?limit — nightly job output, newest first
adminRouter.get('/summaries', async (req: Request, res: Response) => {
  const parse = limitQuery.safeParse(req.query);
  if (!parse.success) {
    validationProblem(res, parse.error);
    return;
  }
  const db = getDb();
  const [summaries, users] = await Promise.all([
    db.collection<DailySummaryDoc>('dailySummaries').find({}).sort({ dateKey: -1 }).limit(parse.data.limit).toArray(),
    db.collection<UserDoc>('users').find({}, { projection: { id: 1, name: 1, payday: 1 } }).toArray(),
  ]);
  const userById = new Map(users.map((u) => [u.id, u]));

  // Consecutive on-budget days per user, counted oldest → newest within the fetched window.
  const streaks = new Map<string, number>();
  const streakAt = new Map<DailySummaryDoc, number>();
  for (const s of [...summaries].reverse()) {
    const next = s.spentPaise <= s.budgetPaise ? (streaks.get(s.userId) ?? 0) + 1 : 0;
    streaks.set(s.userId, next);
    streakAt.set(s, next);
  }

  const mapped = summaries.map((s) => {
    const user = userById.get(s.userId);
    const cycle = cycleFor(s.dateKey, user?.payday ?? 1);
    const status =
      s.spentPaise > s.budgetPaise ? 'overspent' : s.spentPaise >= s.budgetPaise * NEAR_LIMIT_RATIO ? 'near_limit' : 'on_track';
    return {
      date: s.dateKey,
      userId: s.userId,
      userName: user?.name ?? 'Unknown user',
      budgetPaise: s.budgetPaise,
      spentPaise: s.spentPaise,
      remainingPaise: s.budgetPaise - s.spentPaise,
      daysLeft: daysLeftInCycle(s.dateKey, cycle),
      streak: streakAt.get(s) ?? 0,
      status,
    };
  });
  res.status(200).json({ summaries: mapped, total: mapped.length });
});
