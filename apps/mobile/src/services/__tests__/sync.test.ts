import { migrate, type SqlDb } from '@/data/db';
import { replaceFixedExpenses, saveProfile } from '@/data/profileRepo';
import { createTestClock, createTestDb } from '@/data/testing/nodeSqliteDb';
import {
  addManual,
  deleteTransaction,
  getById,
  pendingDeletes,
  pendingSync,
} from '@/data/transactionsRepo';
import { deleteAllData } from '@/services/actions';
import { setApiBaseUrl } from '@/services/api/client';
import { clearTokens, hasTokens, saveTokens } from '@/services/api/tokens';
import { cancelScheduledSync, syncNow } from '@/services/sync';
import { useAuthStore } from '@/state/authStore';

let mockDb: SqlDb;
jest.mock('@/data/appDb', () => ({
  getAppDb: jest.fn(async () => mockDb),
}));

describe('sync service', () => {
  let db: SqlDb & { close(): void };
  let clock: ReturnType<typeof createTestClock>;
  const originalFetch = global.fetch;

  beforeEach(async () => {
    db = createTestDb();
    mockDb = db;
    await migrate(db);
    clock = createTestClock();
    await clearTokens();
    setApiBaseUrl('http://test-server:5080');
    useAuthStore.setState({
      isAuthenticated: false,
      user: null,
      syncStatus: 'idle',
      lastSyncedAt: null,
    });
    jest.clearAllMocks();
  });

  afterEach(() => {
    cancelScheduledSync();
    global.fetch = originalFetch;
    db.close();
  });

  it('skips sync when user is not authenticated', async () => {
    const fetchSpy = jest.fn();
    global.fetch = fetchSpy;

    await addManual(
      db,
      {
        amountPaise: 50000,
        category: 'food',
        note: 'Coffee',
        merchant: 'Blue Tokai',
        occurredAt: clock.now(),
      },
      clock,
    );

    const result = await syncNow(db);
    expect(result).toEqual({ syncedTransactions: 0, syncedProfile: false });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('syncs pending transactions and marks them synced if unchanged', async () => {
    useAuthStore.setState({
      isAuthenticated: true,
      user: {
        id: 'u1',
        email: 'user@test.com',
        name: 'User',
        salaryPaise: 5000000,
        payday: 1,
        savingsGoalPaise: 1000000,
        timezone: 'Asia/Kolkata',
      },
    });
    await saveTokens('valid-token', 'valid-refresh');

    const tx = await addManual(
      db,
      {
        amountPaise: 50000,
        category: 'food',
        note: 'Coffee',
        merchant: 'Blue Tokai',
        occurredAt: clock.now(),
      },
      clock,
    );

    let pending = await pendingSync(db);
    expect(pending).toHaveLength(1);

    global.fetch = jest.fn().mockImplementation(async (url: string) => {
      if (url.includes('/api/v1/transactions/sync')) {
        return {
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({ inserted: 1, updated: 0, totalProcessed: 1 }),
        };
      }
      return { ok: true, status: 200, json: async () => ({}) };
    });

    const result = await syncNow(db);
    expect(result.syncedTransactions).toBe(1);

    pending = await pendingSync(db);
    expect(pending).toHaveLength(0);

    const syncedTx = await getById(db, tx.id);
    expect(syncedTx).not.toBeNull();
  });

  it('does not mark a row synced if its updatedAt was changed while sync was in flight', async () => {
    useAuthStore.setState({
      isAuthenticated: true,
      user: {
        id: 'u1',
        email: 'user@test.com',
        name: 'User',
        salaryPaise: 5000000,
        payday: 1,
        savingsGoalPaise: 1000000,
        timezone: 'Asia/Kolkata',
      },
    });
    await saveTokens('valid-token', 'valid-refresh');

    const tx = await addManual(
      db,
      {
        amountPaise: 50000,
        category: 'food',
        note: 'Coffee',
        merchant: 'Blue Tokai',
        occurredAt: clock.now(),
      },
      clock,
    );

    global.fetch = jest.fn().mockImplementation(async (url: string) => {
      if (url.includes('/api/v1/transactions/sync')) {
        // Simulate a local modification while request is in flight
        await db.runAsync('UPDATE transactions SET updated_at = updated_at + 1000 WHERE id = ?', [
          tx.id,
        ]);
        return {
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({ inserted: 1, updated: 0, totalProcessed: 1 }),
        };
      }
      return { ok: true, status: 200, json: async () => ({}) };
    });

    await syncNow(db);

    // Row was modified while in-flight, so it should still be pending!
    const pending = await pendingSync(db);
    expect(pending).toHaveLength(1);
  });

  it('syncs pending profile and fixed expenses', async () => {
    useAuthStore.setState({
      isAuthenticated: true,
      user: {
        id: 'u1',
        email: 'user@test.com',
        name: 'User',
        salaryPaise: 5000000,
        payday: 1,
        savingsGoalPaise: 1000000,
        timezone: 'Asia/Kolkata',
      },
    });
    await saveTokens('valid-token', 'valid-refresh');

    await saveProfile(
      db,
      { monthlySalaryPaise: 6000000, payday: 5, monthlySavingsGoalPaise: 1500000 },
      clock,
    );
    await replaceFixedExpenses(db, [{ name: 'Rent', amountPaise: 2000000, dueDay: 1 }], clock);

    let profilePutCalled = false;
    let fixedPutCalled = false;

    global.fetch = jest.fn().mockImplementation(async (url: string) => {
      if (url.includes('/api/v1/me/profile')) {
        profilePutCalled = true;
        return {
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({
            id: 'u1',
            email: 'user@test.com',
            name: 'User',
            salaryPaise: 6000000,
            payday: 5,
            savingsGoalPaise: 1500000,
            timezone: 'Asia/Kolkata',
          }),
        };
      }
      if (url.includes('/api/v1/me/fixed-expenses')) {
        fixedPutCalled = true;
        return {
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => [{ id: 'f1', name: 'Rent', amountPaise: 2000000, dueDay: 1 }],
        };
      }
      return { ok: true, status: 200, json: async () => ({}) };
    });

    const result = await syncNow(db);
    expect(result.syncedProfile).toBe(true);
    expect(profilePutCalled).toBe(true);
    expect(fixedPutCalled).toBe(true);
  });

  it('updates syncStatus to offline on network failure', async () => {
    useAuthStore.setState({
      isAuthenticated: true,
      user: {
        id: 'u1',
        email: 'user@test.com',
        name: 'User',
        salaryPaise: 5000000,
        payday: 1,
        savingsGoalPaise: 1000000,
        timezone: 'Asia/Kolkata',
      },
    });
    await saveTokens('valid-token', 'valid-refresh');

    await addManual(
      db,
      {
        amountPaise: 50000,
        category: 'food',
        note: 'Coffee',
        merchant: 'Blue Tokai',
        occurredAt: clock.now(),
      },
      clock,
    );

    global.fetch = jest.fn().mockRejectedValue(new TypeError('Network request failed'));

    await expect(syncNow(db)).rejects.toThrow('Unable to reach server');
    expect(useAuthStore.getState().syncStatus).toBe('offline');
  });

  it('deletes server account first on deleteAllData when signed in', async () => {
    useAuthStore.setState({
      isAuthenticated: true,
      user: {
        id: 'u1',
        email: 'user@test.com',
        name: 'User',
        salaryPaise: 5000000,
        payday: 1,
        savingsGoalPaise: 1000000,
        timezone: 'Asia/Kolkata',
      },
    });
    await saveTokens('valid-token', 'valid-refresh');

    let serverDeleteCalled = false;
    global.fetch = jest.fn().mockImplementation(async (url: string, opts: RequestInit) => {
      if (url.includes('/api/v1/me') && opts.method === 'DELETE') {
        serverDeleteCalled = true;
        return { ok: true, status: 204 };
      }
      return { ok: true, status: 200 };
    });

    await deleteAllData();

    expect(serverDeleteCalled).toBe(true);
    expect(await hasTokens()).toBe(false);
    expect(useAuthStore.getState().user).toBeNull();
  });

  it('uploads deleted payments and stops re-sending them once the server confirms', async () => {
    useAuthStore.setState({ isAuthenticated: true });
    await saveTokens('valid-token', 'valid-refresh');
    const tx = await addManual(
      db,
      { amountPaise: 100, category: 'food', note: null, merchant: null, occurredAt: clock.now() },
      clock,
    );
    await deleteTransaction(db, tx.id, clock);

    const calls: { url: string; body: unknown }[] = [];
    global.fetch = jest.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, body: init?.body ? JSON.parse(String(init.body)) : undefined });
      const body = url.endsWith('/delete')
        ? { deleted: 1 }
        : { inserted: 0, updated: 0, totalProcessed: 0 };
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }) as unknown as typeof fetch;

    await syncNow(db);
    const deleteCall = calls.find((c) => c.url.endsWith('/api/v1/transactions/delete'));
    expect(deleteCall?.body).toEqual({ dedupeHashes: [tx.dedupeHash] });
    expect(await pendingDeletes(db)).toHaveLength(0);
  });
});
