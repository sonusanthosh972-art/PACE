import {
  computeTodayBudget,
  countsAsSpend,
  cycleFor,
  daysLeftInCycle,
  effectivePayday,
  onBudgetStreak,
  remainingToday,
  snapshotForDay,
  spendableForCycle,
  totalSpend,
  type BudgetProfile,
} from '../budget';

const rupees = (r: number) => Math.round(r * 100);

const PROFILE: BudgetProfile = {
  monthlySalaryPaise: rupees(100000),
  payday: 1,
  fixedExpenses: [
    { id: 'rent', name: 'Rent', amountPaise: rupees(30000), dueDay: 5 },
    { id: 'emi', name: 'EMI', amountPaise: rupees(10000), dueDay: 10 },
  ],
  monthlySavingsGoalPaise: rupees(10000),
};

describe('required budget scenarios', () => {
  it('salary 100000, fixed 40000, savings 10000, 30-day cycle, day 1 → ₹1,666.67/day', () => {
    const spendable = spendableForCycle(PROFILE);
    expect(spendable).toBe(rupees(50000));
    // September 2026 has 30 days, payday 1 → 30-day cycle.
    const cycle = cycleFor('2026-09-01', PROFILE.payday);
    expect(cycle.totalDays).toBe(30);
    const daysLeft = daysLeftInCycle('2026-09-01', cycle);
    expect(daysLeft).toBe(30);
    expect(
      computeTodayBudget({ spendablePaise: spendable, spentBeforeTodayPaise: 0, daysLeft }),
    ).toBe(166667);
  });

  it('overspend 4200 on day 1 → day 2 budget = (50000−4200)/29 = ₹1,579.31', () => {
    const cycle = cycleFor('2026-09-02', PROFILE.payday);
    const daysLeft = daysLeftInCycle('2026-09-02', cycle);
    expect(daysLeft).toBe(29);
    expect(
      computeTodayBudget({
        spendablePaise: spendableForCycle(PROFILE),
        spentBeforeTodayPaise: rupees(4200),
        daysLeft,
      }),
    ).toBe(157931);
  });

  it('spendable already exhausted → todayBudget 0, never negative', () => {
    expect(
      computeTodayBudget({
        spendablePaise: rupees(50000),
        spentBeforeTodayPaise: rupees(52000),
        daysLeft: 10,
      }),
    ).toBe(0);
    expect(
      computeTodayBudget({ spendablePaise: -rupees(500), spentBeforeTodayPaise: 0, daysLeft: 3 }),
    ).toBe(0);
  });
});

describe('salary cycle', () => {
  it('runs from payday to the day before the next payday', () => {
    expect(cycleFor('2026-10-24', 25)).toEqual({
      start: '2026-09-25',
      end: '2026-10-24',
      totalDays: 30,
    });
    expect(cycleFor('2026-10-25', 25)).toEqual({
      start: '2026-10-25',
      end: '2026-11-24',
      totalDays: 31,
    });
  });

  it('payday 31 in February is the last day of February', () => {
    expect(effectivePayday(2026, 2, 31)).toBe(28);
    expect(effectivePayday(2028, 2, 31)).toBe(29);
    expect(cycleFor('2026-02-28', 31)).toEqual({
      start: '2026-02-28',
      end: '2026-03-30',
      totalDays: 31,
    });
    expect(cycleFor('2026-02-27', 31)).toEqual({
      start: '2026-01-31',
      end: '2026-02-27',
      totalDays: 28,
    });
    expect(cycleFor('2026-03-31', 31)).toEqual({
      start: '2026-03-31',
      end: '2026-04-29',
      totalDays: 30,
    });
  });

  it('payday 30 across a short April and February', () => {
    expect(cycleFor('2026-04-30', 30).start).toBe('2026-04-30');
    expect(cycleFor('2026-03-01', 30)).toEqual({
      start: '2026-02-28',
      end: '2026-03-29',
      totalDays: 30,
    });
  });

  it('crosses the year boundary', () => {
    expect(cycleFor('2027-01-03', 28)).toEqual({
      start: '2026-12-28',
      end: '2027-01-27',
      totalDays: 31,
    });
  });

  it('daysLeft includes today and is at least 1', () => {
    const cycle = cycleFor('2026-10-24', 25);
    expect(daysLeftInCycle('2026-10-24', cycle)).toBe(1);
    expect(daysLeftInCycle('2026-11-30', cycle)).toBe(1);
  });
});

describe('spend rules', () => {
  const base = { amountPaise: 1000, direction: 'debit' as const, isExcluded: false };

  it('counts ordinary debits only', () => {
    expect(countsAsSpend({ ...base, category: 'food' })).toBe(true);
    expect(countsAsSpend({ ...base, category: 'food', direction: 'credit' })).toBe(false);
    expect(countsAsSpend({ ...base, category: 'food', isExcluded: true })).toBe(false);
    expect(countsAsSpend({ ...base, category: 'rent_emi' })).toBe(false);
  });

  it('totals spend in paise', () => {
    expect(
      totalSpend([
        { ...base, category: 'food' },
        { ...base, amountPaise: 2550, category: 'coffee' },
        { ...base, category: 'rent_emi' },
      ]),
    ).toBe(3550);
  });

  it('remainingToday can go negative', () => {
    expect(remainingToday(157931, 210000)).toBe(-52069);
  });
});

describe('snapshotForDay', () => {
  it('uses the frozen budget when present, even after more spending', () => {
    const s = snapshotForDay({
      profile: PROFILE,
      today: '2026-09-02',
      cycleSpendBeforeTodayPaise: rupees(9999), // would give a different budget if recomputed
      spentTodayPaise: rupees(300),
      frozenTodayBudgetPaise: 157931,
    });
    expect(s.todayBudgetPaise).toBe(157931);
    expect(s.remainingTodayPaise).toBe(157931 - 30000);
  });

  it('computes when nothing is frozen yet', () => {
    const s = snapshotForDay({
      profile: PROFILE,
      today: '2026-09-02',
      cycleSpendBeforeTodayPaise: rupees(4200),
      spentTodayPaise: 0,
    });
    expect(s.todayBudgetPaise).toBe(157931);
    expect(s.usedRatio).toBe(0);
  });

  it('reports a used ratio of 1 when the budget is zero but money was spent', () => {
    const s = snapshotForDay({
      profile: PROFILE,
      today: '2026-09-20',
      cycleSpendBeforeTodayPaise: rupees(60000),
      spentTodayPaise: rupees(10),
    });
    expect(s.todayBudgetPaise).toBe(0);
    expect(s.usedRatio).toBe(1);
  });
});

describe('onBudgetStreak', () => {
  it('counts consecutive on-budget days ending yesterday', () => {
    const days = [
      { date: '2026-10-23', budgetPaise: 1000, spentPaise: 900 },
      { date: '2026-10-22', budgetPaise: 1000, spentPaise: 1000 },
      { date: '2026-10-21', budgetPaise: 1000, spentPaise: 1200 },
      { date: '2026-10-20', budgetPaise: 1000, spentPaise: 100 },
    ];
    expect(onBudgetStreak('2026-10-24', days)).toBe(2);
  });

  it('is 0 when yesterday has no record', () => {
    expect(
      onBudgetStreak('2026-10-24', [{ date: '2026-10-22', budgetPaise: 1, spentPaise: 0 }]),
    ).toBe(0);
  });
});
