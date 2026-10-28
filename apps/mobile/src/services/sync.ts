import NetInfo from '@react-native-community/netinfo';

import { getAppDb } from '@/data/appDb';
import type { SqlDb } from '@/data/db';
import { getProfile, markProfileSynced, profileNeedsSync } from '@/data/profileRepo';
import { getSettings } from '@/data/settingsRepo';
import {
  markDeletesSynced,
  markSynced,
  pendingDeletes,
  pendingSync,
} from '@/data/transactionsRepo';
import { useAuthStore } from '@/state/authStore';

import { registerRemoteWipe } from './actions';
import { apiClient, ApiError, testConnection } from './api/client';
import {
  deleteResultSchema,
  fixedExpensesListSchema,
  syncResultSchema,
  userProfileSchema,
} from './api/schemas';
import { clearTokens } from './api/tokens';
import { registerLocalChangeHook, registerNewTransactionHook } from './liveEvents';

const BACKOFF_DELAYS_MS = [5_000, 30_000, 120_000, 300_000]; // 5s, 30s, 2min, 5min

let retryAttempt = 0;
let retryTimeoutId: ReturnType<typeof setTimeout> | null = null;
let probeIntervalId: ReturnType<typeof setInterval> | null = null;
let isSyncing = false;

// Register remote account deletion with actions.ts
registerRemoteWipe(async () => {
  const isAuth = useAuthStore.getState().isAuthenticated;
  if (!isAuth) return;

  // Calls DELETE /api/v1/me. If server is unreachable, throws ApiError
  // ensuring device data isn't wiped while server data remains.
  await apiClient('/api/v1/me', { method: 'DELETE' });
  await clearTokens();
  useAuthStore.getState().setUser(null);
  useAuthStore.getState().setSyncStatus('idle');
});

// Automatically trigger sync when new transactions arrive locally
registerNewTransactionHook(async (db) => {
  if (useAuthStore.getState().isAuthenticated) {
    scheduleSync(db, 1000);
  }
});

// Edits, deletes and budget changes made on the phone go up shortly after
registerLocalChangeHook((db) => {
  if (useAuthStore.getState().isAuthenticated) {
    scheduleSync(db, 1000);
  }
});

// Listen for network connectivity coming back via NetInfo
NetInfo.addEventListener((state) => {
  if (state.isConnected && state.isInternetReachable !== false) {
    if (useAuthStore.getState().isAuthenticated) {
      const status = useAuthStore.getState().syncStatus;
      if (status === 'offline' || status === 'retrying') {
        syncNow().catch(() => undefined);
      }
    }
  }
});

function clearScheduledRetry(): void {
  if (retryTimeoutId !== null) {
    clearTimeout(retryTimeoutId);
    retryTimeoutId = null;
  }
  if (probeIntervalId !== null) {
    clearInterval(probeIntervalId);
    probeIntervalId = null;
  }
}

function startReconnectionProbe(): void {
  if (probeIntervalId !== null) return;

  probeIntervalId = setInterval(async () => {
    const auth = useAuthStore.getState();
    if (
      !auth.isAuthenticated ||
      (auth.syncStatus !== 'offline' && auth.syncStatus !== 'retrying')
    ) {
      if (probeIntervalId !== null) {
        clearInterval(probeIntervalId);
        probeIntervalId = null;
      }
      return;
    }

    const res = await testConnection();
    if (res.ok) {
      if (probeIntervalId !== null) {
        clearInterval(probeIntervalId);
        probeIntervalId = null;
      }
      syncNow().catch(() => undefined);
    }
  }, 8000);

  if (typeof (probeIntervalId as unknown as { unref?: () => void }).unref === 'function') {
    (probeIntervalId as unknown as { unref: () => void }).unref();
  }
}

/**
 * Executes a full sync iteration: sends pending transactions, profile, and fixed expenses.
 */
