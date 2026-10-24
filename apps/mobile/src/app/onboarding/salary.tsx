import { router } from 'expo-router';
import { useState } from 'react';

import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { DayPicker, StepHeader } from '@/components/Controls';
import { MoneyField } from '@/components/Fields';
import { Screen } from '@/components/Screen';
import { useOnboarding } from '@/state/onboardingStore';

export default function SalaryStep() {
  const { salaryPaise, payday, setSalary, setPayday } = useOnboarding();
  const [error, setError] = useState<string | null>(null);

  const next = () => {
    if (!salaryPaise || salaryPaise <= 0) return setError('Enter your monthly take-home salary.');
    setError(null);
    router.push('/onboarding/fixed');
  };

  return (
    <Screen edges={['top', 'bottom']} footer={<Button label="Continue" onPress={next} />}>
      <StepHeader
        step={1}
        total={4}
        title="Your salary"
        body="What lands in your account each month, after tax."
      />
      <MoneyField
        label="Monthly take-home salary"
        valuePaise={salaryPaise}
        onChangePaise={setSalary}
        error={error}
        large
        autoFocus
        placeholder="1,00,000"
      />
      <AppText variant="label">Payday</AppText>
      <AppText variant="caption" color="muted">
        Your budget cycle runs from payday to the day before the next one.
      </AppText>
      <DayPicker label="Payday" value={payday} onChange={setPayday} />
    </Screen>
  );
}
