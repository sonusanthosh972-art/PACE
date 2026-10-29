import { useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';

import { Amount } from '@/components/Amount';
import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { CategoryGrid } from '@/components/CategoryGrid';
import { SwitchRow } from '@/components/Controls';
import { ErrorState, LoadingState } from '@/components/States';
import { CATEGORIES, type CategoryId } from '@/domain/categories';
import type { Transaction } from '@/domain/transaction';
import { formatDateTime, MODE_LABELS, txTitle } from '@/lib/format';
import { useTodayKey } from '@/lib/useTodayKey';
import {
  recategoriseTransaction,
  removeTransaction,
  setTransactionExcluded,
} from '@/services/actions';
import { invalidateAll, useTransaction } from '@/state/queries';
import { SPACE } from '@/theme/tokens';

export default function TransactionSheet() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const tx = useTransaction(id ?? '');

  return (
    <ScrollView contentContainerStyle={styles.content}>
      {tx.isPending ? (
        <LoadingState rows={2} label="Loading transaction" />
      ) : tx.isError || !tx.data ? (
        <ErrorState
          title="Transaction not found"
          body="It may have been deleted."
          onRetry={() => router.back()}
        />
      ) : (
        <Details tx={tx.data} />
      )}
    </ScrollView>
  );
}

function Details({ tx }: { tx: Transaction }) {
  const client = useQueryClient();
  const today = useTodayKey();
  const credit = tx.direction === 'credit';

  const pick = async (category: CategoryId) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
    await recategoriseTransaction(tx.id, category);
    await invalidateAll(client);
    router.back();
  };

  const facts: [string, string | null][] = [
    ['When', formatDateTime(tx.occurredAt, today)],
    ['Mode', MODE_LABELS[tx.mode]],
    ['Account', tx.accountLast4 ? `•••• ${tx.accountLast4}` : null],
    ['Reference', tx.upiRef],
    ['UPI ID', tx.vpa],
    [
      'Source',
      tx.source === 'sms'
        ? 'Bank SMS'
        : tx.source === 'notification'
          ? 'App notification'
          : 'Added by you',
    ],
    ['Note', tx.note],
  ];

  return (
    <View style={styles.stack}>
      <View style={styles.hero}>
        <AppText color="muted">{credit ? 'Received from' : 'Paid to'}</AppText>
        <AppText variant="title" center numberOfLines={2}>
          {txTitle(tx)}
        </AppText>
        <Amount
          paise={tx.amountPaise}
          variant="hero"
          fit
          exact
          prefix={credit ? '+' : ''}
          color={credit ? 'accentText' : 'text'}
        />
        <AppText color="muted">
          {CATEGORIES[tx.category].emoji} {CATEGORIES[tx.category].label}
        </AppText>
      </View>

      <View style={styles.facts}>
        {facts
          .filter((f): f is [string, string] => Boolean(f[1]))
          .map(([label, value]) => (
            <View
              key={label}
              style={styles.fact}
              accessible
              accessibilityLabel={`${label}: ${value}`}
            >
              <AppText color="muted">{label}</AppText>
              <AppText style={styles.factValue} numberOfLines={1}>
                {value}
              </AppText>
            </View>
          ))}
      </View>

      {!credit ? (
        <SwitchRow
          title="Not an expense"
          subtitle="E.g. moving money to your own account. Excluded from budgets."
          value={tx.isExcluded}
          onChange={async (v) => {
            await setTransactionExcluded(tx.id, v);
            await invalidateAll(client);
          }}
        />
      ) : null}

      <AppText variant="heading" accessibilityRole="header">
        Category
      </AppText>
      <AppText variant="caption" color="muted">
        Future payments to this merchant will use the category you pick.
      </AppText>
      <CategoryGrid
        selected={tx.category === 'uncategorised' ? null : tx.category}
        onSelect={pick}
      />

      {tx.source === 'manual' ? (
        <Button
          label="Delete this entry"
          variant="danger"
          icon="trash-outline"
          onPress={async () => {
            await removeTransaction(tx.id);
            await invalidateAll(client);
            router.back();
          }}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: SPACE.xl, paddingBottom: SPACE.xxxl },
  stack: { gap: SPACE.lg },
  hero: { alignItems: 'center', gap: SPACE.xs, paddingVertical: SPACE.md },
  facts: { gap: SPACE.sm },
  fact: { flexDirection: 'row', justifyContent: 'space-between', gap: SPACE.lg, minHeight: 28 },
  factValue: { flexShrink: 1, textAlign: 'right' },
});
