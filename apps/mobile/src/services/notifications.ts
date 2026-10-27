/**
 * Phase 6 — On-device notification scheduler.
 *
 * All notifications are local (expo-notifications), scheduled on the phone so they work
 * offline with no server. The schedule is recalculated whenever a payment arrives or the
 * app foregrounds, so the 10 pm night summary always has the right numbers.
 *
 * Notification types:
 *  1. Morning budget (configurable time, default 8 am)
 *  2. Live payment alert (instant, on each payment)
 *  3. 80% budget warning (at-most once per day)
 *  4. 100% budget warning (at-most once per day)
 *  5. Night summary (configurable time, default 10 pm)
 *  6. Weekly review (Sundays, configurable time, default 7 pm)
 */
import * as Notifications from 'expo-notifications';

import { getAppDb } from '@/data/appDb';
import { dayResults, getOrFreezeBudget, getSnapshot } from '@/data/budgetRepo';
import type { SqlDb } from '@/data/db';
import { getProfile } from '@/data/profileRepo';
import { getSettings, markOnce } from '@/data/settingsRepo';
import { listTransactions } from '@/data/transactionsRepo';
import {
  computeTodayBudget,
  countsAsSpend,
  cycleFor,
  daysLeftInCycle,
  spendableForCycle,
  totalSpend,
  type BudgetProfile,
  type BudgetSnapshot,
} from '@/domain/budget';
import type { InsightTx } from '@/domain/insights';
import { displayMerchant } from '@/domain/merchant';
import type { Paise } from '@/domain/money';
import { addDays, atTimeMs, dayOfWeek, startOfDayMs, toDateKey, type DateKey } from '@/domain/time';
import type { Transaction } from '@/domain/transaction';

import { registerNewTransactionHook } from './liveEvents';
import {
  liveAlertBody,
  morningBody,
  nightBody,
  warn100Body,
  warn80Body,
  weeklyBody,
  type LiveAlertInput,
  type MorningInput,
  type NightInput,
} from './notificationContent';

// ── Channels (Android) ───────────────────────────────────────────────────────

// Android channel settings (sound, importance) are fixed once created, so a settings change
// needs new ids. v1 channels were created with an invalid sound and are deleted on startup.
export const CHANNEL_SCHEDULED = 'scheduled-summaries-v2';
export const CHANNEL_LIVE = 'live-alerts-v2';
const RETIRED_CHANNELS = ['scheduled-summaries', 'live-alerts'];

// How many upcoming days to schedule ahead so notifications fire even if offline/unopened.
const SCHEDULE_AHEAD_DAYS = 7;

// ── Setup ────────────────────────────────────────────────────────────────────

let channelsConfigured = false;

/** Call once at app startup to configure notification channels + foreground handler. */
export async function initNotifications(): Promise<void> {
  if (channelsConfigured) return;
  channelsConfigured = true;

  for (const id of RETIRED_CHANNELS) {
    await Notifications.deleteNotificationChannelAsync(id).catch(() => undefined);
  }
  await Notifications.setNotificationChannelAsync(CHANNEL_SCHEDULED, {
    name: 'Daily summaries',
    importance: Notifications.AndroidImportance.DEFAULT,
    // No `sound` key = the system default sound. A string here must name a bundled sound file.
  });
  await Notifications.setNotificationChannelAsync(CHANNEL_LIVE, {
    name: 'Live payment alerts',
    importance: Notifications.AndroidImportance.HIGH,
  });

  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
}

// Register the transaction hook synchronously so background SMS headless task
// cannot miss incoming payments before channel setup completes.
registerNewTransactionHook(onNewTransactionsHook);

// ── Scheduled notifications ──────────────────────────────────────────────────

/**
 * Cancels all previously scheduled notifications and schedules the next 7 days
 * based on current data and settings. Call this on:
 *   - App foreground / bootstrap
 *   - Settings change (notification times, enable/disable)
 *   - After any new transaction lands (to recalculate summaries with fresh spend)
 */
