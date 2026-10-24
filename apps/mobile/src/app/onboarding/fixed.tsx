import { router } from 'expo-router';

import { Button } from '@/components/Button';
import { StepHeader } from '@/components/Controls';
import { FixedExpensesEditor } from '@/components/FixedExpensesEditor';
import { Screen } from '@/components/Screen';
import { useOnboarding } from '@/state/onboardingStore';

export default function FixedStep() {
  const { fixedExpenses, setFixedExpenses } = useOnboarding();
  return (
    <Screen
      edges={['top', 'bottom']}
      footer={
        <Button
          label={fixedExpenses.length === 0 ? 'Skip for now' : 'Continue'}
          variant={fixedExpenses.length === 0 ? 'secondary' : 'primary'}
          onPress={() => router.push('/onboarding/savings')}
        />
      }
    >
      <StepHeader
        step={2}
        total={4}
        title="Fixed expenses"
        body="Rent, EMIs, SIPs: costs that are the same every month. We set them aside first."
      />
      <FixedExpensesEditor items={fixedExpenses} onChange={setFixedExpenses} />
    </Screen>
  );
}
