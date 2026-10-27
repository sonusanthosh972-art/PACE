import { migrate, type SqlDb } from '@/data/db';
import { getProfile, saveProfile } from '@/data/profileRepo';
import { getSettings, setSetting } from '@/data/settingsRepo';
import { createTestClock, createTestDb } from '@/data/testing/nodeSqliteDb';
import { countTransactions } from '@/data/transactionsRepo';
import { completeAccountFlow } from '@/services/accountFlow';
import type { AuthResponse } from '@/services/api/schemas';
import { loadDemoData } from '@/services/demo';

const mockRestore = jest.fn<Promise<unknown>, [SqlDb]>(() => Promise.resolve({}));
const mockSync = jest.fn<Promise<unknown>, [SqlDb]>(() => Promise.resolve({}));

jest.mock('@/services/restore', () => ({ restoreFromServer: (db: SqlDb) => mockRestore(db) }));
jest.mock('@/services/sync', () => ({ syncNow: (db: SqlDb) => mockSync(db) }));

const AUTH: AuthResponse = {
  accessToken: 'a',
  refreshToken: 'r',
  user: {
    id: 'u1',
    email: 'asha@example.com',
    name: 'Asha',
    salaryPaise: 0,
    payday: 1,
    savingsGoalPaise: 0,
    timezone: 'Asia/Kolkata',
  },
};

describe('completeAccountFlow (ordered sign-in / sign-up)', () => {
  let db: SqlDb & { close(): void };
  const clock = createTestClock();
  const authenticate = jest.fn(() => Promise.resolve(AUTH));

  beforeEach(async () => {
    db = createTestDb();
    await migrate(db);
    jest.clearAllMocks();
  });

  afterEach(() => db.close());

  it('sends a new account to budget setup first', async () => {
    const next = await completeAccountFlow(db, 'register', authenticate);
    expect(authenticate).toHaveBeenCalledTimes(1);
    expect(mockSync).toHaveBeenCalled();
    expect(next).toBe('/onboarding/salary');
  });

  it('restores on an empty phone and then asks for permissions before Today', async () => {
    mockRestore.mockImplementationOnce(async (d) => {
      await saveProfile(
        d,
        { monthlySalaryPaise: 60_000_00, payday: 1, monthlySavingsGoalPaise: 0 },
        clock,
      );
      return {};
    });
    const next = await completeAccountFlow(db, 'login', authenticate);
    expect(mockRestore).toHaveBeenCalledTimes(1);
    expect(next).toBe('/onboarding/permissions');
  });

  it('goes straight to Today when this phone is already set up', async () => {
    await saveProfile(
      db,
      { monthlySalaryPaise: 60_000_00, payday: 1, monthlySavingsGoalPaise: 0 },
      clock,
    );
    await setSetting(db, 'onboardingComplete', true);
    const next = await completeAccountFlow(db, 'login', authenticate);
    expect(mockRestore).not.toHaveBeenCalled();
    expect(mockSync).toHaveBeenCalled();
    expect(next).toBe('/(tabs)');
  });

  it('never carries sample data into a real account', async () => {
    await loadDemoData(db, clock);
    expect(await countTransactions(db)).toBeGreaterThan(0);
    expect((await getSettings(db)).demoMode).toBe(true);

    const next = await completeAccountFlow(db, 'login', authenticate);

    expect(await countTransactions(db)).toBe(0);
    const settings = await getSettings(db);
    expect(settings.demoMode).toBe(false);
    expect(settings.accountEmail).toBe('asha@example.com');
    expect(await getProfile(db)).toBeNull();
    expect(mockRestore).toHaveBeenCalledTimes(1);
    expect(next).toBe('/onboarding/salary');
  });

  it('leaves sample data untouched when sign-in fails', async () => {
    await loadDemoData(db, clock);
    const failing = jest.fn(() => Promise.reject(new Error('Invalid email or password.')));
    await expect(completeAccountFlow(db, 'login', failing)).rejects.toThrow('Invalid');
    expect((await getSettings(db)).demoMode).toBe(true);
  });
});
