import { comparePurchaseAmounts, getUpcomingBills, simulatePurchase } from '../afford';
import { snapshotForDay, type BudgetProfile, type BudgetSnapshot } from '../budget';

const PROFILE: BudgetProfile = {
  monthlySalaryPaise: 8000000, // ₹80,000
  payday: 1, // 1st of month
  fixedExpenses: [
    { id: 'rent', name: 'Rent', amountPaise: 2500000, dueDay: 5 }, // ₹25,000 due 5th
    { id: 'wifi', name: 'Broadband', amountPaise: 100000, dueDay: 20 }, // ₹1,000 due 20th
    { id: 'emi', name: 'Car EMI', amountPaise: 1200000, dueDay: 10 }, // ₹12,000 due 10th
  ],
  monthlySavingsGoalPaise: 1500000, // ₹15,000
};

// Spendable pool = 80,000 - 38,000 (fixed) - 15,000 (savings) = ₹27,000 = 2,700,000 paise
function mockSnapshot(
  spentBeforePaise = 500000,
  spentTodayPaise = 0,
  today = '2026-10-15',
): BudgetSnapshot {
  return snapshotForDay({
    profile: PROFILE,
    today,
    cycleSpendBeforeTodayPaise: spentBeforePaise,
    spentTodayPaise,
  });
}

