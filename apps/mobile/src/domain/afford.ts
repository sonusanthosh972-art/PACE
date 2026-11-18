import {
  nextDaysAverage,
  type BudgetProfile,
  type BudgetSnapshot,
  type Cycle,
  type FixedExpense,
} from './budget';
import { divideRound, formatINRWhole, sumPaise, type Paise } from './money';
import { parseDateKey, type DateKey } from './time';

export type AffordabilityTier = 'SAFE' | 'CAUTION' | 'NOT_AFFORDABLE';

export interface UpcomingBillsSummary {
  /** Total sum of all monthly fixed expenses */
  totalFixedPaise: Paise;
  /** Fixed expenses that have due dates between today and the cycle end */
  upcomingExpenses: readonly FixedExpense[];
  /** Total sum of fixed expenses upcoming before payday */
  upcomingPaise: Paise;
}

export interface AffordabilityProjection {
  currentDailySafeToSpendPaise: Paise;
  projectedDailySafeToSpendPaise: Paise;
  dailyReductionPaise: Paise;
  dailyReductionPercent: number;

  currentCycleBalancePaise: Paise;
  projectedCycleBalancePaise: Paise;

  currentRemainingTodayPaise: Paise;
  projectedRemainingTodayPaise: Paise;

  projectedPaydayBalancePaise: Paise;
  deficitPaise: Paise;

  billsProtected: boolean;
  savingsProtected: boolean;
  billsShortfallPaise: Paise;
  savingsShortfallPaise: Paise;
}

export interface AffordabilityRecommendation {
  tier: AffordabilityTier;
  headline: string;
  reasoning: string;
  practicalAdvice: string;
  impactOnBillsMessage: string;
}

export interface SimulationResult {
  purchasePaise: Paise;
  tier: AffordabilityTier;
  projection: AffordabilityProjection;
  recommendation: AffordabilityRecommendation;
  upcomingBills: UpcomingBillsSummary;
  daysLeft: number;
  payday: number;
}

export interface ComparisonItem {
  id: string;
  label: string;
  amountPaise: Paise;
  tier: AffordabilityTier;
  projectedDailySafeToSpendPaise: Paise;
  projectedCycleBalancePaise: Paise;
}

/**
 * Checks whether an expense with dueDay falls between today and the end of the salary cycle.
 */
export function isExpenseUpcomingInCycle(
  today: DateKey,
  cycleEnd: DateKey,
  dueDay: number,
): boolean {
  const current = parseDateKey(today);
  const end = parseDateKey(cycleEnd);

  // If cycle is within the same month
  if (current.year === end.year && current.month === end.month) {
    return dueDay >= current.day && dueDay <= end.day;
  }

  // If cycle spans across month boundary (e.g. from Oct 25 to Nov 24)
  // Due in the first part (current month from today until month end)
  if (dueDay >= current.day) {
    return true;
  }
  // Or due in the second part (next month up to cycleEnd day)
  if (dueDay <= end.day) {
    return true;
  }

  return false;
}

/**
 * Summarises all upcoming fixed commitments for the rest of this salary cycle.
 */
export function getUpcomingBills(
  today: DateKey,
  cycle: Cycle,
  fixedExpenses: readonly FixedExpense[],
): UpcomingBillsSummary {
  const totalFixedPaise = sumPaise(fixedExpenses.map((f) => f.amountPaise));
  const upcomingExpenses = fixedExpenses.filter((f) =>
    isExpenseUpcomingInCycle(today, cycle.end, f.dueDay),
  );
  const upcomingPaise = sumPaise(upcomingExpenses.map((f) => f.amountPaise));

  return {
    totalFixedPaise,
    upcomingExpenses,
    upcomingPaise,
  };
}

/**
 * Simulates a planned purchase and evaluates its impact on daily safe-to-spend,
 * cycle balance, upcoming bills, and protected savings.
 */
