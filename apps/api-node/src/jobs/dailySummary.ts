import cron from 'node-cron';
import { getDb } from '../db/mongo.js';
import { UserDoc, FixedExpenseDoc, TransactionDoc, DailySummaryDoc } from '../db/models.js';
import { computeCycle, countsAsSpend } from '../routes/insights.js';

export function startDailySummaryCron(): void {
  // Runs every day at 00:00 (Midnight IST = 18:30 UTC or set local time)
  // node-cron supports timezone parameter!
  cron.schedule(
    '0 0 * * *',
    async () => {
      console.log('[DailySummaryJob] Starting nightly daily summary job at midnight IST...');
      try {
        await executeDailySummaryJob();
      } catch (err: any) {
        console.error('[DailySummaryJob] Error executing job:', err);
      }
    },
    {
      timezone: 'Asia/Kolkata',
    }
  );
  console.log('[DailySummaryJob] Scheduled nightly cron job at 00:00 Asia/Kolkata');
}

export async function executeDailySummaryJob(): Promise<void> {
  const db = getDb();
  const users = await db.collection<UserDoc>('users').find({}).toArray();

  for (const user of users) {
    try {
      await buildSummaryForUser(user);
    } catch (err: any) {
      console.error(`[DailySummaryJob] Failed for user ${user.id}:`, err);
    }
  }

  console.log(`[DailySummaryJob] Completed summary build for ${users.length} users.`);
}

async function buildSummaryForUser(user: UserDoc): Promise<void> {
  const db = getDb();
  const now = new Date();
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  const yYear = yesterday.getFullYear();
  const yMonth = String(yesterday.getMonth() + 1).padStart(2, '0');
  const yDay = String(yesterday.getDate()).padStart(2, '0');
  const dateKey = `${yYear}-${yMonth}-${yDay}`;

  const cycle = computeCycle(yesterday, user.payday ?? 1);

  const fixedExpenses = await db.collection<FixedExpenseDoc>('fixedExpenses').find({ userId: user.id }).toArray();
  const totalFixed = fixedExpenses.reduce((sum, f) => sum + f.amountPaise, 0);
  const discretionary = Math.max(0, (user.salaryPaise ?? 0) - (user.savingsGoalPaise ?? 0) - totalFixed);

  const startMs = new Date(cycle.start.getFullYear(), cycle.start.getMonth(), cycle.start.getDate(), 0, 0, 0, 0).getTime();
  const yesterdayEndMs = new Date(yYear, Number(yMonth) - 1, Number(yDay), 23, 59, 59, 999).getTime();

  const cycleTxs = await db
    .collection<TransactionDoc>('transactions')
    .find({
      userId: user.id,
      occurredAt: { $gte: startMs, $lte: yesterdayEndMs },
    })
    .toArray();

  const spendTxs = cycleTxs.filter(countsAsSpend);

  const yesterdayStartMs = new Date(yYear, Number(yMonth) - 1, Number(yDay), 0, 0, 0, 0).getTime();
  const spendBeforeYesterday = spendTxs
    .filter((t) => t.occurredAt < yesterdayStartMs)
    .reduce((sum, t) => sum + t.amountPaise, 0);

  const yesterdayTxs = spendTxs.filter((t) => t.occurredAt >= yesterdayStartMs && t.occurredAt <= yesterdayEndMs);
  const spentYesterday = yesterdayTxs.reduce((sum, t) => sum + t.amountPaise, 0);

  const daysRemaining = Math.max(1, Math.ceil((cycle.end.getTime() - yesterday.getTime()) / (1000 * 60 * 60 * 24)));
  const budgetYesterday = Math.max(0, Math.floor((discretionary - spendBeforeYesterday) / daysRemaining));

  // Top category
  const catCount = new Map<string, number>();
  for (const t of yesterdayTxs) {
    catCount.set(t.category, (catCount.get(t.category) || 0) + t.amountPaise);
  }
  let topCategory: string | null = null;
  let maxCatSpend = 0;
  for (const [cat, spend] of catCount.entries()) {
    if (spend > maxCatSpend) {
      maxCatSpend = spend;
      topCategory = cat;
    }
  }

  const summaryDoc: DailySummaryDoc = {
    id: `${user.id}_${dateKey}`,
    userId: user.id,
    dateKey,
    budgetPaise: budgetYesterday,
    spentPaise: spentYesterday,
    topCategory,
    calculatedAt: new Date(),
  };

  await db.collection<DailySummaryDoc>('dailySummaries').updateOne(
    { userId: user.id, dateKey },
    { $set: summaryDoc },
    { upsert: true }
  );
}