describe('affordability simulator domain', () => {
  describe('upcoming bills detection', () => {
    it('identifies bills due between today and cycle end', () => {
      // Cycle: 2026-10-01 to 2026-10-31
      const snapshot = mockSnapshot(500000, 0, '2026-10-15');
      const upcoming = getUpcomingBills('2026-10-15', snapshot.cycle, PROFILE.fixedExpenses);

      // Rent (5th) and Car EMI (10th) already passed; Broadband (20th) is upcoming
      expect(upcoming.upcomingExpenses.map((f) => f.name)).toEqual(['Broadband']);
      expect(upcoming.upcomingPaise).toBe(100000);
      expect(upcoming.totalFixedPaise).toBe(3800000);
    });

    it('handles cycle spanning month boundaries', () => {
      // Mid-month payday 25: cycle from 2026-10-25 to 2026-11-24
      const midProfile: BudgetProfile = { ...PROFILE, payday: 25 };
      const snapshot = snapshotForDay({
        profile: midProfile,
        today: '2026-11-02',
        cycleSpendBeforeTodayPaise: 300000,
        spentTodayPaise: 0,
      });

      const upcoming = getUpcomingBills('2026-11-02', snapshot.cycle, midProfile.fixedExpenses);
      // Rent (5th), Car EMI (10th), Broadband (20th) all fall between Nov 2 and Nov 24
      expect(upcoming.upcomingExpenses.length).toBe(3);
      expect(upcoming.upcomingPaise).toBe(3800000);
    });
  });

  describe('affordability classifications', () => {
    it('rates small everyday purchases as SAFE', () => {
      const snapshot = mockSnapshot(500000, 0, '2026-10-15');
      // Spendable left = 27,000 - 5,000 = ₹22,000. Days left = 17.
      // Current allowance ~ ₹1,294/day.
      // Purchase ₹500 (50,000 paise)
      const result = simulatePurchase({
        purchasePaise: 50000,
        profile: PROFILE,
        snapshot,
        today: '2026-10-15',
      });

      expect(result.tier).toBe('SAFE');
      expect(result.projection.billsProtected).toBe(true);
      expect(result.projection.savingsProtected).toBe(true);
      expect(result.projection.deficitPaise).toBe(0);
      expect(result.recommendation.headline).toContain('Comfortably Affordable');
      expect(result.projection.dailyReductionPercent).toBeLessThan(10);
    });

    it('rates moderate purchases that significantly reduce daily allowance as CAUTION', () => {
      const snapshot = mockSnapshot(1200000, 0, '2026-10-15');
      // Spendable pool = 27,000. Spent = 12,000. Balance = 15,000.
      // Days left = 17.
      // Purchase ₹8,000 (800,000 paise) takes > 50% of remaining pool
      const result = simulatePurchase({
        purchasePaise: 800000,
        profile: PROFILE,
        snapshot,
        today: '2026-10-15',
      });

      expect(result.tier).toBe('CAUTION');
      expect(result.projection.billsProtected).toBe(true);
      expect(result.projection.savingsProtected).toBe(true);
      expect(result.projection.deficitPaise).toBe(0);
      expect(result.projection.dailyReductionPercent).toBeGreaterThanOrEqual(30);
      expect(result.recommendation.headline).toContain('Reduced Daily Flexibility');
    });

    it('rates purchases exceeding spendable cycle balance as NOT_AFFORDABLE', () => {
      const snapshot = mockSnapshot(2200000, 0, '2026-10-15');
      // Spendable pool = 27,000. Spent = 22,000. Balance left = ₹5,000 (500,000 paise).
      // Purchase ₹10,000 (1,000,000 paise) exceeds balance by ₹5,000
      const result = simulatePurchase({
        purchasePaise: 1000000,
        profile: PROFILE,
        snapshot,
        today: '2026-10-15',
      });

      expect(result.tier).toBe('NOT_AFFORDABLE');
      expect(result.projection.deficitPaise).toBe(500000); // ₹5,000 deficit
      // Deficit of ₹5,000 is within ₹15,000 savings goal, so savings are dipped into, but bills safe
      expect(result.projection.savingsProtected).toBe(false);
      expect(result.projection.billsProtected).toBe(true);
      expect(result.projection.savingsShortfallPaise).toBe(500000);
      expect(result.recommendation.headline).toContain('Not Recommended');
    });

    it('detects when an extreme purchase threatens essential bills and EMIs', () => {
      const snapshot = mockSnapshot(2200000, 0, '2026-10-15');
      // Balance left = ₹5,000. Savings = ₹15,000.
      // Purchase ₹30,000 (3,000,000 paise)
      // Deficit = 30,000 - 5,000 = ₹25,000.
      // Exceeds ₹15,000 savings by ₹10,000!
      const result = simulatePurchase({
        purchasePaise: 3000000,
        profile: PROFILE,
        snapshot,
        today: '2026-10-15',
      });

      expect(result.tier).toBe('NOT_AFFORDABLE');
      expect(result.projection.savingsProtected).toBe(false);
      expect(result.projection.billsProtected).toBe(false);
      expect(result.projection.billsShortfallPaise).toBe(1000000); // ₹10,000 shortfall for bills
      expect(result.recommendation.impactOnBillsMessage).toContain('shortfall for upcoming bills');
    });
  });

  describe('comparison helper', () => {
    it('compares multiple purchase amounts side-by-side', () => {
      const snapshot = mockSnapshot(800000, 0, '2026-10-15');
      const comparisons = comparePurchaseAmounts({
        amounts: [
          { id: 'small', label: 'T-Shirt', amountPaise: 80000 }, // ₹800
          { id: 'medium', label: 'Jacket', amountPaise: 600000 }, // ₹6,000
          { id: 'large', label: 'Phone', amountPaise: 3500000 }, // ₹35,000
        ],
        profile: PROFILE,
        snapshot,
        today: '2026-10-15',
      });

      expect(comparisons).toHaveLength(3);
      expect(comparisons[0]?.tier).toBe('SAFE');
      expect(comparisons[1]?.tier).toBe('CAUTION');
      expect(comparisons[2]?.tier).toBe('NOT_AFFORDABLE');
    });
  });

  describe('commitment and payday adjustments', () => {
    it('adapts when salary dates and fixed commitments change', () => {
      // User with 25th payday and higher fixed costs
      const customProfile: BudgetProfile = {
        monthlySalaryPaise: 6000000, // ₹60,000
        payday: 25,
        fixedExpenses: [
          { id: 'rent', name: 'Rent', amountPaise: 3000000, dueDay: 1 }, // ₹30,000
          { id: 'emi', name: 'EMI', amountPaise: 1500000, dueDay: 10 }, // ₹15,000
        ],
        monthlySavingsGoalPaise: 1000000, // ₹10,000
      };
      // Spendable pool = 60,000 - 45,000 - 10,000 = ₹5,000 = 500,000 paise
      const snapshot = snapshotForDay({
        profile: customProfile,
        today: '2026-10-28',
        cycleSpendBeforeTodayPaise: 200000, // ₹2,000 spent so far
        spentTodayPaise: 0,
      });

      // Balance left = ₹3,000
      // Purchase ₹1,000 (33% of remaining balance)
      const sim = simulatePurchase({
        purchasePaise: 100000,
        profile: customProfile,
        snapshot,
        today: '2026-10-28',
      });

      expect(sim.tier).toBe('CAUTION');
      expect(sim.projection.projectedCycleBalancePaise).toBe(200000); // ₹2,000 left
    });

    it('handles last day of cycle (daysLeft = 1) cleanly without division by zero', () => {
      const snapshot = snapshotForDay({
        profile: PROFILE,
        today: '2026-10-31', // last day before 1st
        cycleSpendBeforeTodayPaise: 2500000,
        spentTodayPaise: 0,
      });

      expect(snapshot.daysLeft).toBe(1);

      const sim = simulatePurchase({
        purchasePaise: 100000, // ₹1,000
        profile: PROFILE,
        snapshot,
        today: '2026-10-31',
      });

      expect(sim.projection.projectedDailySafeToSpendPaise).toBe(0);
      expect(sim.projection.projectedCycleBalancePaise).toBe(100000); // 27,000 - 25,000 - 1,000 = 1,000
      expect(sim.tier).toBe('CAUTION'); // takes 50% of remaining balance on last day
    });

    it('handles 0 purchase amount gracefully as SAFE with 0 reduction', () => {
      const snapshot = mockSnapshot(500000, 0, '2026-10-15');
      const sim = simulatePurchase({
        purchasePaise: 0,
        profile: PROFILE,
        snapshot,
        today: '2026-10-15',
      });

      expect(sim.tier).toBe('SAFE');
      expect(sim.projection.dailyReductionPercent).toBe(0);
      expect(sim.projection.deficitPaise).toBe(0);
    });
  });
});
