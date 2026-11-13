import { MINUTE_MS } from '@/domain/time';
import type { ParsedTransaction } from '@/domain/transaction';
import { EXCLUDE_NOTES } from '@/domain/transfers';

import { MIGRATIONS, migrate, type SqlDb } from '../db';
import { createTestClock, createTestDb } from '../testing/nodeSqliteDb';
import {
  countReviewQueue,
  detectTransfers,
  excludePayee,
  getById,
  getRules,
  ingestParsed,
  listReviewQueue,
  recategorise,
  setExcluded,
} from '../transactionsRepo';

const T0 = Date.UTC(2026, 10, 3, 6, 0); // 3 Nov 2026 11:30 IST

let db: SqlDb & { close(): void };
let clock: ReturnType<typeof createTestClock>;

beforeEach(async () => {
  db = createTestDb();
  clock = createTestClock();
  await migrate(db);
});

afterEach(() => db.close());

function parsed(p: Partial<ParsedTransaction> = {}): ParsedTransaction {
  return {
    amountPaise: 5_000_00,
    direction: 'debit',
    accountLast4: '1234',
    merchant: null,
    vpa: null,
    mode: 'UPI',
    upiRef: null,
    balancePaise: null,
    occurredAt: T0,
    source: 'sms',
    ...p,
  };
}

async function add(p: Partial<ParsedTransaction> = {}) {
  const res = await ingestParsed(db, parsed(p), clock);
  if (res.status !== 'inserted') throw new Error(`expected an insert, got ${res.status}`);
  return res.transaction;
}

describe('excluded on arrival', () => {
  it('leaves card bill and investment payees out of spending, with a note, not in review', async () => {
    const cred = await add({ merchant: 'CRED Club', vpa: 'cred.club@axisb' });
    expect(cred).toMatchObject({
      isExcluded: true,
      excludeReason: 'card_bill',
      needsReview: false,
      note: EXCLUDE_NOTES.card_bill,
    });
    const sip = await add({ merchant: 'Mutual Funds ICCL', amountPaise: 1_000_00 });
    expect(sip).toMatchObject({ isExcluded: true, excludeReason: 'investment' });
  });

  it('respects the user’s own category for that payee instead of guessing', async () => {
    const first = await add({ merchant: 'Groww' });
    expect(first.isExcluded).toBe(true);
    // The user counts this payee as spending: tag it, and the rule stops the guess next time.
    await setExcluded(db, first.id, false, clock);
    await recategorise(db, first.id, 'other', clock);
    const next = await add({ merchant: 'Groww', occurredAt: T0 + 60 * MINUTE_MS });
    expect(next.isExcluded).toBe(false);
  });
});

describe('detectTransfers', () => {
  it('excludes both sides of a move between the user’s own accounts', async () => {
    const out = await add({ merchant: 'Rahul', accountLast4: '1234' });
    const inn = await add({
      direction: 'credit',
      merchant: 'Rahul',
      accountLast4: '5678',
      occurredAt: T0 + 3 * MINUTE_MS,
    });

    const ids = await detectTransfers(db, T0 - MINUTE_MS, T0 + 10 * MINUTE_MS, clock);
    expect(ids.sort()).toEqual([out.id, inn.id].sort());
    expect(await getById(db, out.id)).toMatchObject({
      isExcluded: true,
      excludeReason: 'self_transfer',
      needsReview: false,
      note: EXCLUDE_NOTES.self_transfer,
    });
  });

  it('never overrides what the user decided', async () => {
    const out = await add({ merchant: 'Rahul' });
    await add({ direction: 'credit', accountLast4: '5678', occurredAt: T0 + MINUTE_MS });
    // The user said this one counts as spending.
    await setExcluded(db, out.id, true, clock);
    await setExcluded(db, out.id, false, clock);

    await detectTransfers(db, T0 - MINUTE_MS, T0 + 10 * MINUTE_MS, clock);
    expect(await getById(db, out.id)).toMatchObject({ isExcluded: false, excludeReason: 'user' });
  });

  it('keeps a note the user wrote', async () => {
    const out = await add({ note: 'rent share' });
    await add({ direction: 'credit', accountLast4: '5678', occurredAt: T0 + MINUTE_MS });
    await detectTransfers(db, T0 - MINUTE_MS, T0 + 10 * MINUTE_MS, clock);
    expect((await getById(db, out.id))?.note).toBe('rent share');
  });

  it('does nothing when there is no matching pair', async () => {
    await add({ merchant: 'Corner Shop' });
    expect(await detectTransfers(db, T0 - MINUTE_MS, T0 + 10 * MINUTE_MS, clock)).toEqual([]);
  });
});