export async function rescheduleAll(now: number = Date.now()): Promise<void> {
  const db = await getAppDb();
  const [settings, profile] = await Promise.all([getSettings(db), getProfile(db)]);

  // Cancel any previously scheduled daily/weekly notifications.
  await cancelAllExistingScheduled();

  if (!settings.notificationsEnabled || !profile || !settings.onboardingComplete) return;

  const today = toDateKey(now);
  const snapshot = await getSnapshot(db, profile, now);

  // Schedule rolling N days of morning & night summaries
  for (let offset = 0; offset < SCHEDULE_AHEAD_DAYS; offset += 1) {
    const targetDay = addDays(today, offset);

    // 1. Morning budget
    const morningMs = atTimeMs(targetDay, settings.morningTime.hour, settings.morningTime.minute);
    if (morningMs > now) {
      const input = await buildMorningInput(db, profile, targetDay, today, snapshot, now);
      await scheduleAt(
        `morning:${targetDay}`,
        morningMs - now,
        'Good morning ☀️',
        morningBody(input),
        CHANNEL_SCHEDULED,
      );
    }

    // 2. Night summary
    const nightMs = atTimeMs(targetDay, settings.nightTime.hour, settings.nightTime.minute);
    if (nightMs > now) {
      const input = await buildNightInput(db, profile, targetDay, today, snapshot, now);
      await scheduleAt(
        `night:${targetDay}`,
        nightMs - now,
        'Day wrap-up 🌙',
        nightBody(input),
        CHANNEL_SCHEDULED,
      );
    }
  }

  // 3. Weekly review (Sundays)
  const dow = dayOfWeek(today); // 0=Sunday
  const daysUntilSunday = dow === 0 ? 0 : 7 - dow;
  const nextSunday = addDays(today, daysUntilSunday);
  const weeklyMs = atTimeMs(nextSunday, settings.weeklyTime.hour, settings.weeklyTime.minute);
  if (weeklyMs > now) {
    const input = await buildWeeklyInput(db, nextSunday);
    await scheduleAt(
      `weekly:${nextSunday}`,
      weeklyMs - now,
      'Your week in review 📊',
      weeklyBody(input),
      CHANNEL_SCHEDULED,
    );
  }
}

// ── Live alert on each payment ───────────────────────────────────────────────

export async function onNewTransactionsHook(
  db: SqlDb,
  inserted: readonly Transaction[],
): Promise<void> {
  const settings = await getSettings(db);
  if (!settings.notificationsEnabled || !settings.liveAlertsEnabled) return;
  if (!settings.onboardingComplete) return;

  const profile = await getProfile(db);
  if (!profile) return;

  const now = Date.now();
  const today = toDateKey(now);
  const snapshot = await getSnapshot(db, profile, now);

  for (const tx of inserted) {
    if (tx.direction !== 'debit') continue;
    if (tx.isExcluded) continue;
    if (toDateKey(tx.occurredAt) !== today) continue;

    const input: LiveAlertInput = {
      amountPaise: tx.amountPaise,
      merchant: tx.merchant,
      vpa: tx.vpa,
      category: tx.category,
      remainingTodayPaise: snapshot.remainingTodayPaise,
    };
    await fireImmediate('Payment', liveAlertBody(input), CHANNEL_LIVE);
  }

  // Budget warnings (at-most once per day each)
  await maybeWarn80(db, snapshot, today, now);
  await maybeWarn100(db, snapshot, today, now);

  // Recalculate upcoming summaries with fresh numbers
  await rescheduleAll(now);
}

async function maybeWarn80(
  db: SqlDb,
  snap: BudgetSnapshot,
  today: DateKey,
  now: number,
): Promise<void> {
  if (snap.todayBudgetPaise <= 0) return;
  if (snap.usedRatio < 0.8) return;
  const sent = await markOnce(db, `warn80:${today}`, now);
  if (!sent) return;
  await fireImmediate(
    'Budget warning ⚠️',
    warn80Body(snap.spentTodayPaise, snap.todayBudgetPaise),
    CHANNEL_LIVE,
  );
}

async function maybeWarn100(
  db: SqlDb,
  snap: BudgetSnapshot,
  today: DateKey,
  now: number,
): Promise<void> {
  if (snap.todayBudgetPaise <= 0) return;
  if (snap.usedRatio < 1) return;
  const sent = await markOnce(db, `warn100:${today}`, now);
  if (!sent) return;
  await fireImmediate(
    'Over budget 🚨',
    warn100Body(snap.spentTodayPaise, snap.todayBudgetPaise),
    CHANNEL_LIVE,
  );
}

// ── Data builders ────────────────────────────────────────────────────────────

/**
 * Computes the projected budget for a day WITHOUT prematurely inserting into `daily_budgets`.
 * Future days are projected from current spend; only the current day is frozen in DB.
 */
async function computeProjectedBudget(
  db: SqlDb,
  profile: BudgetProfile,
  targetDay: DateKey,
  today: DateKey,
  now: number,
): Promise<Paise> {
  // If targetDay is today, get or freeze today's actual budget
  if (targetDay === today) {
    return getOrFreezeBudget(db, profile, today, now);
  }

  // If targetDay is in the past, look up frozen or historical budget
  if (targetDay < today) {
    const existing = await db.getFirstAsync<{ budget_paise: number }>(
      'SELECT budget_paise FROM daily_budgets WHERE date = ?',
      [targetDay],
    );
    if (existing) return existing.budget_paise;
  }

  // For future days: compute projected budget without writing to daily_budgets table!
  const cycle = cycleFor(targetDay, profile.payday);
  const spentBefore = totalSpend(
    await listTransactions(db, {
      from: startOfDayMs(cycle.start),
      to: startOfDayMs(targetDay),
      limit: 100_000,
    }),
  );
  return computeTodayBudget({
    spendablePaise: spendableForCycle(profile),
    spentBeforeTodayPaise: spentBefore,
    daysLeft: daysLeftInCycle(targetDay, cycle),
  });
}

