import cron, { type ScheduledTask } from 'node-cron';
import { getDb } from '../db/mongo.js';
import { UserDoc, FixedExpenseDoc, TransactionDoc, DailySummaryDoc } from '../db/models.js';
import {
  addDays,
  computeTodayBudget,
  countsAsSpend,
  cycleFor,
  daysLeftInCycle,
  endOfDayMs,
  netSpend,
  startOfDayMs,
  toDateKey,
  type DateKey,
} from '../domain.js';

/** Builds yesterday's summary for every user at 00:00 IST. */
export function startDailySummaryCron(): ScheduledTask {
  const task = cron.schedule(
    '0 0 * * *',
    async () => {
      try {
        await executeDailySummaryJob();
      } catch (err) {
        console.error('[DailySummaryJob] Job failed:', err instanceof Error ? err.message : err);
      }
    },
    { timezone: 'Asia/Kolkata' },
  );
  console.log('[DailySummaryJob] Scheduled nightly at 00:00 Asia/Kolkata');
  return task;
}

export async function executeDailySummaryJob(nowMs: number = Date.now()): Promise<number> {
  const day = addDays(toDateKey(nowMs), -1);
  const users = await getDb().collection<UserDoc>('users').find({}).toArray();

  let built = 0;
  for (const user of users) {
    try {
      await buildSummaryForUser(user, day);
      built++;
    } catch (err) {
      console.error(`[DailySummaryJob] Failed for one user:`, err instanceof Error ? err.message : err);
    }
  }
  console.log(`[DailySummaryJob] Built ${built}/${users.length} summaries for ${day}.`);
  return built;
}

export async function buildSummaryForUser(user: UserDoc, day: DateKey): Promise<DailySummaryDoc> {
  const db = getDb();
  const cycle = cycleFor(day, user.payday ?? 1);

  const fixedExpenses = await db.collection<FixedExpenseDoc>('fixedExpenses').find({ userId: user.id }).toArray();
  const totalFixed = fixedExpenses.reduce((sum, f) => sum + f.amountPaise, 0);
  const spendable = (user.salaryPaise ?? 0) - totalFixed - (user.savingsGoalPaise ?? 0);

  const cycleTxs = await db
    .collection<TransactionDoc>('transactions')
    .find({ userId: user.id, occurredAt: { $gte: startOfDayMs(cycle.start), $lte: endOfDayMs(day) } })
    .toArray();

  const dayStart = startOfDayMs(day);
  const before = cycleTxs.filter((t) => t.occurredAt < dayStart);
  const onDay = cycleTxs.filter((t) => t.occurredAt >= dayStart);

  const categorySpend = new Map<string, number>();
  for (const t of onDay.filter(countsAsSpend)) {
    categorySpend.set(t.category, (categorySpend.get(t.category) ?? 0) + t.amountPaise);
  }
  let topCategory: string | null = null;
  let topSpend = 0;
  for (const [category, spend] of categorySpend) {
    if (spend > topSpend) {
      topSpend = spend;
      topCategory = category;
    }
  }

  const summary: DailySummaryDoc = {
    id: `${user.id}_${day}`,
    userId: user.id,
    dateKey: day,
    budgetPaise: computeTodayBudget(spendable, netSpend(before), daysLeftInCycle(day, cycle)),
    spentPaise: netSpend(onDay),
    topCategory,
    calculatedAt: new Date(),
  };

  await db
    .collection<DailySummaryDoc>('dailySummaries')
    .updateOne({ userId: user.id, dateKey: day }, { $set: summary }, { upsert: true });
  return summary;
}
