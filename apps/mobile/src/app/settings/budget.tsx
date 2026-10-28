import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';

import { AppText } from '@/components/AppText';
import { BudgetPreview } from '@/components/BudgetPreview';
import { Button } from '@/components/Button';
import { DayPicker } from '@/components/Controls';
import { MoneyField } from '@/components/Fields';
import { Screen } from '@/components/Screen';
import { ErrorState, LoadingState } from '@/components/States';
import type { BudgetProfile } from '@/domain/budget';
import { saveBudgetSetup } from '@/services/actions';
import { invalidateAll, useProfile } from '@/state/queries';

export default function BudgetSettings() {
  const profile = useProfile();
  if (profile.isPending) {
    return (
      <Screen edges={[]}>
        <LoadingState label="Loading budget" />
      </Screen>
    );
  }
  if (profile.isError || !profile.data) {
    return (
      <Screen edges={[]}>
        <ErrorState onRetry={() => profile.refetch()} />
      </Screen>
    );
  }
  return <BudgetForm initial={profile.data} />;
}

function BudgetForm({ initial }: { initial: BudgetProfile }) {
  const client = useQueryClient();
  const [salary, setSalary] = useState<number | null>(initial.monthlySalaryPaise);
  const [payday, setPayday] = useState(initial.payday);
  const [savings, setSavings] = useState<number | null>(initial.monthlySavingsGoalPaise);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    if (salary === null || salary <= 0) return setError('Enter your monthly take-home salary.');
    setSaving(true);
    try {
      await saveBudgetSetup(
        { monthlySalaryPaise: salary, payday, monthlySavingsGoalPaise: savings ?? 0 },
        null,
      );
      await invalidateAll(client);
      router.back();
    } catch {
      setError('Could not save. Please try again.');
      setSaving(false);
    }
  };

  return (
    <Screen edges={['bottom']} footer={<Button label="Save" onPress={save} loading={saving} />}>
      <MoneyField
        label="Monthly take-home salary"
        valuePaise={salary}
        onChangePaise={setSalary}
        large
      />
      <AppText variant="label">Payday</AppText>
      <DayPicker label="Payday" value={payday} onChange={setPayday} />
      <AppText variant="caption" color="muted">
        In short months, a late payday moves to the last day of the month.
      </AppText>
      <MoneyField label="Monthly savings goal" valuePaise={savings} onChangePaise={setSavings} />
      <BudgetPreview
        profile={{
          monthlySalaryPaise: salary ?? 0,
          payday,
          monthlySavingsGoalPaise: savings ?? 0,
          fixedExpenses: initial.fixedExpenses,
          startDate: initial.startDate,
        }}
      />
      {error ? (
        <AppText variant="caption" color="coralText" accessibilityRole="alert">
          {error}
        </AppText>
      ) : null}
    </Screen>
  );
}
