import { parseNotification, parseSms } from '@/domain/parsing/parseSms';
import { MINUTE_MS, startOfDayMs } from '@/domain/time';

import { getOrFreezeBudget, getSnapshot, getStreak } from '../budgetRepo';
import { MIGRATIONS, migrate, type SqlDb } from '../db';
import { getProfile, replaceFixedExpenses, saveProfile } from '../profileRepo';
import {
  DEFAULT_SETTINGS,
  getSettings,
  markOnce,
  setSetting,
  wipeAllLocalData,
} from '../settingsRepo';
import { createTestClock, createTestDb } from '../testing/nodeSqliteDb';
import {
  addManual,
  countTransactions,
  getRules,
  ingestParsed,
  listTransactions,
  markSynced,
  pendingSync,
  recategorise,
  setExcluded,
} from '../transactionsRepo';

const T0 = Date.UTC(2026, 9, 24, 4, 45); // 24 Oct 2026 10:15 IST

function smsAt(body: string, at = T0, sender = 'VM-HDFCBK') {
  const parsed = parseSms(sender, body, at);
  if (!parsed) throw new Error(`fixture did not parse: ${body}`);
  return parsed;
}

const ZOMATO_UPI =
  'Sent Rs.300.00 From HDFC Bank A/C *1234 To ZOMATO On 24/10/26 Ref 429812345678 Not You?';
const CARD_NO_REF = 'Spent Rs.450.00 On HDFC Bank Card 4321 At SRI LAKSHMI TIFFINS On 2026-10-24';

let db: SqlDb & { close(): void };
let clock: ReturnType<typeof createTestClock>;

beforeEach(async () => {
  db = createTestDb();
  clock = createTestClock();
  await migrate(db);
});

afterEach(() => db.close());

describe('migrations', () => {
  it('reaches the latest version and is idempotent', async () => {
    expect(await migrate(db)).toBe(MIGRATIONS.length);
    const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version', []);
    expect(row?.user_version).toBe(MIGRATIONS.length);
  });

  it('enforces integer paise > 0 at the schema level', async () => {
    await expect(
      db.runAsync(
        `INSERT INTO transactions (id, amount_paise, direction, mode, category, source, occurred_at,
          dedupe_hash, created_at, updated_at) VALUES ('x', 0, 'debit', 'UPI', 'food', 'sms', 1, 'h', 1, 1)`,
        [],
      ),
    ).rejects.toThrow();
  });
});

describe('ingestParsed', () => {
  it('inserts, categorises and marks for sync', async () => {
    const res = await ingestParsed(db, smsAt(ZOMATO_UPI), clock);
    expect(res.status).toBe('inserted');
    expect(res.transaction).toMatchObject({
      amountPaise: 30000,
      category: 'food',
      merchantNorm: 'zomato',
      needsReview: false,
      isExcluded: false,
    });
    expect(await pendingSync(db)).toHaveLength(1);
  });

  it('the same SMS twice is a duplicate (unique dedupe hash)', async () => {
    await ingestParsed(db, smsAt(ZOMATO_UPI), clock);
    const again = await ingestParsed(db, smsAt(ZOMATO_UPI, T0 + 1000), clock);
    expect(again.status).toBe('duplicate');
    expect(await countTransactions(db)).toBe(1);
  });

  it('notification first, then SMS with a reference → merged into one row', async () => {
    const notif = parseNotification(
      'com.google.android.apps.nbu.paisa.user',
      'Paid ₹300 to Zomato',
      'via UPI',
      T0 - 30_000,
    );
    if (!notif) throw new Error('notification fixture did not parse');
    const first = await ingestParsed(db, notif, clock);
    expect(first.status).toBe('inserted');

    const second = await ingestParsed(db, smsAt(ZOMATO_UPI), clock);
    expect(second.status).toBe('merged');
    expect(second.transaction).toMatchObject({
      id: first.transaction.id,
      upiRef: '429812345678',
      accountLast4: '1234',
    });
    expect(await countTransactions(db)).toBe(1);
  });

  it('same amount on the same card 10 minutes apart → two payments', async () => {
    await ingestParsed(db, smsAt(CARD_NO_REF), clock);
    const later = await ingestParsed(db, smsAt(CARD_NO_REF, T0 + 10 * MINUTE_MS), clock);
    expect(later.status).toBe('inserted');
    expect(await countTransactions(db)).toBe(2);
  });

  it('unknown merchants are Uncategorised and flagged for review', async () => {
    const res = await ingestParsed(db, smsAt(CARD_NO_REF), clock);
    expect(res.transaction).toMatchObject({ category: 'uncategorised', needsReview: true });
  });
});

