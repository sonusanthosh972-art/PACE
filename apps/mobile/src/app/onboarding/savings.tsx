import { router } from 'expo-router';

import { BudgetPreview } from '@/components/BudgetPreview';
import { Button } from '@/components/Button';
import { StepHeader } from '@/components/Controls';
import { MoneyField } from '@/components/Fields';
import { Screen } from '@/components/Screen';
import { useOnboarding } from '@/state/onboardingStore';

export default function SavingsStep() {
  const { salaryPaise, payday, fixedExpenses, savingsGoalPaise, setSavingsGoal } = useOnboarding();
  return (
    <Screen
      edges={['top', 'bottom']}
      footer={<Button label="Continue" onPress={() => router.push('/onboarding/permissions')} />}
    >
      <StepHeader
        step={3}
        total={4}
        title="Savings goal"
        body="Pay yourself first. This is kept out of your daily budget."
      />
      <MoneyField
        label="Monthly savings goal"
        valuePaise={savingsGoalPaise}
        onChangePaise={setSavingsGoal}
        large
        placeholder="10,000"
      />
      <BudgetPreview
        profile={{
          monthlySalaryPaise: salaryPaise ?? 0,
          payday,
          monthlySavingsGoalPaise: savingsGoalPaise ?? 0,
          fixedExpenses: fixedExpenses.map((f, i) => ({ ...f, id: String(i) })),
        }}
      />
    </Screen>
  );
}
