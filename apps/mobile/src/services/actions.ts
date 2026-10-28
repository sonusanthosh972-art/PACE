import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import { getAppDb } from '@/data/appDb';
import { clearBudgetsFrom } from '@/data/budgetRepo';
import {
  replaceFixedExpenses,
  saveProfile,
  type FixedExpenseInput,
  type ProfileInput,
} from '@/data/profileRepo';
import { setSetting, wipeAllLocalData, type Settings } from '@/data/settingsRepo';
import {
  addManual,
  deleteTransaction,
  listTransactions,
  recategorise,
  setExcluded,
  type ManualEntry,
} from '@/data/transactionsRepo';
import type { CategoryId } from '@/domain/categories';
import { toDateKey } from '@/domain/time';
import type { Transaction } from '@/domain/transaction';
import { transactionsToCsv } from '@/lib/format';

import { clearTokens } from './api/tokens';
import { setBiometricEnabled } from './biometrics';
import { systemClock } from './clock';
import { onLocalChange, onNewTransactions } from './liveEvents';

export async function addManualTransaction(entry: ManualEntry): Promise<Transaction> {
  const db = await getAppDb();
  const tx = await addManual(db, entry, systemClock);
  await onNewTransactions(db, [tx]);
  return tx;
}

export async function recategoriseTransaction(id: string, category: CategoryId): Promise<number> {
  const db = await getAppDb();
  const changed = await recategorise(db, id, category, systemClock);
  onLocalChange(db);
  return changed;
}

export async function setTransactionExcluded(id: string, excluded: boolean): Promise<void> {
  const db = await getAppDb();
  await setExcluded(db, id, excluded, systemClock);
  onLocalChange(db);
}

export async function removeTransaction(id: string): Promise<void> {
  const db = await getAppDb();
  await deleteTransaction(db, id, systemClock);
  onLocalChange(db);
}

/** Saves salary/payday/savings and fixed expenses; today's frozen budget is recomputed. */
export async function saveBudgetSetup(
  profile: ProfileInput,
  fixedExpenses: readonly FixedExpenseInput[] | null,
): Promise<void> {
  const db = await getAppDb();
  await saveProfile(db, profile, systemClock);
  if (fixedExpenses) await replaceFixedExpenses(db, fixedExpenses, systemClock);
  await clearBudgetsFrom(db, toDateKey(Date.now()));
  onLocalChange(db);
}

export async function updateSetting<K extends keyof Settings>(
  key: K,
  value: Settings[K],
): Promise<void> {
  await setSetting(await getAppDb(), key, value);
}

/** Writes all transactions to a CSV in the cache directory and opens the share sheet. */
export async function exportCsv(): Promise<{ count: number }> {
  const db = await getAppDb();
  const txs = await listTransactions(db, { limit: 1_000_000 });
  const file = new File(Paths.cache, `paisa-pulse-${toDateKey(Date.now())}.csv`);
  if (file.exists) file.delete();
  file.create();
  file.write(transactionsToCsv(txs));
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(file.uri, {
      mimeType: 'text/csv',
      dialogTitle: 'Export transactions',
      UTI: 'public.comma-separated-values-text',
    });
  }
  return { count: txs.length };
}

type RemoteWipe = () => Promise<void>;
let remoteWipe: RemoteWipe | null = null;

/** Phase 8 registers the server-side delete here (DELETE /api/v1/me). */
export function registerRemoteWipe(fn: RemoteWipe): void {
  remoteWipe = fn;
}

/** "Delete all my data": server first (if signed in), then everything on the device. */
export async function deleteAllData(): Promise<void> {
  if (remoteWipe) {
    try {
      await remoteWipe();
    } catch {
      // Continue wiping local data even if remote server is unreachable
    }
  }
  await clearTokens();
  await setBiometricEnabled(false);
  await wipeAllLocalData(await getAppDb());
}

/**
 * Leaves "Explore with sample data": removes the sample payments and setup from this phone only,
 * so onboarding can start again with the real bank SMS. Sign-in and server data are untouched.
 */
export async function exitSampleData(): Promise<void> {
  await wipeAllLocalData(await getAppDb());
}