describe('recategorise → user rule', () => {
  it('creates a rule, updates same-merchant rows and applies to future ones', async () => {
    const a = await ingestParsed(db, smsAt(CARD_NO_REF), clock);
    await ingestParsed(db, smsAt(CARD_NO_REF, T0 + 20 * MINUTE_MS), clock);

    const changed = await recategorise(db, a.transaction.id, 'food', clock);
    expect(changed).toBe(2);
    expect(await getRules(db)).toEqual([
      expect.objectContaining({ pattern: 'sri lakshmi tiffins', category: 'food' }),
    ]);

    const future = await ingestParsed(db, smsAt(CARD_NO_REF, T0 + 60 * MINUTE_MS), clock);
    expect(future.transaction).toMatchObject({ category: 'food', needsReview: false });
  });

  it('re-categorising again updates the existing rule instead of duplicating it', async () => {
    const a = await ingestParsed(db, smsAt(CARD_NO_REF), clock);
    await recategorise(db, a.transaction.id, 'food', clock);
    await recategorise(db, a.transaction.id, 'coffee', clock);
    const rules = await getRules(db);
    expect(rules).toHaveLength(1);
    expect(rules[0]?.category).toBe('coffee');
  });
});

describe('manual entry, filters and sync state', () => {
  it('adds manual cash entries that never dedupe', async () => {
    const entry = { amountPaise: 5000, category: 'food' as const, note: 'chai', merchant: null };
    await addManual(db, { ...entry, occurredAt: T0 }, clock);
    await addManual(db, { ...entry, occurredAt: T0 }, clock);
    expect(await countTransactions(db)).toBe(2);
  });

  it('filters by category, mode, date range and search (LIKE-escaped)', async () => {
    await ingestParsed(db, smsAt(ZOMATO_UPI), clock);
    await ingestParsed(db, smsAt(CARD_NO_REF, T0 + 60_000), clock);
    await addManual(
      db,
      {
        amountPaise: 100,
        category: 'other',
        note: '100%_off',
        merchant: null,
        occurredAt: T0 - 86_400_000,
      },
      clock,
    );

    expect(await listTransactions(db, { category: 'food' })).toHaveLength(1);
    expect(await listTransactions(db, { mode: 'CARD' })).toHaveLength(1);
    expect(await listTransactions(db, { search: 'tiffin' })).toHaveLength(1);
    expect(await listTransactions(db, { search: '%' })).toHaveLength(1);
    expect(await listTransactions(db, { from: startOfDayMs('2026-10-24') })).toHaveLength(2);
    const all = await listTransactions(db);
    expect(all.map((t) => t.occurredAt)).toEqual(
      [...all.map((t) => t.occurredAt)].sort((a, b) => b - a),
    );
  });

  it('markSynced skips rows that changed after being sent', async () => {
    const { transaction } = await ingestParsed(db, smsAt(ZOMATO_UPI), clock);
    const sent = await pendingSync(db);
    clock.advance(1000);
    await setExcluded(db, transaction.id, true, clock);
    await markSynced(
      db,
      sent.map((t) => ({ id: t.id, updatedAt: t.updatedAt })),
    );
    expect(await pendingSync(db)).toHaveLength(1);

    const resend = await pendingSync(db);
    await markSynced(
      db,
      resend.map((t) => ({ id: t.id, updatedAt: t.updatedAt })),
    );
    expect(await pendingSync(db)).toHaveLength(0);
  });
});

