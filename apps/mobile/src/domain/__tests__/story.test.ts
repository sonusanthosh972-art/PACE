import type { InsightTx } from '../insights';
import { buildStory, compareWeeks, weekStart, type StoryInput, type StoryLine } from '../story';
import { atTimeMs, type DateKey } from '../time';

// 2026-11-05 is a Thursday; that week starts Monday 2026-11-02.
const TODAY: DateKey = '2026-11-05';

const tx = (date: DateKey, amountPaise: number, p: Partial<InsightTx> = {}): InsightTx => ({
  amountPaise,
  direction: 'debit',
  category: 'food',
  isExcluded: false,
  merchantNorm: 'cafe',
  merchantDisplay: 'Cafe',
  occurredAt: atTimeMs(date, 13, 0),
  ...p,
});

const text = (line: StoryLine | undefined) =>
  line?.parts.map((p) => (typeof p === 'string' ? p : p.strong)).join('') ?? '';

const base: StoryInput = {
  today: TODAY,
  week: { thisWeekPaise: 0, lastWeekPaise: 0, daysSoFar: 4, topCategory: null },
  cycleTopCategory: null,
  days: [],
  leaks: { count: 0, totalPaise: 0 },
  split: { essentialPaise: 0, nonEssentialPaise: 0 },
};

describe('weekStart', () => {
  it('starts weeks on Monday', () => {
    expect(weekStart('2026-11-02')).toBe('2026-11-02'); // Monday
    expect(weekStart(TODAY)).toBe('2026-11-02'); // Thursday
    expect(weekStart('2026-11-08')).toBe('2026-11-02'); // Sunday
  });
});

describe('compareWeeks', () => {
  it('compares Monday→today with the same weekdays last week', () => {
    const txs = [
      tx('2026-11-02', 300_00, { category: 'transport' }),
      tx('2026-11-05', 200_00, { category: 'food' }),
      tx('2026-11-05', 150_00, { category: 'food' }),
      // Last week, Mon–Thu: counted.
      tx('2026-10-26', 500_00),
      tx('2026-10-29', 400_00),
      // Last Friday is after "the same point" last week: not counted.
      tx('2026-10-30', 9_999_00),
      // Excluded payments never count.
      tx('2026-11-03', 5_000_00, { isExcluded: true }),
    ];
    expect(compareWeeks(txs, TODAY)).toEqual({
      thisWeekPaise: 650_00,
      lastWeekPaise: 900_00,
      daysSoFar: 4,
      topCategory: 'food',
    });
  });

  it('has no top category for a week without spending', () => {
    expect(compareWeeks([tx('2026-10-27', 100_00)], TODAY).topCategory).toBeNull();
  });
});

describe('buildStory', () => {
  it('says nothing when there is nothing to say', () => {
    expect(buildStory(base)).toEqual([]);
  });

  it('names the biggest category of the week, falling back to the cycle', () => {
    const week = buildStory({ ...base, week: { ...base.week, topCategory: 'food' } });
    expect(text(week[0])).toBe('Food & Dining has been your biggest expense this week.');
    const cycle = buildStory({ ...base, cycleTopCategory: 'transport' });
    expect(text(cycle[0])).toBe('Transport has been your biggest expense this cycle.');
  });

  it('describes the week-on-week change in rupees, without judgement', () => {
    const less = buildStory({
      ...base,
      week: { ...base.week, thisWeekPaise: 2_700_00, lastWeekPaise: 3_000_00 },
    });
    expect(text(less.find((l) => l.id === 'week'))).toBe(
      "You've spent ₹300 less than this point last week.",
    );

    const more = buildStory({
      ...base,
      week: { ...base.week, thisWeekPaise: 3_500_00, lastWeekPaise: 3_000_00 },
    });
    const line = text(more.find((l) => l.id === 'week'));
    expect(line).toContain('₹500 more than this point last week.');
    expect(line).not.toMatch(/overspent|bad|fail/i);
  });

  it('calls small differences "about the same" and says "last week" on Sunday', () => {
    const lines = buildStory({
      ...base,
      week: { ...base.week, daysSoFar: 7, thisWeekPaise: 3_050_00, lastWeekPaise: 3_000_00 },
    });
    expect(text(lines.find((l) => l.id === 'week'))).toBe(
      "You're spending about the same as last week.",
    );
  });

  it('skips the comparison when either week is empty', () => {
    const lines = buildStory({ ...base, week: { ...base.week, thisWeekPaise: 100_00 } });
    expect(lines.find((l) => l.id === 'week')).toBeUndefined();
  });

  it('counts finished days within the allowance, ignoring today and pre-budget days', () => {
    const days = [
      { date: '2026-11-01', spentPaise: 5_000_00, budgetPaise: null }, // before budgeting
      { date: '2026-11-02', spentPaise: 800_00, budgetPaise: 1_000_00 },
      { date: '2026-11-03', spentPaise: 1_200_00, budgetPaise: 1_000_00 },
      { date: '2026-11-04', spentPaise: 1_000_00, budgetPaise: 1_000_00 },
      { date: TODAY, spentPaise: 9_000_00, budgetPaise: 1_000_00 }, // still going
    ];
    expect(text(buildStory({ ...base, days }).find((l) => l.id === 'allowance'))).toBe(
      '2 of 3 days stayed within your daily allowance.',
    );

    const allGood = days.map((d) => ({ ...d, spentPaise: 0 }));
    expect(text(buildStory({ ...base, days: allGood }).find((l) => l.id === 'allowance'))).toBe(
      'Every day so far has stayed within your daily allowance.',
    );

    const mostlyOver = days.map((d) => ({ ...d, spentPaise: 2_000_00 }));
    const gentle = text(
      buildStory({ ...base, days: mostlyOver }).find((l) => l.id === 'allowance'),
    );
    expect(gentle).toContain('0 of 3 days');
    expect(gentle).toContain('Each new day starts fresh.');
  });

  it('describes small payments and the essentials split', () => {
    const lines = buildStory({
      ...base,
      leaks: { count: 1, totalPaise: 120_00 },
      split: { essentialPaise: 300_00, nonEssentialPaise: 700_00 },
    });
    expect(text(lines.find((l) => l.id === 'small'))).toBe(
      '₹120 went on 1 small payment under ₹500.',
    );
    expect(text(lines.find((l) => l.id === 'split'))).toBe(
      '70% of your spending went on extras, the rest on essentials.',
    );
  });
});
