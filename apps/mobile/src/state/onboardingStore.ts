import { create } from 'zustand';

import type { FixedExpenseInput } from '@/data/profileRepo';

/** Draft values while the user steps through onboarding; saved to SQLite at the end. */
interface OnboardingDraft {
  salaryPaise: number | null;
  payday: number;
  fixedExpenses: FixedExpenseInput[];
  savingsGoalPaise: number | null;
  setSalary(paise: number | null): void;
  setPayday(day: number): void;
  setFixedExpenses(items: FixedExpenseInput[]): void;
  setSavingsGoal(paise: number | null): void;
  reset(): void;
}

const initial = {
  salaryPaise: null,
  payday: 1,
  fixedExpenses: [] as FixedExpenseInput[],
  savingsGoalPaise: null,
};

export const useOnboarding = create<OnboardingDraft>((set) => ({
  ...initial,
  setSalary: (salaryPaise) => set({ salaryPaise }),
  setPayday: (payday) => set({ payday }),
  setFixedExpenses: (fixedExpenses) => set({ fixedExpenses }),
  setSavingsGoal: (savingsGoalPaise) => set({ savingsGoalPaise }),
  reset: () => set(initial),
}));
