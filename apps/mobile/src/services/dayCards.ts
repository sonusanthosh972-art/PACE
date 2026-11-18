/**
 * Decides whether a day card is due and builds it from the real numbers in the database.
 * Each card is claimed with an atomic once-per-key record, so it shows at most once per day,
 * across screens, app restarts and two checks racing each other.
 */
import { dayResults, getOrFreezeBudget, getSnapshot } from '@/data/budgetRepo';
import type { SqlDb } from '@/data/db';
import { getProfile } from '@/data/profileRepo';
import { getSettings, hasMark, markOnce } from '@/data/settingsRepo';
import { budgetStartInCycle, type BudgetProfile } from '@/domain/budget';
import {
  cardKey,
  dueCard,
  morningCard,
  nightCard,
  type DayCard,
  type DayCardKind,
} from '@/domain/dayCards';
import { addDays, toDateKey } from '@/domain/time';

export async function buildDayCard(
  db: SqlDb,
  profile: BudgetProfile,
  kind: DayCardKind,
  now: number,
): Promise<DayCard> {
  const snapshot = await getSnapshot(db, profile, now);
  if (kind === 'night') {
    return nightCard({
      budgetPaise: snapshot.todayBudgetPaise,
      spentPaise: snapshot.spentTodayPaise,
      nextDaysAveragePaise: snapshot.nextDaysAveragePaise,
    });
  }

  const today = toDateKey(now);
  const yesterday = addDays(today, -1);
  const newCycle = today === snapshot.cycle.start;
  // Compare with yesterday only when it was a budgeted day of this cycle. Its allowance comes from
  // the stored value (or is worked out now from the payments, if the app was closed all day) and
  // its spending from the recorded payments, never from what an earlier card said.
  let y: { budgetPaise: number; spentPaise: number } | null = null;
  if (!newCycle && yesterday >= budgetStartInCycle(snapshot.cycle, profile.startDate)) {
    await getOrFreezeBudget(db, profile, yesterday, now);
    const [row] = await dayResults(db, yesterday, today);
    y = row ? { budgetPaise: row.budgetPaise, spentPaise: row.spentPaise } : null;
  }
  return morningCard({
    now,
    todayAllowancePaise: snapshot.todayBudgetPaise,
    yesterday: y,
    newCycle,
    daysLeft: snapshot.daysLeft,
  });
}

/**
 * Returns the card to show now and records it as shown, or null when none is due. The card is
 * built before it is recorded, so a failure never uses up the day's card.
 */
export async function claimDueCard(db: SqlDb, now: number): Promise<DayCard | null> {
  const [settings, profile] = await Promise.all([getSettings(db), getProfile(db)]);
  if (!settings.onboardingComplete || !profile) return null;

  const today = toDateKey(now);
  const [morningSeen, nightSeen] = await Promise.all([
    hasMark(db, cardKey('morning', today)),
    hasMark(db, cardKey('night', today)),
  ]);
  const kind = dueCard({ now, nightTime: settings.nightTime, morningSeen, nightSeen });
  if (!kind) return null;

  const card = await buildDayCard(db, profile, kind, now);
  if (!(await markOnce(db, cardKey(kind, today), now))) return null;
  return card;
}
