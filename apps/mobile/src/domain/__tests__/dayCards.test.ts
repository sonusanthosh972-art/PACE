import { cardKey, dueCard, minutesOfDay, morningCard, nightCard } from '../dayCards';

/** Epoch ms for a time of day in India (IST = UTC+05:30). */
const ist = (y: number, mo: number, d: number, h: number, mi = 0) =>
  Date.UTC(y, mo - 1, d, h, mi) - 330 * 60_000;

const NIGHT = { hour: 21, minute: 0 };
const SHAMING = /fail|bad|careless|shame|irresponsible|wasted/i;

describe('minutesOfDay', () => {
  it('uses India time whatever the phone time zone', () => {
    expect(minutesOfDay(ist(2026, 11, 16, 0, 0))).toBe(0);
    expect(minutesOfDay(ist(2026, 11, 16, 21, 0))).toBe(21 * 60);
    expect(minutesOfDay(ist(2026, 11, 16, 23, 59))).toBe(23 * 60 + 59);
  });
});

describe('dueCard: once per day each', () => {
  const at = (h: number, mi = 0) => ist(2026, 11, 16, h, mi);
  const due = (now: number, morningSeen = false, nightSeen = false) =>
    dueCard({ now, nightTime: NIGHT, morningSeen, nightSeen });

  it('shows the morning card on the first open of the day', () => {
    expect(due(at(8))).toBe('morning');
    expect(due(at(14, 30))).toBe('morning');
  });

  it('never again that day once seen, however often the app is opened', () => {
    for (const h of [8, 11, 15, 20]) expect(due(at(h), true)).toBeNull();
  });

  it('shows the night card from 9 pm, also when the app is first opened later', () => {
    expect(due(at(20, 59), true)).toBeNull();
    expect(due(at(21, 0), true)).toBe('night');
    expect(due(at(23, 40), true)).toBe('night'); // missed the reminder, opened later
  });

  it('gives a first open after 9 pm the night card, not a stale good-morning', () => {
    expect(due(at(22), false, false)).toBe('night');
  });

  it('never shows the night card twice', () => {
    expect(due(at(21, 30), true, true)).toBeNull();
    expect(due(at(23, 59), false, true)).toBeNull();
  });

  it('crossing midnight starts a new day with its own keys', () => {
    const before = ist(2026, 11, 16, 23, 59);
    const after = ist(2026, 11, 17, 0, 1);
    expect(cardKey('night', '2026-11-16')).not.toBe(cardKey('night', '2026-11-17'));
    expect(due(before, true, true)).toBeNull();
    // New day: nothing seen yet under the new date key, so the morning card is due again.
    expect(due(after, false, false)).toBe('morning');
  });

  it('follows a custom night time', () => {
    const late = { hour: 22, minute: 30 };
    expect(dueCard({ now: at(22), nightTime: late, morningSeen: true, nightSeen: false })).toBe(
      null,
    );
    expect(dueCard({ now: at(22, 30), nightTime: late, morningSeen: true, nightSeen: false })).toBe(
      'night',
    );
  });
});

