import type { CategoryTotal, InsightTx } from '../insights';
import {
  biggestDay,
  breakdown,
  buildPatterns,
  cycleLabel,
  cycleMonthName,
  quietWin,
  type PatternInput,
} from '../story';
import { atTimeMs, type DateKey } from '../time';

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

const cat = (
  category: CategoryTotal['category'],
  totalPaise: number,
  count = 1,
): CategoryTotal => ({
  category,
  totalPaise,
  count,
});

describe('cycle names', () => {
  it('names a cycle after the month it starts in', () => {
    expect(cycleLabel('2026-11-01')).toBe('Nov 2026');
    expect(cycleLabel('2026-10-25')).toBe('Oct 2026');
    expect(cycleMonthName('2026-10-01')).toBe('October');
  });
});

describe('breakdown', () => {
  it('shows the top four and combines the rest as Others', () => {
    const rows = breakdown([
      cat('food', 2_140_00),
      cat('transport', 1_320_00),
      cat('shopping', 1_080_00),
      cat('bills', 890_00),
      cat('health', 600_00),
      cat('coffee', 400_00),
    ]);
    expect(rows.map((r) => r.label)).toEqual(['Food', 'Transport', 'Shopping', 'Bills', 'Others']);
    expect(rows[4]).toMatchObject({ category: null, totalPaise: 1_000_00 });
    expect(rows[0]?.pct).toBe(33);
  });

  it('never makes an "Others" row out of a single category', () => {
    const rows = breakdown([
      cat('food', 500_00),
      cat('transport', 400_00),
      cat('shopping', 300_00),
      cat('bills', 200_00),
      cat('health', 100_00),
    ]);
    expect(rows.map((r) => r.label)).toEqual(['Food', 'Transport', 'Shopping', 'Bills', 'Health']);
  });

  it('is empty when nothing was spent', () => {
    expect(breakdown([])).toEqual([]);
  });
});

describe('buildPatterns', () => {
  const base: PatternInput = {
    byCategory: [cat('food', 2_140_00), cat('transport', 1_320_00), cat('shopping', 460_00)],
    totalSpentPaise: 8_420_00,
    days: [
      { date: '2026-11-01', spentPaise: 500_00, budgetPaise: 1_000_00 },
      { date: '2026-11-02', spentPaise: 900_00, budgetPaise: 1_000_00 },
      { date: '2026-11-03', spentPaise: 2_000_00, budgetPaise: 1_000_00 }, // today, still going
    ],
    lastFinishedDay: '2026-11-02',
    previousPaise: 0,
    previousStart: '2026-10-01',
    inProgress: true,
  };

  it('names the biggest category with its share', () => {
    const top = buildPatterns(base).find((p) => p.id === 'top');
    expect(top?.title).toBe('Food was your biggest expense this cycle.');
    expect(top?.detail).toBe(
      `₹2,140 · ${Math.round((2_140_00 / 3_920_00) * 100)}% of total spending`,
    );
  });

  it('says "On track" only when every finished day stayed within the allowance', () => {
    const allowance = buildPatterns(base).find((p) => p.id === 'allowance');
    expect(allowance?.title).toBe("You're staying within your daily allowance.");
    expect(allowance?.badge).toBe('On track');
    expect(allowance?.detail).toBe('About ₹2,807 per day');

    const mostlyOver = buildPatterns({
      ...base,
      days: base.days.map((d) => ({ ...d, spentPaise: 5_000_00 })),
    }).find((p) => p.id === 'allowance');
    expect(mostlyOver?.badge).toBeUndefined();
    expect(mostlyOver?.title).toBe('Some days ran above your allowance.');
    expect(mostlyOver?.detail).toContain('the days ahead adjust to cover it');
  });

  it('compares with the same stretch of last cycle, gently', () => {
    const less = buildPatterns({ ...base, previousPaise: 9_570_00 }).find(
      (p) => p.id === 'compare',
    );
    expect(less?.title).toBe('You spent 12% less than at this point last cycle.');
    expect(less?.detail).toBe('₹1,150 lower than October');

    const more = buildPatterns({ ...base, previousPaise: 7_000_00, inProgress: false }).find(
      (p) => p.id === 'compare',
    );
    expect(more?.title).toBe('You spent 20% more than last cycle.');
    expect(more?.tone).toBe('amber');
    expect(`${more?.title} ${more?.detail}`).not.toMatch(/overspent|bad|fail/i);
  });

  it('leaves out what it cannot say honestly', () => {
    const patterns = buildPatterns({
      ...base,
      byCategory: [],
      totalSpentPaise: 0,
      days: [{ date: '2026-11-01', spentPaise: 0, budgetPaise: 1_000_00 }],
      lastFinishedDay: '2026-10-31',
    });
    expect(patterns).toEqual([]);
  });
});

describe('biggestDay', () => {
  it('finds the day with the most spending and its top categories', () => {
    const day = biggestDay([
      tx('2026-11-02', 300_00),
      tx('2026-11-14', 700_00, { category: 'food' }),
      tx('2026-11-14', 340_00, { category: 'shopping' }),
      tx('2026-11-14', 200_00, { category: 'transport' }),
      tx('2026-11-14', 100_00, { category: 'health' }),
    ]);
    expect(day).toEqual({
      date: '2026-11-14',
      totalPaise: 1_340_00,
      categories: ['food', 'shopping', 'transport'],
    });
  });

  it('is null with no spending', () => {
    expect(biggestDay([])).toBeNull();
  });
});

describe('quietWin', () => {
  it('celebrates the biggest drop against last cycle', () => {
    expect(
      quietWin({
        current: [cat('transport', 900_00), cat('food', 2_000_00)],
        previous: [cat('transport', 1_320_00), cat('food', 2_100_00)],
        daysWithin: 3,
      }),
    ).toEqual({ before: 'You spent ', strong: '₹420', after: ' less on transport this cycle.' });
  });

  it('falls back to days within the allowance, and stays quiet otherwise', () => {
    expect(quietWin({ current: [], previous: [], daysWithin: 5 })).toEqual({
      before: '',
      strong: '5 days',
      after: ' stayed within your daily allowance.',
    });
    expect(quietWin({ current: [], previous: [], daysWithin: 0 })).toBeNull();
  });
});
