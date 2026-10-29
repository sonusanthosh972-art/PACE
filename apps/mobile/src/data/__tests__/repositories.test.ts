import { parseNotification, parseSms } from '@/domain/parsing/parseSms';
import { totalSpend } from '@/domain/budget';
import type { CategoryId } from '@/domain/categories';
import { MINUTE_MS, startOfDayMs } from '@/domain/time';

import { getOrFreezeBudget, getSnapshot, getStreak } from '../budgetRepo';
import { MIGRATIONS, migrate, type SqlDb } from '../db';
import {
  ensureBudgetStart,
  getProfile,
  markProfileSynced,
  profileNeedsSync,
  replaceFixedExpenses,
  saveProfile,
} from '../profileRepo';
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
  deleteTransaction,
  getRules,
  ingestParsed,
  isDeleted,
  listTransactions,
  markDeletesSynced,
  markSynced,
  pendingDeletes,
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

    // Next day: the same fixed allowance (50000 ÷ 30), whatever was spent on day 1
    const day2 = Date.UTC(2026, 8, 2, 3, 0);
    const snap2 = await getSnapshot(db, profile, day2);
    expect(snap2.todayBudgetPaise).toBe(166667);
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

describe('budget totals in SQL', () => {
  it('match totalSpend: refunds net off; excluded, fixed and transfer credits do not', async () => {
    await saveProfile(
      db,
      { monthlySalaryPaise: 100000_00, payday: 1, monthlySavingsGoalPaise: 0 },
      clock,
      null,
    );
    const profile = await getProfile(db);
    if (!profile) throw new Error('profile missing');
    const at = Date.UTC(2026, 8, 2, 6, 0); // 2 Sep 2026
    const add = async (amount: number, category: CategoryId, credit = false, excluded = false) => {
      const tx = await addManual(
        db,
        { amountPaise: amount, category, note: null, merchant: null, occurredAt: at },
        clock,
      );
      if (credit)
        await db.runAsync(`UPDATE transactions SET direction = 'credit' WHERE id = ?`, [tx.id]);
      if (excluded) await setExcluded(db, tx.id, true, clock);
    };
    await add(1000_00, 'food');
    await add(500_00, 'shopping');
    await add(300_00, 'shopping', true); // refund: nets off
    await add(9000_00, 'rent_emi'); // fixed: never counts
    await add(2000_00, 'food', false, true); // excluded
    await add(700_00, 'transfers', true); // money in from a person: not a refund
    await add(400_00, 'other', true); // general income: not a refund

    const expected = totalSpend(await listTransactions(db, { limit: 1000 }));
    expect(expected).toBe(1200_00);
    const nextDay = Date.UTC(2026, 8, 3, 6, 0);
    const snap = await getSnapshot(db, profile, nextDay);
    expect(snap.spentBeforeTodayPaise).toBe(expected);
    // Per-day spend for the streak counts that day's debits only (refunds are not per-day credit).
    const sameDay = await getSnapshot(db, profile, at);
    expect(sameDay.spentTodayPaise).toBe(expected);
  });
});

describe('deleted payments', () => {
  it('are remembered for sync and never come back from a duplicate SMS', async () => {
    const { transaction } = await ingestParsed(db, smsAt(ZOMATO_UPI), clock);
    await deleteTransaction(db, transaction.id, clock);

    expect(await countTransactions(db)).toBe(0);
    expect(await isDeleted(db, transaction.dedupeHash)).toBe(true);
    expect((await pendingDeletes(db)).map((d) => d.dedupeHash)).toEqual([transaction.dedupeHash]);

    await markDeletesSynced(db, [transaction.dedupeHash]);
    expect(await pendingDeletes(db)).toHaveLength(0);
    expect(await isDeleted(db, transaction.dedupeHash)).toBe(true);
  });
});

