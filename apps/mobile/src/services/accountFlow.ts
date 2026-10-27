import type { SqlDb } from '@/data/db';
import { getProfile } from '@/data/profileRepo';
import { getSettings, setSetting, wipeAllLocalData } from '@/data/settingsRepo';
import { countTransactions } from '@/data/transactionsRepo';

import type { AuthResponse } from './api/schemas';
import { restoreFromServer } from './restore';
import { syncNow } from './sync';

/** Where the app goes after a successful sign-in or sign-up. Always follows the same order. */
export type NextStep = '/onboarding/salary' | '/onboarding/permissions' | '/(tabs)';

/**
 * The single, ordered account flow used by every sign-in entry point:
 *
 * 1. Authenticate with the server.
 * 2. Sample data never mixes with a real account: if "Explore with sample data" was on, the
 *    sample rows are wiped (the account email is kept).
 * 3. Sign in on an empty phone restores the account from the server; otherwise (and for a new
 *    account) local data is uploaded.
 * 4. Next step: budget setup if there is no salary yet → permissions (bank SMS import) if setup
 *    was never finished on this phone → Today.
 */
export async function completeAccountFlow(
  db: SqlDb,
  kind: 'login' | 'register',
  authenticate: () => Promise<AuthResponse>,
): Promise<NextStep> {
  const res = await authenticate();

  if ((await getSettings(db)).demoMode) {
    await wipeAllLocalData(db);
    await setSetting(db, 'accountEmail', res.user.email);
  }

  const localProfile = await getProfile(db);
  const localIsEmpty =
    (await countTransactions(db)) === 0 && (!localProfile || localProfile.monthlySalaryPaise === 0);

  if (kind === 'login' && localIsEmpty) {
    await restoreFromServer(db);
  } else {
    await syncNow(db);
  }

  const profile = await getProfile(db);
  if (!profile || profile.monthlySalaryPaise <= 0) return '/onboarding/salary';
  if (!(await getSettings(db)).onboardingComplete) return '/onboarding/permissions';
  return '/(tabs)';
}