async function buildMorningInput(
  db: SqlDb,
  profile: BudgetProfile,
  targetDay: DateKey,
  today: DateKey,
  todaySnapshot: BudgetSnapshot,
  now: number,
): Promise<MorningInput> {
  const budget = await computeProjectedBudget(db, profile, targetDay, today, now);
  const yesterday = addDays(targetDay, -1);

  if (targetDay === today) {
    // Yesterday is fully elapsed in the past
    const yRows = await dayResults(db, yesterday, targetDay);
    const y = yRows[0];
    return {
      todayBudgetPaise: budget,
      yesterdayBudgetPaise: y?.budgetPaise ?? null,
      yesterdaySpentPaise: y?.spentPaise ?? null,
    };
  }

  if (targetDay === addDays(today, 1)) {
    // Target is tomorrow — yesterday is today, so use today's current snapshot!
    return {
      todayBudgetPaise: budget,
      yesterdayBudgetPaise: todaySnapshot.todayBudgetPaise,
      yesterdaySpentPaise: todaySnapshot.spentTodayPaise,
    };
  }

  // Further future days
  return {
    todayBudgetPaise: budget,
    yesterdayBudgetPaise: null,
    yesterdaySpentPaise: null,
  };
}

async function buildNightInput(
  db: SqlDb,
  profile: BudgetProfile,
  targetDay: DateKey,
  today: DateKey,
  todaySnapshot: BudgetSnapshot,
  now: number,
): Promise<NightInput> {
  if (targetDay === today) {
    const todayStart = startOfDayMs(today);
    const todayEnd = startOfDayMs(addDays(today, 1));
    const txs = await listTransactions(db, { from: todayStart, to: todayEnd, limit: 10_000 });

    const byMerchant = new Map<string, { merchant: string; totalPaise: Paise; count: number }>();
    for (const tx of txs) {
      // Must use countsAsSpend so rent, EMIs, investments and excluded transactions are NOT counted as leaks
      if (!countsAsSpend(tx)) continue;
      const name = displayMerchant(tx.merchant, tx.vpa);
      const key = tx.merchantNorm || name;
      const entry = byMerchant.get(key) ?? { merchant: name, totalPaise: 0, count: 0 };
      entry.totalPaise += tx.amountPaise;
      entry.count += 1;
      byMerchant.set(key, entry);
    }
    let biggestLeak: NightInput['biggestLeak'] = null;
    for (const entry of byMerchant.values()) {
      if (!biggestLeak || entry.totalPaise > biggestLeak.totalPaise) {
        biggestLeak = entry;
      }
    }

    return {
      budgetPaise: todaySnapshot.todayBudgetPaise,
      spentPaise: todaySnapshot.spentTodayPaise,
      biggestLeak,
    };
  }

  // Projected night summary for future days (0 spend projected)
  const budget = await computeProjectedBudget(db, profile, targetDay, today, now);
  return {
    budgetPaise: budget,
    spentPaise: 0,
    biggestLeak: null,
  };
}

async function buildWeeklyInput(
  db: SqlDb,
  endDay: DateKey,
): Promise<{ weekTxs: readonly InsightTx[] }> {
  const startDay = addDays(endDay, -6);
  const txs = await listTransactions(db, {
    from: startOfDayMs(startDay),
    to: startOfDayMs(addDays(endDay, 1)),
    limit: 100_000,
  });
  const weekTxs: InsightTx[] = txs.map((t) => ({
    ...t,
    merchantDisplay: displayMerchant(t.merchant, t.vpa),
  }));
  return { weekTxs };
}

// ── Low-level notification wrappers ──────────────────────────────────────────

async function scheduleAt(
  id: string,
  delayMs: number,
  title: string,
  body: string,
  channelId: string,
): Promise<void> {
  const seconds = Math.max(1, Math.round(delayMs / 1000));
  await Notifications.scheduleNotificationAsync({
    identifier: id,
    content: { title, body, sound: 'default' },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds,
      repeats: false,
      channelId,
    },
  });
}

async function fireImmediate(title: string, body: string, channelId: string): Promise<void> {
  await Notifications.scheduleNotificationAsync({
    content: { title, body, sound: 'default' },
    trigger: { channelId },
  });
}

async function cancelAllExistingScheduled(): Promise<void> {
  try {
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    const toCancel = scheduled.filter(
      (n) =>
        n.identifier.startsWith('morning') ||
        n.identifier.startsWith('night') ||
        n.identifier.startsWith('weekly'),
    );
    await Promise.all(
      toCancel.map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier)),
    );
  } catch {
    // If scheduler query fails, proceed gracefully
  }
}