describe('profile sync version', () => {
  it('stays pending when the profile is edited while an upload is in flight', async () => {
    await saveProfile(
      db,
      { monthlySalaryPaise: 50000_00, payday: 1, monthlySavingsGoalPaise: 0 },
      clock,
    );
    const sent = await profileNeedsSync(db);
    expect(sent).not.toBeNull();

    clock.advance(1000);
    await saveProfile(
      db,
      { monthlySalaryPaise: 60000_00, payday: 1, monthlySavingsGoalPaise: 0 },
      clock,
    );
    await markProfileSynced(db, sent ?? undefined);
    expect(await profileNeedsSync(db)).not.toBeNull();

    await markProfileSynced(db, (await profileNeedsSync(db)) ?? undefined);
    expect(await profileNeedsSync(db)).toBeNull();
  });

  it('fills in a missing start date when the salary is saved after a sign-in restore', async () => {
    // Restore on a fresh phone saves the account profile without a start date…
    await saveProfile(
      db,
      { monthlySalaryPaise: 0, payday: 1, monthlySavingsGoalPaise: 0 },
      clock,
      null,
    );
    expect((await getProfile(db))?.startDate).toBeNull();
    // …then onboarding saves the salary: the start must not stay empty.
    await saveProfile(
      db,
      { monthlySalaryPaise: 50000_00, payday: 1, monthlySavingsGoalPaise: 0 },
      clock,
    );
    expect((await getProfile(db))?.startDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('ensureBudgetStart uses the earliest payment, else today, and re-syncs the profile', async () => {
    await saveProfile(
      db,
      { monthlySalaryPaise: 1, payday: 1, monthlySavingsGoalPaise: 0 },
      clock,
      null,
    );
    await markProfileSynced(db);
    await ensureBudgetStart(db, '2026-10-29');
    expect((await getProfile(db))?.startDate).toBe('2026-10-29');
    expect(await profileNeedsSync(db)).not.toBeNull();

    await saveProfile(
      db,
      { monthlySalaryPaise: 1, payday: 1, monthlySavingsGoalPaise: 0 },
      clock,
      null,
    );
    await addManual(
      db,
      {
        amountPaise: 100,
        category: 'food',
        note: null,
        merchant: null,
        occurredAt: Date.UTC(2026, 8, 3, 6, 0),
      },
      clock,
    );
    await ensureBudgetStart(db, '2026-10-29');
    expect((await getProfile(db))?.startDate).toBe('2026-09-03');
  });

  it('the v4 migration repairs profiles left without a start date', async () => {
    await saveProfile(
      db,
      { monthlySalaryPaise: 1, payday: 1, monthlySavingsGoalPaise: 0 },
      clock,
      null,
    );
    const v4 = MIGRATIONS[3];
    if (!v4) throw new Error('v4 migration missing');
    await db.execAsync(v4);
    expect((await getProfile(db))?.startDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('keeps the budget start date when the profile is edited later', async () => {
    await saveProfile(db, { monthlySalaryPaise: 1, payday: 1, monthlySavingsGoalPaise: 0 }, clock);
    const start = (await getProfile(db))?.startDate;
    expect(start).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    clock.advance(40 * 86_400_000);
    await saveProfile(db, { monthlySalaryPaise: 2, payday: 1, monthlySavingsGoalPaise: 0 }, clock);
    expect((await getProfile(db))?.startDate).toBe(start);
  });
});

describe('budget start date repair', () => {
  it('fills a missing start when the salary is saved after a sign-in restore', async () => {
    // Sign-in restore on an empty phone saved the profile with no start date…
    await saveProfile(
      db,
      { monthlySalaryPaise: 0, payday: 1, monthlySavingsGoalPaise: 0 },
      clock,
      null,
    );
    expect((await getProfile(db))?.startDate).toBeNull();
    // …then the user entered their salary: the start must not stay empty.
    await saveProfile(
      db,
      { monthlySalaryPaise: 50000_00, payday: 1, monthlySavingsGoalPaise: 0 },
      clock,
    );
    expect((await getProfile(db))?.startDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('uses the earliest stored payment, else today, and marks the profile for sync', async () => {
    await saveProfile(
      db,
      { monthlySalaryPaise: 1, payday: 1, monthlySavingsGoalPaise: 0 },
      clock,
      null,
    );
    await markProfileSynced(db);
    await addManual(
      db,
      {
        amountPaise: 100,
        category: 'food',
        note: null,
        merchant: null,
        occurredAt: Date.UTC(2026, 8, 3, 6, 0),
      },
      clock,
    );
    await ensureBudgetStart(db, '2026-10-29');
    expect((await getProfile(db))?.startDate).toBe('2026-09-03');
    expect(await profileNeedsSync(db)).not.toBeNull();

    // An existing start is never changed.
    await ensureBudgetStart(db, '2026-10-29');
    expect((await getProfile(db))?.startDate).toBe('2026-09-03');
  });

  it('falls back to today when there are no payments', async () => {
    await saveProfile(
      db,
      { monthlySalaryPaise: 1, payday: 1, monthlySavingsGoalPaise: 0 },
      clock,
      null,
    );
    await ensureBudgetStart(db, '2026-10-29');
    expect((await getProfile(db))?.startDate).toBe('2026-10-29');
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
