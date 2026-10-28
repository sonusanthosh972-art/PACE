import { clearBudgetsFrom } from '@/data/budgetRepo';
import type { SqlDb } from '@/data/db';
import {
  getProfile,
  markProfileSynced,
  replaceFixedExpenses,
  saveProfile,
} from '@/data/profileRepo';
import { isDeleted, type Clock } from '@/data/transactionsRepo';
import { toDateKey } from '@/domain/time';

import { apiClient } from './api/client';
import { fixedExpensesListSchema, pagedTransactionsSchema, userProfileSchema } from './api/schemas';
import { systemClock } from './clock';

export interface RestoreResult {
  restoredProfile: boolean;
  restoredTransactions: number;
}

const INSERT_TX_SQL = `INSERT INTO transactions (
  id, amount_paise, direction, account_last4, merchant, merchant_norm, vpa, mode, upi_ref,
  balance_paise, category, needs_review, note, source, occurred_at, dedupe_hash, is_excluded,
  created_at, updated_at, sync_state
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'synced')`;

const UPDATE_TX_SQL = `UPDATE transactions SET
  amount_paise = ?, direction = ?, account_last4 = ?, merchant = ?, merchant_norm = ?,
  vpa = ?, mode = ?, upi_ref = ?, balance_paise = ?, category = ?, needs_review = ?,
  note = ?, source = ?, occurred_at = ?, is_excluded = ?, updated_at = ?, sync_state = 'synced'
WHERE id = ?`;

/**
 * Downloads profile, fixed expenses, and all transactions from the server after signing in,
 * storing them in local SQLite storage with sync_state 'synced'.
 *
 * Guaranteed data safety:
 * - Never overwrites an existing local non-zero salary profile with zeros from a blank server account.
 * - Resolves both ID and dedupe_hash matches so importing bank SMS before signing in never fails.
 * - Protects unsynced local offline edits ('pending') from being overwritten by older server copies.
 */
export async function restoreFromServer(
  db: SqlDb,
  clock: Clock = systemClock,
): Promise<RestoreResult> {
  let restoredProfile = false;
  let restoredTransactions = 0;

  // 1. Download profile
  try {
    const localProfile = await getProfile(db);
    const remoteProfile = await apiClient('/api/v1/me/profile', {}, userProfileSchema);
    // Never overwrite an existing positive salary profile with zeroes from a blank server profile!
    const shouldRestoreProfile =
      remoteProfile &&
      (remoteProfile.salaryPaise > 0 || !localProfile || localProfile.monthlySalaryPaise === 0);

    if (shouldRestoreProfile) {
      await saveProfile(
        db,
        {
          monthlySalaryPaise: remoteProfile.salaryPaise,
          payday: remoteProfile.payday,
          monthlySavingsGoalPaise: remoteProfile.savingsGoalPaise,
        },
        clock,
        // Keep this phone's start date; on a fresh install use the account's.
        localProfile ? undefined : (remoteProfile.budgetStartDate ?? null),
      );
      restoredProfile = true;
    }
  } catch {
    // Profile might not exist yet on fresh accounts
  }

  // 2. Download fixed expenses
  try {
    const remoteExpenses = await apiClient(
      '/api/v1/me/fixed-expenses',
      {},
      fixedExpensesListSchema,
    );
    if (remoteExpenses && remoteExpenses.length > 0) {
      await replaceFixedExpenses(
        db,
        remoteExpenses.map((e) => ({
          name: e.name,
          amountPaise: e.amountPaise,
          dueDay: e.dueDay,
        })),
        clock,
      );
    }
    if (restoredProfile) {
      await markProfileSynced(db);
    }
  } catch {
    // No fixed expenses
  }

  // 3. Download transactions (paged)
  let page = 1;
  const pageSize = 100;
  let totalPages = 1;

  while (page <= totalPages) {
    const res = await apiClient(
      `/api/v1/transactions?page=${page}&pageSize=${pageSize}`,
      {},
      pagedTransactionsSchema,
    );

    totalPages = Math.max(1, res.totalPages);

    if (res.items.length > 0) {
      await db.withTransactionAsync(async () => {
        for (const tx of res.items) {
          // Deleted on this phone (delete not uploaded yet): never bring it back.
          if (await isDeleted(db, tx.dedupeHash)) continue;

          // Check for existing transaction by id OR dedupe_hash
          const existing = await db.getFirstAsync<{
            id: string;
            sync_state: string;
            updated_at: number;
          }>(
            'SELECT id, sync_state, updated_at FROM transactions WHERE id = ? OR dedupe_hash = ?',
            [tx.id, tx.dedupeHash],
          );

          if (existing) {
            // Protect offline unsynced edits: never overwrite pending edits with server copy!
            if (existing.sync_state === 'pending') {
              continue;
            }

            // Update existing row using its local ID to preserve identity and avoid UNIQUE dedupe_hash conflicts
            await db.runAsync(UPDATE_TX_SQL, [
              tx.amountPaise,
              tx.direction,
              tx.accountLast4,
              tx.merchant ?? null,
              tx.merchantNorm ?? '',
              tx.vpa ?? null,
              tx.mode,
              tx.upiRef,
              tx.balancePaise ?? null,
              tx.category,
              tx.needsReview ? 1 : 0,
              tx.note ?? null,
              tx.source,
              tx.occurredAt,
              tx.isExcluded ? 1 : 0,
              tx.updatedAt,
              existing.id,
            ]);
          } else {
            // Clean insert
            await db.runAsync(INSERT_TX_SQL, [
              tx.id,
              tx.amountPaise,
              tx.direction,
              tx.accountLast4,
              tx.merchant ?? null,
              tx.merchantNorm ?? '',
              tx.vpa ?? null,
              tx.mode,
              tx.upiRef,
              tx.balancePaise ?? null,
              tx.category,
              tx.needsReview ? 1 : 0,
              tx.note ?? null,
              tx.source,
              tx.occurredAt,
              tx.dedupeHash,
              tx.isExcluded ? 1 : 0,
              tx.createdAt,
              tx.updatedAt,
            ]);
          }
          restoredTransactions++;
        }
      });
    }

    page++;
  }

  // 4. Recompute daily budget with restored profile and transactions
  await clearBudgetsFrom(db, toDateKey(Date.now()));

  return { restoredProfile, restoredTransactions };
}