describe('profile + budget', () => {
  async function seedProfile() {
    await saveProfile(
      db,
      { monthlySalaryPaise: 100000_00, payday: 1, monthlySavingsGoalPaise: 10000_00 },
      clock,
    );
    await replaceFixedExpenses(
      db,
      [
        { name: 'Rent', amountPaise: 30000_00, dueDay: 5 },
        { name: 'EMI', amountPaise: 10000_00, dueDay: 10 },
      ],
      clock,
    );
    const profile = await getProfile(db);
    if (!profile) throw new Error('profile missing');
    return profile;
  }

  it('returns null before onboarding and the saved profile after', async () => {
    expect(await getProfile(db)).toBeNull();
    const profile = await seedProfile();
    expect(profile.fixedExpenses.map((f) => f.name)).toEqual(['Rent', 'EMI']);
  });

  it('freezes the budget for the day: spending today does not change it', async () => {
    const profile = await seedProfile();
    const day1 = Date.UTC(2026, 8, 1, 3, 0); // 1 Sep 2026 08:30 IST, a 30-day cycle
    expect(await getOrFreezeBudget(db, profile, '2026-09-01', day1)).toBe(166667);

    await addManual(
      db,
      {
        amountPaise: 4200_00,
        category: 'shopping',
        note: null,
        merchant: 'Croma',
        occurredAt: day1,
      },
      clock,
    );
    const snap = await getSnapshot(db, profile, day1 + 3_600_000);
    expect(snap.todayBudgetPaise).toBe(166667);
    expect(snap.remainingTodayPaise).toBe(166667 - 420000);

    // Next day: (50000 − 4200) / 29
    const day2 = Date.UTC(2026, 8, 2, 3, 0);
    const snap2 = await getSnapshot(db, profile, day2);
    expect(snap2.todayBudgetPaise).toBe(157931);
    expect(await getStreak(db, day2)).toBe(0); // day 1 was over budget
  });

  it('streak counts on-budget days', async () => {
    const profile = await seedProfile();
    for (const day of [1, 2, 3]) {
      const at = Date.UTC(2026, 8, day, 6, 0);
      await getSnapshot(db, profile, at);
      await addManual(
        db,
        { amountPaise: 500_00, category: 'food', note: null, merchant: null, occurredAt: at },
        clock,
      );
    }
    expect(await getStreak(db, Date.UTC(2026, 8, 4, 6, 0))).toBe(3);
  });
});

describe('settings', () => {
  it('returns defaults, persists values and ignores corrupt rows', async () => {
    expect(await getSettings(db)).toEqual(DEFAULT_SETTINGS);
    await setSetting(db, 'theme', 'dark');
    await setSetting(db, 'morningTime', { hour: 7, minute: 30 });
    await db.runAsync(`INSERT INTO settings (key, value) VALUES ('nightTime', '{not json')`, []);
    const s = await getSettings(db);
    expect(s.theme).toBe('dark');
    expect(s.morningTime).toEqual({ hour: 7, minute: 30 });
    expect(s.nightTime).toEqual({ hour: 22, minute: 0 });
  });

  it('rejects invalid values', async () => {
    await expect(setSetting(db, 'morningTime', { hour: 25, minute: 0 })).rejects.toThrow();
  });

  it('markOnce only succeeds the first time', async () => {
    expect(await markOnce(db, 'warn80:2026-10-24', T0)).toBe(true);
    expect(await markOnce(db, 'warn80:2026-10-24', T0)).toBe(false);
  });

  it('wipeAllLocalData removes everything', async () => {
    await ingestParsed(db, smsAt(ZOMATO_UPI), clock);
    await setSetting(db, 'theme', 'dark');
    await wipeAllLocalData(db);
    expect(await countTransactions(db)).toBe(0);
    expect(await getSettings(db)).toEqual(DEFAULT_SETTINGS);
  });
});