export async function syncNow(
  db?: SqlDb,
): Promise<{ syncedTransactions: number; syncedProfile: boolean }> {
  const auth = useAuthStore.getState();
  if (!auth.isAuthenticated) {
    return { syncedTransactions: 0, syncedProfile: false };
  }

  if (isSyncing) {
    return { syncedTransactions: 0, syncedProfile: false };
  }

  isSyncing = true;
  let database: SqlDb | undefined = db;
  let syncedTransactions = 0;
  let syncedProfile = false;

  try {
    database = database ?? (await getAppDb());
    const settings = await getSettings(database);
    if (settings.demoMode) {
      // Sample demo data must never sync to the server
      auth.setSyncStatus('idle');
      return { syncedTransactions: 0, syncedProfile: false };
    }
    auth.setSyncStatus('syncing');

    // 1. Send pending transactions in batches of up to 200
    while (true) {
      const pending = await pendingSync(database, 200);
      if (pending.length === 0) break;

      const payload = pending.map((tx) => ({
        id: tx.id,
        amountPaise: tx.amountPaise,
        direction: tx.direction,
        merchant: tx.merchant,
        merchantNorm: tx.merchantNorm,
        vpa: tx.vpa,
        mode: tx.mode,
        accountLast4: tx.accountLast4,
        upiRef: tx.upiRef,
        balancePaise: tx.balancePaise,
        category: tx.category,
        needsReview: tx.needsReview,
        note: tx.note,
        source: tx.source,
        occurredAt: tx.occurredAt,
        dedupeHash: tx.dedupeHash,
        isExcluded: tx.isExcluded,
        createdAt: tx.createdAt,
        updatedAt: tx.updatedAt,
      }));

      await apiClient(
        '/api/v1/transactions/sync',
        {
          method: 'POST',
          body: { transactions: payload },
        },
        syncResultSchema,
      );

      // Mark synced only if rows have not changed since being sent
      const sentTxs = pending.map((t) => ({ id: t.id, updatedAt: t.updatedAt }));
      await markSynced(database, sentTxs);
      syncedTransactions += pending.length;

      // If batch was smaller than limit, we're done
      if (pending.length < 200) break;
    }

    // 2. Send payments the user deleted
    while (true) {
      const deletes = await pendingDeletes(database, 200);
      if (deletes.length === 0) break;
      const hashes = deletes.map((d) => d.dedupeHash);
      await apiClient(
        '/api/v1/transactions/delete',
        { method: 'POST', body: { dedupeHashes: hashes } },
        deleteResultSchema,
      );
      await markDeletesSynced(database, hashes);
      if (deletes.length < 200) break;
    }

    // 3. Send pending profile and fixed expenses if changed
    const profileVersion = await profileNeedsSync(database);
    if (profileVersion !== null) {
      const profile = await getProfile(database);
      if (profile) {
        await apiClient(
          '/api/v1/me/profile',
          {
            method: 'PUT',
            body: {
              salaryPaise: profile.monthlySalaryPaise,
              payday: profile.payday,
              savingsGoalPaise: profile.monthlySavingsGoalPaise,
              budgetStartDate: profile.startDate ?? null,
            },
          },
          userProfileSchema,
        );

        await apiClient(
          '/api/v1/me/fixed-expenses',
          {
            method: 'PUT',
            body: profile.fixedExpenses.map((f) => ({
              id: f.id,
              name: f.name,
              amountPaise: f.amountPaise,
              dueDay: f.dueDay,
            })),
          },
          fixedExpensesListSchema,
        );

        await markProfileSynced(database, profileVersion);
        syncedProfile = true;
      }
    }

    // Sync succeeded: reset backoff, clear probe, and update status
    retryAttempt = 0;
    clearScheduledRetry();
    useAuthStore.getState().setSyncStatus('idle');
    useAuthStore.getState().setLastSyncedAt(Date.now());
    return { syncedTransactions, syncedProfile };
  } catch (err) {
    const isNetwork = err instanceof ApiError ? err.isNetworkError : false;
    const delay = BACKOFF_DELAYS_MS[Math.min(retryAttempt, BACKOFF_DELAYS_MS.length - 1)] ?? 5000;
    const retrySecs = Math.round(delay / 1000);

    retryAttempt++;

    if (isNetwork) {
      useAuthStore.getState().setSyncStatus('offline', 'Waiting for internet', retrySecs);
    } else {
      useAuthStore
        .getState()
        .setSyncStatus('retrying', "Couldn't reach server, retrying", retrySecs);
    }

    startReconnectionProbe();
    scheduleSync(database, delay);
    throw err;
  } finally {
    isSyncing = false;
  }
}

export function cancelScheduledSync(): void {
  clearScheduledRetry();
  retryAttempt = 0;
}

/**
 * Schedules a sync execution after a given delay.
 */
export function scheduleSync(db?: SqlDb, delayMs = 0): void {
  if (retryTimeoutId !== null) {
    clearTimeout(retryTimeoutId);
    retryTimeoutId = null;
  }

  if (delayMs <= 0) {
    syncNow(db).catch(() => undefined);
    return;
  }

  retryTimeoutId = setTimeout(() => {
    retryTimeoutId = null;
    syncNow(db).catch(() => undefined);
  }, delayMs);

  if (typeof (retryTimeoutId as unknown as { unref?: () => void }).unref === 'function') {
    (retryTimeoutId as unknown as { unref: () => void }).unref();
  }
}
