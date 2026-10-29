import crypto from 'node:crypto';
import cron, { type ScheduledTask } from 'node-cron';
import { MongoServerError } from 'mongodb';
import { getDb } from '../db/mongo.js';
import { UserDoc, FixedExpenseDoc, TransactionDoc, DailySummaryDoc, JobLockDoc } from '../db/models.js';
import {
  addDays,
  countsAsSpend,
  cycleFor,
  dailyAllowance,
  endOfDayMs,
  netSpend,
  startOfDayMs,
  toDateKey,
  type DateKey,
} from '../domain.js';
import { logger } from '../logger.js';

/** How far back missing summaries are rebuilt (covers a server that slept for days). */
export const CATCH_UP_DAYS = 7;
const USER_BATCH = 500;
const CONCURRENCY = 5;
const LOCK_NAME = 'dailySummary';
const LOCK_TTL_MS = 30 * 60 * 1000;
const instanceId: string = crypto.randomUUID();

/**
 * Builds missing summaries every hour (Asia/Kolkata) and once at startup. A free-tier server that
 * was asleep at midnight therefore catches up as soon as it wakes. Safe to run repeatedly.
 */
export function startDailySummaryCron(): ScheduledTask {
  const run = async () => {
    try {
      await runCatchUp();
    } catch (err) {
      logger.error({ err }, '[DailySummaryJob] Job failed');
    }
  };
  const task = cron.schedule('5 * * * *', run, { timezone: 'Asia/Kolkata' });
  void run();
  logger.info('[DailySummaryJob] Scheduled hourly with catch-up (Asia/Kolkata)');
  return task;
}

/** Takes a lock shared by every API instance; false if another instance holds it. */
export async function acquireJobLock(name: string, ttlMs: number, owner = instanceId): Promise<boolean> {
  const now = new Date();
  try {
    await getDb()
      .collection<JobLockDoc>('jobLocks')
      .updateOne(
        { _id: name, lockedUntil: { $lt: now } },
        { $set: { lockedUntil: new Date(now.getTime() + ttlMs), owner } },
        { upsert: true },
      );
    return true;
  } catch (err) {
    if (err instanceof MongoServerError && err.code === 11000) return false; // held elsewhere
    throw err;
  }
}

export async function releaseJobLock(name: string, owner = instanceId): Promise<void> {
  await getDb().collection<JobLockDoc>('jobLocks').updateOne({ _id: name, owner }, { $set: { lockedUntil: new Date(0) } });
}

/** Builds every missing summary for the last CATCH_UP_DAYS completed days. Returns how many. */
export async function runCatchUp(nowMs: number = Date.now()): Promise<number> {
  if (!(await acquireJobLock(LOCK_NAME, LOCK_TTL_MS))) return 0;
  try {
    const today = toDateKey(nowMs);
    let built = 0;
    for (let back = CATCH_UP_DAYS; back >= 1; back--) {
      built += await buildMissingForDay(addDays(today, -back));
    }
    if (built > 0) logger.info({ built }, '[DailySummaryJob] Built missing summaries');
    return built;
  } finally {
    await releaseJobLock(LOCK_NAME);
  }
}

/** Builds yesterday's summary for every user (rebuilding existing ones). Kept for manual runs. */
export async function executeDailySummaryJob(nowMs: number = Date.now()): Promise<number> {
  return buildForDay(addDays(toDateKey(nowMs), -1), false);
}

async function buildMissingForDay(day: DateKey): Promise<number> {
  return buildForDay(day, true);
}

/** Processes users in batches with a few running at once; one user's failure never stops the rest. */
async function buildForDay(day: DateKey, onlyMissing: boolean): Promise<number> {
  const db = getDb();
  const done = onlyMissing
    ? new Set(await db.collection<DailySummaryDoc>('dailySummaries').distinct('userId', { dateKey: day }))
    : new Set<string>();

  // Accounts created after the day ended have nothing to summarise for it.
  const cursor = db
    .collection<UserDoc>('users')
    .find({ createdAt: { $lte: new Date(endOfDayMs(day)) } }, { projection: { passwordHash: 0, refreshTokenHash: 0 } })
    .batchSize(USER_BATCH);

  let built = 0;
  let batch: UserDoc[] = [];
  const flush = async () => {
    for (let i = 0; i < batch.length; i += CONCURRENCY) {
      const results = await Promise.allSettled(batch.slice(i, i + CONCURRENCY).map((u) => buildSummaryForUser(u, day)));
      for (const r of results) {
        if (r.status === 'fulfilled') built++;
        else logger.error({ err: r.reason }, '[DailySummaryJob] Failed for one user');
      }
    }
    batch = [];
  };

  for await (const user of cursor) {
    if (done.has(user.id)) continue;
    batch.push(user);
    if (batch.length >= USER_BATCH) await flush();
  }
  await flush();
  return built;
}

export async function buildSummaryForUser(user: UserDoc, day: DateKey): Promise<DailySummaryDoc> {
  const db = getDb();
  const cycle = cycleFor(day, user.payday ?? 1);

  const fixedExpenses = await db.collection<FixedExpenseDoc>('fixedExpenses').find({ userId: user.id }).toArray();
  const totalFixed = fixedExpenses.reduce((sum, f) => sum + f.amountPaise, 0);
  const spendable = (user.salaryPaise ?? 0) - totalFixed - (user.savingsGoalPaise ?? 0);

  // Only the day itself matters: the allowance is a fixed share of the month.
  const onDay = await db
    .collection<TransactionDoc>('transactions')
    .find({ userId: user.id, occurredAt: { $gte: startOfDayMs(day), $lte: endOfDayMs(day) } })
    .toArray();

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
    budgetPaise: dailyAllowance(spendable, cycle),
    spentPaise: netSpend(onDay),
    topCategory,
    calculatedAt: new Date(),
  };

  await db
    .collection<DailySummaryDoc>('dailySummaries')
    .updateOne({ userId: user.id, dateKey: day }, { $set: summary }, { upsert: true });
  return summary;
}