describe('excludePayee ("always for this payee")', () => {
  it('leaves out every payment to the payee, now and in future', async () => {
    const a = await add({ merchant: 'Mom', amountPaise: 2_000_00 });
    const b = await add({ merchant: 'Mom', amountPaise: 3_000_00, occurredAt: T0 + MINUTE_MS });
    await add({ merchant: 'Corner Shop', occurredAt: T0 + 2 * MINUTE_MS });

    expect(await excludePayee(db, a.id, clock)).toBe(2);
    for (const id of [a.id, b.id]) {
      expect(await getById(db, id)).toMatchObject({ isExcluded: true, excludeReason: 'user' });
    }
    const rule = (await getRules(db)).find((r) => r.pattern === a.merchantNorm);
    expect(rule?.excludes).toBe(true);

    const later = await add({ merchant: 'Mom', occurredAt: T0 + 60 * MINUTE_MS });
    expect(later).toMatchObject({ isExcluded: true, excludeReason: 'user', needsReview: false });
  });

  it('excludes just that payment when there is no payee name', async () => {
    const tx = await add({ merchant: null });
    expect(await excludePayee(db, tx.id, clock)).toBe(1);
    expect((await getById(db, tx.id))?.isExcluded).toBe(true);
  });
});

describe('review queue', () => {
  it('lists payments that need a category, newest first, and not excluded ones', async () => {
    // Different amounts: the same amount from the same account within 3 minutes is one payment.
    const older = await add({ merchant: 'Suryavanshi Super', amountPaise: 20_00, occurredAt: T0 });
    const newer = await add({
      merchant: 'Sujeetrai7720',
      amountPaise: 40_00,
      occurredAt: T0 + MINUTE_MS,
    });
    await add({ merchant: 'CRED Club', occurredAt: T0 + 2 * MINUTE_MS }); // excluded on arrival

    expect(older.needsReview).toBe(true);
    expect(await countReviewQueue(db)).toBe(2);
    expect((await listReviewQueue(db)).map((t) => t.id)).toEqual([newer.id, older.id]);

    await recategorise(db, newer.id, 'groceries', clock);
    expect(await countReviewQueue(db)).toBe(1);
  });

  it('brings an untagged payment back into review when it is counted again', async () => {
    const tx = await add({ merchant: 'Suryavanshi Super' });
    await setExcluded(db, tx.id, true, clock);
    expect(await countReviewQueue(db)).toBe(0);
    await setExcluded(db, tx.id, false, clock);
    expect(await countReviewQueue(db)).toBe(1);
  });
});

describe('migration v6', () => {
  it('backfills why existing payments were excluded', async () => {
    const old = createTestDb();
    try {
      // Build the database as it was before v6.
      for (const sql of MIGRATIONS.slice(0, 5)) await old.execAsync(sql as string);
      await old.execAsync('PRAGMA user_version = 5;');
      const insert = (id: string, excluded: number, note: string | null) =>
        old.runAsync(
          `INSERT INTO transactions (id, amount_paise, direction, mode, category, source, occurred_at,
            dedupe_hash, created_at, updated_at, is_excluded, note)
           VALUES (?, 100, 'debit', 'UPI', 'other', 'sms', 1, ?, 1, 1, ?, ?)`,
          [id, `h-${id}`, excluded, note],
        );
      await insert('card', 1, EXCLUDE_NOTES.card_bill);
      await insert('self', 1, EXCLUDE_NOTES.self_transfer);
      await insert('user', 1, null);
      await insert('counted', 0, null);

      expect(await migrate(old)).toBe(MIGRATIONS.length);
      const rows = await old.getAllAsync<{ id: string; exclude_reason: string | null }>(
        'SELECT id, exclude_reason FROM transactions ORDER BY id',
        [],
      );
      expect(Object.fromEntries(rows.map((r) => [r.id, r.exclude_reason]))).toEqual({
        card: 'card_bill',
        counted: null,
        self: 'self_transfer',
        user: 'user',
      });
    } finally {
      old.close();
    }
  });
});