export function simulatePurchase(args: {
  purchasePaise: Paise;
  profile: BudgetProfile;
  snapshot: BudgetSnapshot;
  today?: DateKey;
}): SimulationResult {
  const { purchasePaise, profile, snapshot } = args;
  const today = args.today ?? snapshot.cycle.start;
  const daysLeft = Math.max(1, snapshot.daysLeft);
  const cycle = snapshot.cycle;

  // 1. Current financial snapshot figures
  const totalSpentSoFarPaise = snapshot.spentBeforeTodayPaise + snapshot.spentTodayPaise;
  const spendablePoolPaise = snapshot.spendablePaise;
  const currentCycleBalancePaise = Math.max(0, spendablePoolPaise - totalSpentSoFarPaise);
  const currentRemainingTodayPaise = snapshot.remainingTodayPaise;

  const currentNextDaysAveragePaise =
    nextDaysAverage(spendablePoolPaise, totalSpentSoFarPaise, daysLeft) ??
    (daysLeft > 1 ? divideRound(currentCycleBalancePaise, daysLeft - 1) : 0);

  // 2. Upcoming bills analysis
  const upcomingBills = getUpcomingBills(today, cycle, profile.fixedExpenses);
  const protectedSavingsPaise = profile.monthlySavingsGoalPaise;

  // 3. Projected figures after purchase
  const projectedTotalSpentPaise = totalSpentSoFarPaise + purchasePaise;
  const projectedCycleBalancePaise = Math.max(0, spendablePoolPaise - projectedTotalSpentPaise);
  const deficitPaise = Math.max(0, projectedTotalSpentPaise - spendablePoolPaise);
  const projectedRemainingTodayPaise = currentRemainingTodayPaise - purchasePaise;

  // Calculate projected daily safe-to-spend for tomorrow onwards
  let projectedDailySafeToSpendPaise = 0;
  if (daysLeft > 1) {
    const remainingForNextDays = spendablePoolPaise - projectedTotalSpentPaise;
    projectedDailySafeToSpendPaise =
      remainingForNextDays > 0 ? divideRound(remainingForNextDays, daysLeft - 1) : 0;
  } else {
    projectedDailySafeToSpendPaise = 0;
  }

  const dailyReductionPaise = Math.max(
    0,
    currentNextDaysAveragePaise - projectedDailySafeToSpendPaise,
  );
  const dailyReductionPercent =
    currentNextDaysAveragePaise > 0
      ? Math.min(
          100,
          Math.max(
            0,
            Math.round(
              ((currentNextDaysAveragePaise - projectedDailySafeToSpendPaise) /
                currentNextDaysAveragePaise) *
                100,
            ),
          ),
        )
      : 0;

  const projectedPaydayBalancePaise = spendablePoolPaise - projectedTotalSpentPaise;

  // 4. Protection of bills and savings
  let billsProtected = true;
  let savingsProtected = true;
  let billsShortfallPaise = 0;
  let savingsShortfallPaise = 0;

  if (deficitPaise > 0) {
    if (deficitPaise <= protectedSavingsPaise) {
      savingsProtected = false;
      savingsShortfallPaise = deficitPaise;
      billsProtected = true;
      billsShortfallPaise = 0;
    } else {
      savingsProtected = false;
      savingsShortfallPaise = protectedSavingsPaise;
      billsProtected = false;
      billsShortfallPaise = deficitPaise - protectedSavingsPaise;
    }
  }

  // 5. Determine Tier
  let tier: AffordabilityTier = 'SAFE';

  if (purchasePaise <= 0) {
    tier = 'SAFE';
  } else if (deficitPaise > 0 || currentCycleBalancePaise === 0) {
    tier = 'NOT_AFFORDABLE';
  } else if (
    dailyReductionPercent >= 30 ||
    purchasePaise > currentCycleBalancePaise * 0.4 ||
    purchasePaise > Math.max(0, currentRemainingTodayPaise) ||
    projectedDailySafeToSpendPaise < 10000 // Under ₹100/day
  ) {
    tier = 'CAUTION';
  } else {
    tier = 'SAFE';
  }

  // 6. Impact on bills message
  let impactOnBillsMessage = '';
  if (billsProtected && savingsProtected) {
    impactOnBillsMessage = `All ${formatINRWhole(upcomingBills.upcomingPaise)} reserved for upcoming bills & EMIs and your ${formatINRWhole(protectedSavingsPaise)} savings goal remain 100% protected.`;
  } else if (billsProtected && !savingsProtected) {
    impactOnBillsMessage = `Your ${formatINRWhole(upcomingBills.upcomingPaise)} reserved bills remain safe, but this purchase dips ${formatINRWhole(savingsShortfallPaise)} into your ${formatINRWhole(protectedSavingsPaise)} monthly savings goal.`;
  } else {
    impactOnBillsMessage = `This purchase wipes your ${formatINRWhole(protectedSavingsPaise)} savings goal and risks creating a ${formatINRWhole(billsShortfallPaise)} shortfall for upcoming bills & EMIs.`;
  }

  // 7. Human, calm recommendation
  const recommendation = generateRecommendation({
    tier,
    purchasePaise,
    currentDailySafeToSpendPaise: currentNextDaysAveragePaise,
    projectedDailySafeToSpendPaise,
    dailyReductionPercent,
    currentCycleBalancePaise,
    projectedCycleBalancePaise,
    daysLeft,
    payday: profile.payday,
    impactOnBillsMessage,
    deficitPaise,
  });

  const projection: AffordabilityProjection = {
    currentDailySafeToSpendPaise: currentNextDaysAveragePaise,
    projectedDailySafeToSpendPaise,
    dailyReductionPaise,
    dailyReductionPercent,
    currentCycleBalancePaise,
    projectedCycleBalancePaise,
    currentRemainingTodayPaise,
    projectedRemainingTodayPaise,
    projectedPaydayBalancePaise,
    deficitPaise,
    billsProtected,
    savingsProtected,
    billsShortfallPaise,
    savingsShortfallPaise,
  };

  return {
    purchasePaise,
    tier,
    projection,
    recommendation,
    upcomingBills,
    daysLeft,
    payday: profile.payday,
  };
}

