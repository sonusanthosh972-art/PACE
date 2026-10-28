import type { PendingItem } from '../../../modules/sms-reader';

import { migrate } from '@/data/db';
import { getSettings } from '@/data/settingsRepo';
import { createTestClock, createTestDb } from '@/data/testing/nodeSqliteDb';
import { countTransactions, listTransactions } from '@/data/transactionsRepo';
import { DAY_MS } from '@/domain/time';

import { importRecentSms, ingestItems, ingestPending, type SmsSource } from '../ingest';

const NOW = Date.UTC(2026, 9, 24, 4, 45);

const sms = (body: string, at: number, sender = 'VM-HDFCBK'): PendingItem => ({
  kind: 'sms',
  sender,
  body,
  receivedAt: at,
});

const INBOX: PendingItem[] = [
  sms(
    'Sent Rs.300.00 From HDFC Bank A/C *1234 To ZOMATO On 24/10/26 Ref 429812345601',
    NOW - DAY_MS,
  ),
  sms('Sent Rs.85 From HDFC Bank A/C *1234 To blinkit@hdfcbank Ref 429812345602', NOW - 2 * DAY_MS),
  sms('OTP is 482913 for txn of INR 1,250.50 at AMAZON. Do not share OTP.', NOW - DAY_MS),
  sms('Hi, dinner at 8? I paid Rs 500 for the table', NOW - DAY_MS, '+919876543210'),
];

function fakeSource(
  inbox: PendingItem[],
  pending: PendingItem[] = [],
): SmsSource & { reads: number[] } {
  const reads: number[] = [];
  return {
    reads,
    readBankSms: async (since) => {
      reads.push(since);
      return inbox.filter((i) => i.kind === 'sms' && i.receivedAt >= since);
    },
    peekPending: async () => [...pending],
    ackPending: async (upToSeq) => {
      const kept = pending.filter((i) => (i.queueSeq ?? Infinity) > upToSeq);
      pending.splice(0, pending.length, ...kept);
    },
  };
}

describe('ingest service', () => {
  it('imports the last 90 days, ignoring OTPs and personal SMS', async () => {
    const db = createTestDb();
    await migrate(db);
    const clock = createTestClock(NOW);
    const source = fakeSource(INBOX);

    const summary = await importRecentSms(db, source, clock);

    expect(source.reads).toEqual([NOW - 90 * DAY_MS]);
    expect(summary.inserted).toHaveLength(2);
    expect(summary.ignored).toBe(2);
    expect((await getSettings(db)).smsImportDone).toBe(true);
    const stored = await listTransactions(db);
    expect(stored.map((t) => t.category)).toEqual(['food', 'groceries']);
    // Raw SMS text is never persisted.
    const rows = await db.getAllAsync<Record<string, unknown>>('SELECT * FROM transactions', []);
    expect(JSON.stringify(rows)).not.toContain('Sent Rs.');
    db.close();
  });

  it('re-delivery of an already imported SMS (live receiver) is a duplicate', async () => {
    const db = createTestDb();
    await migrate(db);
    const clock = createTestClock(NOW);
    await importRecentSms(db, fakeSource(INBOX), clock);

    const first = INBOX[0];
    if (!first) throw new Error('fixture missing');
    const summary = await ingestPending(db, fakeSource([], [first]), clock);
    expect(summary).toMatchObject({ inserted: [], duplicates: 1 });
    expect(await countTransactions(db)).toBe(2);
    db.close();
  });

  it('a GPay notification and the bank SMS for the same payment become one transaction', async () => {
    const db = createTestDb();
    await migrate(db);
    const clock = createTestClock(NOW);
    const summary = await ingestItems(
      db,
      [
        sms(
          'Sent Rs.300.00 From HDFC Bank A/C *1234 To THIRD WAVE COFFEE Ref 429812345603',
          NOW + 20_000,
        ),
        {
          kind: 'notification',
          packageName: 'com.google.android.apps.nbu.paisa.user',
          title: 'Paid ₹300 to Third Wave Coffee',
          text: 'Payment successful',
          postedAt: NOW,
        },
      ],
      clock,
    );
    expect(summary.inserted).toHaveLength(1);
    expect(summary.merged).toBe(1);
    const [tx] = await listTransactions(db);
    expect(tx).toMatchObject({ upiRef: '429812345603', accountLast4: '1234', category: 'coffee' });
    db.close();
  });
});
