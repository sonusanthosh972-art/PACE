import { migrate, type SqlDb } from '@/data/db';
import { getFixedExpenses, getProfile, saveProfile } from '@/data/profileRepo';
import { createTestClock, createTestDb } from '@/data/testing/nodeSqliteDb';
import { countTransactions, listTransactions } from '@/data/transactionsRepo';
import { setApiBaseUrl } from '@/services/api/client';
import { clearTokens, saveTokens } from '@/services/api/tokens';
import { restoreFromServer } from '@/services/restore';

describe('restore service', () => {
  let db: SqlDb & { close(): void };
  let clock: ReturnType<typeof createTestClock>;
  const originalFetch = global.fetch;

  beforeEach(async () => {
    db = createTestDb();
    await migrate(db);
    clock = createTestClock();
    await clearTokens();
    setApiBaseUrl('http://test-server:5080');
    await saveTokens('jwt-token', 'refresh-token');
    jest.clearAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    db.close();
  });

  it('downloads profile, fixed expenses, and transactions and stores them as synced', async () => {
    global.fetch = jest.fn().mockImplementation(async (url: string) => {
      if (url.includes('/api/v1/me/profile')) {
        return {
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({
            id: 'u1',
            email: 'user@test.com',
            name: 'User',
            salaryPaise: 7500000,
            payday: 1,
            savingsGoalPaise: 2000000,
            timezone: 'Asia/Kolkata',
          }),
        };
      }
      if (url.includes('/api/v1/me/fixed-expenses')) {
        return {
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => [{ id: 'f1', name: 'Wifi', amountPaise: 100000, dueDay: 10 }],
        };
      }
      if (url.includes('/api/v1/transactions')) {
        return {
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({
            items: [
              {
                id: 'tx-remote-1',
                amountPaise: 25000,
                direction: 'debit',
                merchant: 'Blinkit',
                merchantNorm: 'blinkit',
                vpa: 'blinkit@icici',
                mode: 'UPI',
                accountLast4: '5678',
                upiRef: '987654321012',
                balancePaise: 500000,
                category: 'groceries',
                needsReview: false,
                note: null,
                source: 'sms',
                occurredAt: 1700000000000,
                dedupeHash: 'a'.repeat(64),
                isExcluded: false,
                createdAt: 1700000000000,
                updatedAt: 1700000000000,
              },
            ],
            totalCount: 1,
            page: 1,
            pageSize: 100,
            totalPages: 1,
          }),
        };
      }
      return { ok: true, status: 200, json: async () => ({}) };
    });

    const result = await restoreFromServer(db, clock);
    expect(result.restoredProfile).toBe(true);
    expect(result.restoredTransactions).toBe(1);

    const profile = await getProfile(db);
    expect(profile).not.toBeNull();
    expect(profile?.monthlySalaryPaise).toBe(7500000);
    expect(profile?.payday).toBe(1);

    const fixed = await getFixedExpenses(db);
    expect(fixed).toHaveLength(1);
    expect(fixed[0]?.name).toBe('Wifi');

    const txCount = await countTransactions(db);
    expect(txCount).toBe(1);

    const txs = await listTransactions(db);
    expect(txs[0]?.id).toBe('tx-remote-1');
    expect(txs[0]?.merchant).toBe('Blinkit');

    // Confirm transaction is marked 'synced' in SQLite
    const row = await db.getFirstAsync<{ sync_state: string }>(
      'SELECT sync_state FROM transactions WHERE id = ?',
      ['tx-remote-1'],
    );
    expect(row?.sync_state).toBe('synced');
  });

  it('does not overwrite positive local salary profile when server profile has salary 0 (Bug A protection)', async () => {
    // Local profile set up during onboarding
    await saveProfile(
      db,
      { monthlySalaryPaise: 5000000, payday: 1, monthlySavingsGoalPaise: 1000000 },
      clock,
    );

    global.fetch = jest.fn().mockImplementation(async (url: string) => {
      if (url.includes('/api/v1/me/profile')) {
        // Blank newly-registered account on server with 0 salary
        return {
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({
            id: 'u1',
            email: 'user@test.com',
            name: 'User',
            salaryPaise: 0,
            payday: 1,
            savingsGoalPaise: 0,
            timezone: 'Asia/Kolkata',
          }),
        };
      }
      if (url.includes('/api/v1/me/fixed-expenses')) {
        return {
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => [],
        };
      }
      if (url.includes('/api/v1/transactions')) {
        return {
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({
            items: [],
            totalCount: 0,
            page: 1,
            pageSize: 100,
            totalPages: 1,
          }),
        };
      }
      return { ok: true, status: 200, json: async () => ({}) };
    });

    const result = await restoreFromServer(db, clock);
    expect(result.restoredProfile).toBe(false);

    // Profile remains safe with original salary!
    const profile = await getProfile(db);
    expect(profile?.monthlySalaryPaise).toBe(5000000);
  });

  it('restores next to existing local data with same dedupe_hash without unique constraint error (Bug B protection)', async () => {
    const sharedDedupeHash = 'b'.repeat(64);

    // 1. Local transaction already exists with this dedupe_hash under a local ID
    await db.runAsync(
      `INSERT INTO transactions (
        id, amount_paise, direction, account_last4, merchant, merchant_norm, vpa, mode, upi_ref,
        balance_paise, category, needs_review, note, source, occurred_at, dedupe_hash, is_excluded,
        created_at, updated_at, sync_state
      ) VALUES (?, 10000, 'debit', '1234', 'Uber', 'uber', null, 'UPI', '111222', null, 'transport', 0, null, 'sms', 1700000000000, ?, 0, 1700000000000, 1700000000000, 'synced')`,
      ['local-tx-id', sharedDedupeHash],
    );

    // 2. Server sends the same transaction under a different server ID 'remote-tx-id'
    global.fetch = jest.fn().mockImplementation(async (url: string) => {
      if (url.includes('/api/v1/transactions')) {
        return {
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({
            items: [
              {
                id: 'remote-tx-id',
                amountPaise: 10000,
                direction: 'debit',
                merchant: 'Uber Rides',
                merchantNorm: 'uber',
                vpa: null,
                mode: 'UPI',
                accountLast4: '1234',
                upiRef: '111222',
                balancePaise: null,
                category: 'transport',
                needsReview: false,
                note: null,
                source: 'sms',
                occurredAt: 1700000000000,
                dedupeHash: sharedDedupeHash,
                isExcluded: false,
                createdAt: 1700000000000,
                updatedAt: 1700000001000,
              },
            ],
            totalCount: 1,
            page: 1,
            pageSize: 100,
            totalPages: 1,
          }),
        };
      }
      return { ok: true, status: 200, json: async () => [] };
    });

    // Should complete cleanly without throwing UNIQUE constraint failed: transactions.dedupe_hash
    const result = await restoreFromServer(db, clock);
    expect(result.restoredTransactions).toBe(1);

    // Should still have only 1 transaction, with updated merchant name
    const count = await countTransactions(db);
    expect(count).toBe(1);

    const txs = await listTransactions(db);
    expect(txs[0]?.merchant).toBe('Uber Rides');
  });

  it('preserves unsynced local pending edits during restore (Bug D protection)', async () => {
    const sharedDedupeHash = 'c'.repeat(64);

    // Local transaction edited offline by user: category changed to 'entertainment', marked pending
    await db.runAsync(
      `INSERT INTO transactions (
        id, amount_paise, direction, account_last4, merchant, merchant_norm, vpa, mode, upi_ref,
        balance_paise, category, needs_review, note, source, occurred_at, dedupe_hash, is_excluded,
        created_at, updated_at, sync_state
      ) VALUES (?, 50000, 'debit', '1234', 'Netflix', 'netflix', null, 'CARD', null, null, 'entertainment', 0, 'Offline note', 'sms', 1700000000000, ?, 0, 1700000000000, 1700000005000, 'pending')`,
      ['local-pending-tx', sharedDedupeHash],
    );

    // Server sends older copy with category 'subscriptions' and note null
    global.fetch = jest.fn().mockImplementation(async (url: string) => {
      if (url.includes('/api/v1/transactions')) {
        return {
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({
            items: [
              {
                id: 'local-pending-tx',
                amountPaise: 50000,
                direction: 'debit',
                merchant: 'Netflix',
                merchantNorm: 'netflix',
                vpa: null,
                mode: 'CARD',
                accountLast4: '1234',
                upiRef: null,
                balancePaise: null,
                category: 'subscriptions',
                needsReview: false,
                note: null,
                source: 'sms',
                occurredAt: 1700000000000,
                dedupeHash: sharedDedupeHash,
                isExcluded: false,
                createdAt: 1700000000000,
                updatedAt: 1700000000000,
              },
            ],
            totalCount: 1,
            page: 1,
            pageSize: 100,
            totalPages: 1,
          }),
        };
      }
      return { ok: true, status: 200, json: async () => [] };
    });

    await restoreFromServer(db, clock);

    // Local pending edit MUST be preserved!
    const txs = await listTransactions(db);
    expect(txs[0]?.category).toBe('entertainment');
    expect(txs[0]?.note).toBe('Offline note');

    const row = await db.getFirstAsync<{ sync_state: string }>(
      'SELECT sync_state FROM transactions WHERE id = ?',
      ['local-pending-tx'],
    );
    expect(row?.sync_state).toBe('pending');
  });

  it('safely normalizes bad server enum values (unknown category, invalid mode, uppercase direction)', async () => {
    global.fetch = jest.fn().mockImplementation(async (url: string) => {
      if (url.includes('/api/v1/transactions')) {
        return {
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({
            items: [
              {
                id: 'tx-bad-enums',
                amountPaise: 12000,
                direction: 'DEBIT', // uppercase
                merchant: 'Unknown Vendor',
                merchantNorm: 'unknown',
                vpa: null,
                mode: 'CRYPTO_INVALID', // invalid mode
                accountLast4: null,
                upiRef: null,
                balancePaise: null,
                category: 'alien_category_xyz', // invalid category
                needsReview: false,
                note: null,
                source: 'WECHAT', // invalid source
                occurredAt: 1700000000000,
                dedupeHash: 'd'.repeat(64),
                isExcluded: false,
                createdAt: 1700000000000,
                updatedAt: 1700000000000,
              },
            ],
            totalCount: 1,
            page: 1,
            pageSize: 100,
            totalPages: 1,
          }),
        };
      }
      return { ok: true, status: 200, json: async () => [] };
    });

    await restoreFromServer(db, clock);

    const txs = await listTransactions(db);
    expect(txs).toHaveLength(1);
    expect(txs[0]?.direction).toBe('debit');
    expect(txs[0]?.mode).toBe('OTHER');
    expect(txs[0]?.category).toBe('uncategorised');
    expect(txs[0]?.source).toBe('sms');
  });
});