function generateRecommendation(args: {
  tier: AffordabilityTier;
  purchasePaise: Paise;
  currentDailySafeToSpendPaise: Paise;
  projectedDailySafeToSpendPaise: Paise;
  dailyReductionPercent: number;
  currentCycleBalancePaise: Paise;
  projectedCycleBalancePaise: Paise;
  daysLeft: number;
  payday: number;
  impactOnBillsMessage: string;
  deficitPaise: Paise;
}): AffordabilityRecommendation {
  const {
    tier,
    purchasePaise,
    currentDailySafeToSpendPaise,
    projectedDailySafeToSpendPaise,
    dailyReductionPercent,
    currentCycleBalancePaise,
    daysLeft,
    payday,
    impactOnBillsMessage,
    deficitPaise,
  } = args;

  if (tier === 'SAFE') {
    return {
      tier,
      headline: 'Comfortably Affordable',
      reasoning: `You have ${formatINRWhole(currentCycleBalancePaise)} left in your cycle budget. Deducting ${formatINRWhole(purchasePaise)} leaves your daily allowance at a healthy ${formatINRWhole(projectedDailySafeToSpendPaise)}/day for the next ${daysLeft} days.`,
      practicalAdvice: `You can make this purchase today with peace of mind. Your essentials and savings remain fully intact.`,
      impactOnBillsMessage,
    };
  }

  if (tier === 'CAUTION') {
    return {
      tier,
      headline: 'Affordable with Reduced Daily Flexibility',
      reasoning: `This purchase fits in your overall cycle balance, but it lowers your daily safe-to-spend by ${dailyReductionPercent}% (from ${formatINRWhole(currentDailySafeToSpendPaise)} to ${formatINRWhole(projectedDailySafeToSpendPaise)}/day for ${daysLeft} days).`,
      practicalAdvice: `If living on ${formatINRWhole(projectedDailySafeToSpendPaise)}/day until payday on the ${payday}th works comfortably for your routine, this purchase is manageable. Otherwise, consider deferring or exploring a smaller amount.`,
      impactOnBillsMessage,
    };
  }

  // NOT_AFFORDABLE
  return {
    tier,
    headline: 'Not Recommended This Cycle',
    reasoning: `This purchase exceeds your available spending pool by ${formatINRWhole(deficitPaise)}. It would force you to dip into protected savings or risk upcoming bills.`,
    practicalAdvice: `Waiting until your next payday on the ${payday}th will allow you to make this purchase without risking essential commitments or creating a deficit.`,
    impactOnBillsMessage,
  };
}

/**
 * Compares an array of candidate amounts against the current budget snapshot.
 */
export function comparePurchaseAmounts(args: {
  amounts: readonly { id: string; label: string; amountPaise: Paise }[];
  profile: BudgetProfile;
  snapshot: BudgetSnapshot;
  today?: DateKey;
}): ComparisonItem[] {
  return args.amounts.map((item) => {
    const sim = simulatePurchase({
      purchasePaise: item.amountPaise,
      profile: args.profile,
      snapshot: args.snapshot,
      today: args.today,
    });
    return {
      id: item.id,
      label: item.label,
      amountPaise: item.amountPaise,
      tier: sim.tier,
      projectedDailySafeToSpendPaise: sim.projection.projectedDailySafeToSpendPaise,
      projectedCycleBalancePaise: sim.projection.projectedCycleBalancePaise,
    };
  });
}