describe('morningCard', () => {
  const base = { now: ist(2026, 11, 16, 8), todayAllowancePaise: 450_00, daysLeft: 12 };

  it('celebrates money kept yesterday and shows today’s allowance', () => {
    const card = morningCard({
      ...base,
      newCycle: false,
      yesterday: { budgetPaise: 400_00, spentPaise: 250_00 },
    });
    expect(card.mood).toBe('celebrate');
    expect(card.title).toBe('You did great yesterday! 🎉');
    expect(card.message).toContain('You have ₹150 extra from yesterday');
    expect(card.message).toContain('Your available allowance today is ₹450.');
    expect(card.amountPaise).toBe(450_00);
    expect(card.action).toBe('Continue');
    expect(card.stats.map((s) => s.label)).toEqual([
      "Yesterday's allowance",
      'Spent yesterday',
      'Until payday',
    ]);
  });

  it('is supportive, never shaming, after an overspend', () => {
    const card = morningCard({
      ...base,
      todayAllowancePaise: 250_00,
      newCycle: false,
      yesterday: { budgetPaise: 400_00, spentPaise: 550_00 },
    });
    expect(card.mood).toBe('support');
    expect(card.message).toBe(
      "Yesterday you went ₹150 over your allowance. Don't worry! Your adjusted daily allowance is ₹250 today.",
    );
    expect(`${card.title} ${card.message}`).not.toMatch(SHAMING);
  });

  it('notes spending exactly the allowance', () => {
    const card = morningCard({
      ...base,
      newCycle: false,
      yesterday: { budgetPaise: 400_00, spentPaise: 400_00 },
    });
    expect(card.mood).toBe('steady');
  });

  it('is neutral when there is no data for yesterday', () => {
    const card = morningCard({ ...base, newCycle: false, yesterday: null });
    expect(card.mood).toBe('neutral');
    expect(card.title).toBe('Good morning');
    expect(card.message).toContain('₹450');
    expect(card.stats).toEqual([{ label: 'Until payday', value: '12 days' }]);
  });

  it('greets by the time of the first open', () => {
    const afternoon = morningCard({
      ...base,
      now: ist(2026, 11, 16, 15),
      newCycle: false,
      yesterday: null,
    });
    expect(afternoon.title).toBe('Good afternoon');
  });

  it('starts a new pay cycle fresh, without comparing to the old one', () => {
    const card = morningCard({
      ...base,
      newCycle: true,
      yesterday: { budgetPaise: 400_00, spentPaise: 900_00 },
    });
    expect(card.title).toBe('A new pay cycle starts today');
    expect(card.message).not.toContain('over');
  });

  it('is gentle when the cycle’s money is used up (₹0, never negative)', () => {
    const card = morningCard({
      ...base,
      todayAllowancePaise: 0,
      newCycle: false,
      yesterday: { budgetPaise: 100_00, spentPaise: 900_00 },
    });
    expect(card.mood).toBe('resting');
    expect(card.amountPaise).toBe(0);
    expect(`${card.title} ${card.message}`).not.toMatch(SHAMING);
  });
});

describe('nightCard', () => {
  it('celebrates money left today, with today’s spending and the days ahead', () => {
    const card = nightCard({
      budgetPaise: 500_00,
      spentPaise: 320_00,
      nextDaysAveragePaise: 520_00,
    });
    expect(card.mood).toBe('celebrate');
    expect(card.message).toContain("You still have ₹180 left from today's allowance");
    expect(card.amountPaise).toBe(180_00);
    expect(card.action).toBe('Got it');
    expect(card.stats).toEqual([
      { label: 'Spent today', value: '₹320' },
      { label: "Today's allowance", value: '₹500' },
      { label: 'From tomorrow', value: '₹520 a day' },
    ]);
  });

  it('explains an overspend and the adjusted days ahead, calmly', () => {
    const card = nightCard({
      budgetPaise: 500_00,
      spentPaise: 600_00,
      nextDaysAveragePaise: 480_00,
    });
    expect(card.mood).toBe('support');
    expect(card.message).toBe(
      "You exceeded today's allowance by ₹100. Your remaining budget has been adjusted to ₹480 a day until payday.",
    );
    expect(card.amountPaise).toBe(100_00);
    expect(`${card.title} ${card.message}`).not.toMatch(SHAMING);
  });

  it('handles the last day of the cycle (payday tomorrow)', () => {
    const card = nightCard({ budgetPaise: 500_00, spentPaise: 600_00, nextDaysAveragePaise: null });
    expect(card.message).toContain('Payday is tomorrow');
    expect(card.stats.at(-1)).toEqual({ label: 'Payday', value: 'Tomorrow' });
  });

  it('notes spending exactly the allowance, and a ₹0 day', () => {
    expect(
      nightCard({ budgetPaise: 500_00, spentPaise: 500_00, nextDaysAveragePaise: 500_00 }).mood,
    ).toBe('steady');
    expect(nightCard({ budgetPaise: 0, spentPaise: 0, nextDaysAveragePaise: 0 }).mood).toBe(
      'resting',
    );
  });
});
