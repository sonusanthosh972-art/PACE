import { migrate, type SqlDb } from '@/data/db';
import { getSettings, setSetting } from '@/data/settingsRepo';
import { createTestDb } from '@/data/testing/nodeSqliteDb';
import { getApiBaseUrl, setApiBaseUrl } from '@/services/api/client';
import { clearTokens, hasTokens, saveTokens } from '@/services/api/tokens';
import { useAuthStore } from '@/state/authStore';

let mockDb: SqlDb;
jest.mock('@/data/appDb', () => ({
  getAppDb: jest.fn(async () => mockDb),
}));

describe('authStore', () => {
  let db: SqlDb & { close(): void };
  const originalFetch = global.fetch;

  beforeEach(async () => {
    db = createTestDb();
    mockDb = db;
    await migrate(db);
    await clearTokens();
    setApiBaseUrl('http://test-server:5080');
    useAuthStore.setState({
      isAuthenticated: false,
      user: null,
      syncStatus: 'idle',
      lastSyncedAt: null,
      syncError: null,
      isInitialised: false,
    });
    jest.clearAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    db.close();
  });

  it('keeps tokens and preserves authenticated state when starting up offline (Bug C protection)', async () => {
    // User was previously logged in
    await saveTokens('existing-jwt-token', 'existing-refresh-token');
    await setSetting(db, 'accountEmail', 'offline-user@test.com');

    // Network request fails (device is offline / airplane mode)
    global.fetch = jest.fn().mockRejectedValue(new TypeError('Network request failed'));

    await useAuthStore.getState().init();

    // MUST remain authenticated and MUST keep tokens!
    expect(useAuthStore.getState().isAuthenticated).toBe(true);
    expect(useAuthStore.getState().syncStatus).toBe('offline');
    expect(useAuthStore.getState().user?.email).toBe('offline-user@test.com');
    expect(await hasTokens()).toBe(true);
  });

  it('clears tokens and signs user out ONLY on explicit 401 Unauthorized', async () => {
    await saveTokens('invalid-jwt-token', 'expired-refresh-token');
    await setSetting(db, 'accountEmail', 'revoked-user@test.com');

    // Server returns 401 and refresh fails
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 401,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({ detail: 'Token revoked' }),
    });

    await useAuthStore.getState().init();

    // When server explicitly rejects session, log out
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
    expect(useAuthStore.getState().user).toBeNull();
    expect(await hasTokens()).toBe(false);

    const settings = await getSettings(db);
    expect(settings.accountEmail).toBeNull();
  });

  it('initializes server URL from sqlite settings if present', async () => {
    await setSetting(db, 'apiBaseUrl', 'http://192.168.1.100:5080');
    await useAuthStore.getState().init();

    expect(getApiBaseUrl()).toBe('http://192.168.1.100:5080');
  });
});
