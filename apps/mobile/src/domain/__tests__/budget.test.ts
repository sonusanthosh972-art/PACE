import {
  cycleLeft,
  dailyAllowance,
  nextDaysAverage,
  rollingAllowance,
  countsAsSpend,
  cycleFor,
  daysLeftInCycle,
  effectivePayday,
  onBudgetStreak,
  poolForCycle,
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

describe('daily allowance: the starting pace of the month', () => {
  it('salary 100000, fixed 40000, savings 10000, 30-day cycle → ₹1,666.67 on day one', () => {
    const spendable = spendableForCycle(PROFILE);
    expect(spendable).toBe(rupees(50000));
    // September 2026 has 30 days, payday 1 → 30-day cycle.
    const cycle = cycleFor('2026-09-01', PROFILE.payday);
    expect(cycle.totalDays).toBe(30);
    expect(dailyAllowance(PROFILE, cycle)).toBe(166667);
  });

  it('a steady pace keeps the same allowance late in the month', () => {
    const profile: BudgetProfile = {
      monthlySalaryPaise: rupees(50000),
      payday: 1,
      fixedExpenses: [],
      monthlySavingsGoalPaise: rupees(20000),
      startDate: '2026-08-01',
    };
    const s = snapshotForDay({
      profile,
      today: '2026-10-29', // 29, 30, 31 left in a 31-day October cycle
      cycleSpendBeforeTodayPaise: 28 * 96774, // spent exactly the pace for 28 days
      spentTodayPaise: 0,
    });
    expect(s.daysLeft).toBe(3);
    // ₹30,000 ÷ 31 = ₹967.74, still (within paise of rounding carried over 28 days)
    expect(Math.abs(s.todayBudgetPaise - 96774)).toBeLessThanOrEqual(3);
  });

  it('is 0, never negative, when fixed costs and savings use up the salary', () => {
    const cycle = cycleFor('2026-09-01', 1);
    expect(dailyAllowance({ ...PROFILE, monthlySavingsGoalPaise: rupees(70000) }, cycle)).toBe(0);
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

  it('totals spend in paise with refunds netted', () => {
    expect(
      totalSpend([
        { ...base, category: 'food' },
        { ...base, amountPaise: 2550, category: 'coffee' },
        { ...base, category: 'rent_emi' },
        { ...base, amountPaise: 500, direction: 'credit', category: 'food' }, // ₹5 refund
      ]),
    ).toBe(3050);

    // Total spend cannot go below zero even if refunds exceed debits
    expect(
      totalSpend([
        { ...base, amountPaise: 1000, category: 'food' },
        { ...base, amountPaise: 2000, direction: 'credit', category: 'food' },
      ]),
    ).toBe(0);
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

  it('uses the carry-forward allowance when nothing is frozen yet', () => {
    const s = snapshotForDay({
      profile: PROFILE,
      today: '2026-09-02',
      cycleSpendBeforeTodayPaise: rupees(4200),
      spentTodayPaise: 0,
    });
    expect(s.todayBudgetPaise).toBe(157931); // ₹45,800 ÷ 29
    expect(s.usedRatio).toBe(0);
  });

  it('reports a used ratio of 1 when the budget is zero but money was spent', () => {
    const s = snapshotForDay({
      profile: { ...PROFILE, monthlySavingsGoalPaise: rupees(70000) },
      today: '2026-09-20',
      cycleSpendBeforeTodayPaise: 0,
      spentTodayPaise: rupees(10),
    });
    expect(s.todayBudgetPaise).toBe(0);
    expect(s.usedRatio).toBe(1);
  });
});

describe('setting up part-way through a cycle', () => {
  // October 2026 cycle with payday 1: 31 days, ₹50,000 spendable → ₹1,612.90/day.
  const cycle = cycleFor('2026-10-28', 1);

  it('prorates the pool to the days covered from the setup day', () => {
    expect(poolForCycle({ ...PROFILE, startDate: '2026-10-28' }, cycle)).toBe(
      Math.round((rupees(50000) * 4) / 31),
    );
  });

  it('gives the normal daily allowance on the setup day, not the whole month in the days left', () => {
    const s = snapshotForDay({
      profile: { ...PROFILE, startDate: '2026-10-28' },
      today: '2026-10-28',
      cycleSpendBeforeTodayPaise: 0,
      spentTodayPaise: 0,
    });
    expect(s.daysLeft).toBe(4);
    expect(s.todayBudgetPaise).toBe(161290); // previously 50000 ÷ 4 = ₹12,500
  });

  it('uses the full pool when set up on payday, before the cycle, or with no start date', () => {
    expect(poolForCycle({ ...PROFILE, startDate: '2026-10-01' }, cycle)).toBe(rupees(50000));
    expect(poolForCycle({ ...PROFILE, startDate: '2026-09-15' }, cycle)).toBe(rupees(50000));
    expect(poolForCycle({ ...PROFILE, startDate: null }, cycle)).toBe(rupees(50000));
  });
});

describe('left until payday', () => {
  // ₹31,000 a month over a 31-day October, no fixed costs → ₹1,000 a day.
  const profile: BudgetProfile = {
    monthlySalaryPaise: rupees(31000),
    payday: 1,
    fixedExpenses: [],
    monthlySavingsGoalPaise: 0,
    startDate: '2026-07-31',
  };

  it('is the cycle money minus everything spent in it, including today', () => {
    const snap = snapshotForDay({
      profile,
      today: '2026-10-29',
      cycleSpendBeforeTodayPaise: rupees(17950),
      spentTodayPaise: rupees(200),
    });
    expect(cycleLeft(snap)).toEqual({
      poolPaise: rupees(31000),
      spentPaise: rupees(18150),
      leftPaise: rupees(12850),
      overPaise: 0,
    });
  });

  it('equals the remaining days’ allowances when every day was spent exactly to plan', () => {
    const snap = snapshotForDay({
      profile,
      today: '2026-10-29',
      cycleSpendBeforeTodayPaise: rupees(28 * 1000), // 1–28 Oct at ₹1,000/day
      spentTodayPaise: 0,
    });
    expect(cycleLeft(snap).leftPaise).toBe(snap.daysLeft * snap.todayBudgetPaise);
  });

  it('shows how far over the cycle money spending has gone, instead of just ₹0', () => {
    const snap = snapshotForDay({
      profile,
      today: '2026-10-29',
      cycleSpendBeforeTodayPaise: rupees(33000),
      spentTodayPaise: rupees(500),
    });
    expect(cycleLeft(snap)).toMatchObject({ leftPaise: 0, overPaise: rupees(2500) });
  });

  it('counts only from the setup day when the budget was set up part-way', () => {
    const snap = snapshotForDay({
      profile: { ...profile, startDate: '2026-10-29' },
      today: '2026-10-29',
      cycleSpendBeforeTodayPaise: 0,
      spentTodayPaise: 0,
    });
    // 3 days covered (29–31) → ₹3,000 = 3 × ₹1,000.
    expect(cycleLeft(snap)).toMatchObject({ poolPaise: rupees(3000), leftPaise: rupees(3000) });
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

describe('carry-forward allowance (daily safe-to-spend)', () => {
  // PROFILE: ₹50,000 spendable in a 30-day September → ₹1,666.67 on day one.
  const day2 = (spentDay1: number) =>
    snapshotForDay({
      profile: PROFILE,
      today: '2026-09-02',
      cycleSpendBeforeTodayPaise: spentDay1,
      spentTodayPaise: 0,
    }).todayBudgetPaise;

  it('spending less than the allowance raises the remaining days', () => {
    // ₹1,000 spent of ₹1,666.67: the ₹666.67 left is shared over 29 days.
    expect(day2(rupees(1000))).toBe(168966); // ₹49,000 ÷ 29
    expect(day2(rupees(1000))).toBeGreaterThan(166667);
  });

  it('spending exactly the allowance keeps it the same', () => {
    expect(day2(166667)).toBe(166667);
  });

  it('overspending lowers the remaining days, gently', () => {
    expect(day2(rupees(4200))).toBe(157931); // ₹45,800 ÷ 29, not ₹1,666.67 − ₹2,533
  });

  it('no transactions: the whole day carries forward', () => {
    expect(day2(0)).toBe(172414); // ₹50,000 ÷ 29
  });

  it('depends only on spending before today, so an expense today never moves today', () => {
    const before = snapshotForDay({
      profile: PROFILE,
      today: '2026-09-10',
      cycleSpendBeforeTodayPaise: rupees(15000),
      spentTodayPaise: 0,
    });
    const after = snapshotForDay({
      profile: PROFILE,
      today: '2026-09-10',
      cycleSpendBeforeTodayPaise: rupees(15000),
      spentTodayPaise: rupees(500),
    });
    expect(after.todayBudgetPaise).toBe(before.todayBudgetPaise);
    expect(after.remainingTodayPaise).toBe(before.remainingTodayPaise - rupees(500));
    // …but the new average for the days after today drops with every expense.
    expect(after.nextDaysAveragePaise).toBeLessThan(before.nextDaysAveragePaise ?? 0);
  });

  it('gives two separate values: today and the new average for the rest of the cycle', () => {
    const s = snapshotForDay({
      profile: PROFILE,
      today: '2026-09-21', // 10 days left
      cycleSpendBeforeTodayPaise: rupees(30000),
      spentTodayPaise: rupees(3000),
    });
    expect(s.todayBudgetPaise).toBe(rupees(2000)); // ₹20,000 ÷ 10
    expect(s.remainingTodayPaise).toBe(rupees(-1000));
    expect(s.nextDaysAveragePaise).toBe(188889); // ₹17,000 left ÷ 9 days = ₹1,888.89
  });

  it('is never negative, and the average is 0 once the money is used up', () => {
    expect(rollingAllowance(rupees(1000), rupees(5000), 5)).toBe(0);
    expect(nextDaysAverage(rupees(1000), rupees(5000), 5)).toBe(0);
    const s = snapshotForDay({
      profile: PROFILE,
      today: '2026-09-20',
      cycleSpendBeforeTodayPaise: rupees(60000),
      spentTodayPaise: rupees(200),
    });
    expect(s.todayBudgetPaise).toBe(0);
    expect(cycleLeft(s).leftPaise).toBe(0);
  });

  it('has no "from tomorrow" average on the last day of the cycle (payday is tomorrow)', () => {
    expect(nextDaysAverage(rupees(1000), 0, 1)).toBeNull();
    const s = snapshotForDay({
      profile: PROFILE,
      today: '2026-09-30',
      cycleSpendBeforeTodayPaise: rupees(48000),
      spentTodayPaise: 0,
    });
    expect(s.daysLeft).toBe(1);
    expect(s.todayBudgetPaise).toBe(rupees(2000)); // the whole remainder on the last day
    expect(s.nextDaysAveragePaise).toBeNull();
  });

  it('starts each new cycle at the starting pace: nothing carries across payday', () => {
    // On payday the cycle resets; spending before it belongs to the previous cycle.
    const s = snapshotForDay({
      profile: PROFILE,
      today: '2026-10-01',
      cycleSpendBeforeTodayPaise: 0,
      spentTodayPaise: 0,
    });
    expect(s.cycle.start).toBe('2026-10-01');
    expect(s.todayBudgetPaise).toBe(dailyAllowance(PROFILE, s.cycle)); // ₹50,000 ÷ 31
  });

  it('keeps bills, EMIs and savings out of spendable money (deducted once, up front)', () => {
    const s = snapshotForDay({
      profile: PROFILE,
      today: '2026-09-01',
      cycleSpendBeforeTodayPaise: 0,
      spentTodayPaise: 0,
    });
    // ₹1,00,000 − ₹40,000 bills/EMIs − ₹10,000 savings = ₹50,000 for 30 days.
    expect(s.spendablePaise).toBe(rupees(50000));
    expect(s.todayBudgetPaise * 30).toBeLessThanOrEqual(rupees(50000) + 30);
  });

  it('follows a changed salary date to the new cycle', () => {
    const on1 = snapshotForDay({
      profile: PROFILE,
      today: '2026-09-20',
      cycleSpendBeforeTodayPaise: 0,
      spentTodayPaise: 0,
    });
    const on25 = snapshotForDay({
      profile: { ...PROFILE, payday: 25 },
      today: '2026-09-20',
      cycleSpendBeforeTodayPaise: 0,
      spentTodayPaise: 0,
    });
    expect(on1.daysLeft).toBe(11); // 20 → 30 Sep
    expect(on25.daysLeft).toBe(5); // 20 → 24 Sep
    expect(on25.cycle).toEqual({ start: '2026-08-25', end: '2026-09-24', totalDays: 31 });
  });
});
