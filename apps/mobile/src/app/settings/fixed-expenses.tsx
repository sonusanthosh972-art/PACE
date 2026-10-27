import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';

import { AppText } from '@/components/AppText';
import { BudgetPreview } from '@/components/BudgetPreview';
import { Button } from '@/components/Button';
import { FixedExpensesEditor } from '@/components/FixedExpensesEditor';
import { Screen } from '@/components/Screen';
import { ErrorState, LoadingState } from '@/components/States';
import { getAppDb } from '@/data/appDb';
import type { FixedExpenseInput } from '@/data/profileRepo';
import { listTransactions } from '@/data/transactionsRepo';
import type { BudgetProfile } from '@/domain/budget';
import { detectSubscriptions, type DetectedSubscription } from '@/domain/subscriptions';
import { saveBudgetSetup } from '@/services/actions';
import { invalidateAll, useProfile } from '@/state/queries';

export default function FixedExpensesSettings() {
  const profile = useProfile();
  if (profile.isPending) {
    return (
      <Screen edges={[]}>
        <LoadingState label="Loading fixed expenses" />
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
  return <Editor initial={profile.data} />;
}

function Editor({ initial }: { initial: BudgetProfile }) {
  const client = useQueryClient();
  const [items, setItems] = useState<FixedExpenseInput[]>(
    initial.fixedExpenses.map(({ name, amountPaise, dueDay }) => ({ name, amountPaise, dueDay })),
  );
  const [suggested, setSuggested] = useState<DetectedSubscription[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    async function scan() {
      try {
        const db = await getAppDb();
        const txs = await listTransactions(db, { limit: 300 });
        const subs = detectSubscriptions(txs);
        if (active && subs.length > 0) setSuggested(subs);
      } catch {
        // Non-blocking suggestion
      }
    }
    scan();
    return () => {
      active = false;
    };
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      await saveBudgetSetup(
        {
          monthlySalaryPaise: initial.monthlySalaryPaise,
          payday: initial.payday,
          monthlySavingsGoalPaise: initial.monthlySavingsGoalPaise,
        },
        items,
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
      <AppText color="muted">
        Rent, EMIs, SIPs and other fixed monthly costs are set aside up front, so they never eat
        into your daily budget.
      </AppText>
      <FixedExpensesEditor items={items} onChange={setItems} suggestedSubscriptions={suggested} />
      <BudgetPreview
        profile={{ ...initial, fixedExpenses: items.map((i, n) => ({ ...i, id: String(n) })) }}
      />
      {error ? (
        <AppText variant="caption" color="coralText" accessibilityRole="alert">
          {error}
        </AppText>
      ) : null}
    </Screen>
  );
}
