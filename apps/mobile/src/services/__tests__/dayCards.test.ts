import { getSnapshot } from '@/data/budgetRepo';
import { migrate, type SqlDb } from '@/data/db';
import { getProfile, saveProfile } from '@/data/profileRepo';
import { setSetting } from '@/data/settingsRepo';
import { createTestClock, createTestDb } from '@/data/testing/nodeSqliteDb';
import { addManual } from '@/data/transactionsRepo';

import { claimDueCard } from '../dayCards';

/** Epoch ms for a time of day in India (IST = UTC+05:30). */
const ist = (d: number, h: number, mi = 0) => Date.UTC(2026, 8, d, h, mi) - 330 * 60_000;

let db: SqlDb & { close(): void };
let clock: ReturnType<typeof createTestClock>;

/** ₹30,000 spendable in a 30-day September (payday 1) → ₹1,000 on day one. */
async function setUp(onboarded = true) {
  await saveProfile(
    db,
    { monthlySalaryPaise: 30000_00, payday: 1, monthlySavingsGoalPaise: 0 },
    clock,
    null,
  );
  await setSetting(db, 'onboardingComplete', onboarded);
  const profile = await getProfile(db);
  if (!profile) throw new Error('profile missing');
  return profile;
}

const spend = (amountPaise: number, at: number) =>
  addManual(
    db,
    { amountPaise, category: 'food', note: null, merchant: null, occurredAt: at },
    clock,
  );

beforeEach(async () => {
  db = createTestDb();
  clock = createTestClock();
  await migrate(db);
});

afterEach(() => db.close());

describe('claimDueCard', () => {
  it('shows nothing before onboarding is complete', async () => {
    await setUp(false);
    expect(await claimDueCard(db, ist(2, 8))).toBeNull();
  });

  it('shows the morning card once, however many times the app opens that day', async () => {
    await setUp();
    const first = await claimDueCard(db, ist(2, 8));
    expect(first?.kind).toBe('morning');
    for (const h of [9, 12, 18, 20]) expect(await claimDueCard(db, ist(2, h))).toBeNull();
  });

  it('two checks racing each other still show the card once', async () => {
    await setUp();
    const [a, b] = await Promise.all([claimDueCard(db, ist(2, 8)), claimDueCard(db, ist(2, 8))]);
    expect([a, b].filter(Boolean)).toHaveLength(1);
  });

  it('compares with yesterday from the recorded payments (less spent → celebrate)', async () => {
    await setUp();
    await spend(600_00, ist(1, 13)); // ₹600 of ₹1,000 on the 1st
    const card = await claimDueCard(db, ist(2, 8));
    expect(card?.mood).toBe('celebrate');
    expect(card?.message).toContain('₹400 extra from yesterday');
    // ₹29,400 left ÷ 29 days = ₹1,013.79
    expect(card?.amountPaise).toBe(101379);
  });

  it('is supportive after an overspend yesterday, with the adjusted allowance', async () => {
    await setUp();
    await spend(2450_00, ist(1, 20)); // ₹1,450 over
    const card = await claimDueCard(db, ist(2, 8));
    expect(card?.mood).toBe('support');
    expect(card?.message).toContain('₹1,450 over');
    expect(card?.amountPaise).toBe(95000); // ₹27,550 ÷ 29
  });

  it('works out yesterday even if the app was closed all day', async () => {
    await setUp();
    await spend(1000_00, ist(1, 12)); // spent exactly the allowance; app not opened on the 1st
    const card = await claimDueCard(db, ist(2, 9));
    expect(card?.mood).toBe('steady');
  });

  it('is neutral on payday: a new cycle has nothing to carry over', async () => {
    await setUp();
    await spend(9000_00, ist(30, 12)); // big spend on the last day of September
    const card = await claimDueCard(db, Date.UTC(2026, 9, 1, 3, 0)); // 1 Oct 08:30 IST
    expect(card?.title).toBe('A new pay cycle starts today');
    expect(card?.amountPaise).toBe(96774); // ₹30,000 ÷ 31: last cycle's overspend does not follow
  });

  it('shows the night card from 9 pm with what is really left today', async () => {
    const profile = await setUp();
    await claimDueCard(db, ist(2, 8)); // morning card seen
    await spend(400_00, ist(2, 13)); // expense after the morning card
    expect(await claimDueCard(db, ist(2, 20, 59))).toBeNull();
    const night = await claimDueCard(db, ist(2, 21, 5));
    expect(night?.kind).toBe('night');
    const snap = await getSnapshot(db, profile, ist(2, 21, 5));
    expect(night?.amountPaise).toBe(snap.remainingTodayPaise);
    expect(night?.stats[0]).toEqual({ label: 'Spent today', value: '₹400' });
  });

  it('missed the 9 pm reminder: the night card appears at the next open, once', async () => {
    await setUp();
    const late = await claimDueCard(db, ist(2, 23, 30)); // first open of the day, late
    expect(late?.kind).toBe('night');
    expect(await claimDueCard(db, ist(2, 23, 45))).toBeNull();
  });

  it('an expense after the night card updates the numbers but never re-shows the card', async () => {
    const profile = await setUp();
    await claimDueCard(db, ist(2, 21, 10));
    const before = await getSnapshot(db, profile, ist(2, 21, 30));
    await spend(300_00, ist(2, 21, 40));
    expect(await claimDueCard(db, ist(2, 22))).toBeNull();
    const after = await getSnapshot(db, profile, ist(2, 22));
    expect(after.remainingTodayPaise).toBe(before.remainingTodayPaise - 300_00);
    expect(after.nextDaysAveragePaise).toBeLessThan(before.nextDaysAveragePaise ?? 0);
  });

  it('crossing midnight makes both cards due again for the new day', async () => {
    await setUp();
    await claimDueCard(db, ist(2, 8));
    await claimDueCard(db, ist(2, 21, 30));
    expect(await claimDueCard(db, ist(2, 23, 59))).toBeNull();
    expect((await claimDueCard(db, ist(3, 0, 5)))?.kind).toBe('morning');
  });

  it('a changed salary date moves the cycle the cards use', async () => {
    await setUp();
    await saveProfile(
      db,
      { monthlySalaryPaise: 30000_00, payday: 2, monthlySavingsGoalPaise: 0 },
      clock,
      null,
    );
    const card = await claimDueCard(db, ist(2, 8)); // the 2nd is now payday
    expect(card?.title).toBe('A new pay cycle starts today');
  });
});
