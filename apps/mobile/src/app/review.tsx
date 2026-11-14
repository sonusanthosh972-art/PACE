import { useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeOut, LinearTransition } from 'react-native-reanimated';

import { Amount } from '@/components/Amount';
import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Chip } from '@/components/Chip';
import { Icon, type IconName } from '@/components/Icon';
import { Screen } from '@/components/Screen';
import { EmptyState, ErrorState, LoadingState } from '@/components/States';
import { CATEGORIES, type CategoryId } from '@/domain/categories';
import type { Transaction } from '@/domain/transaction';
import { formatDateTime, modeLabel, txTitle } from '@/lib/format';
import { useTodayKey } from '@/lib/useTodayKey';
import {
  excludePayeeAlways,
  recategoriseTransaction,
  setTransactionExcluded,
} from '@/services/actions';
import { invalidateAll, REVIEW_PAGE, useReviewQueue } from '@/state/queries';
import { useTheme } from '@/theme/ThemeProvider';
import { SPACE } from '@/theme/tokens';

/** The categories most everyday Indian payments fall into; "More" opens the full list. */
const QUICK_CATEGORIES: readonly CategoryId[] = [
  'groceries',
  'food',
  'health',
  'shopping',
  'transport',
  'bills',
  'transfers',
  'other',
];

export default function ReviewScreen() {
  const queue = useReviewQueue();
  const client = useQueryClient();
  const [message, setMessage] = useState<string | null>(null);

  const done = async (text: string) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
    setMessage(text);
    await invalidateAll(client);
  };

  const pick = async (tx: Transaction, category: CategoryId) => {
    const changed = await recategoriseTransaction(tx.id, category);
    const label = CATEGORIES[category].label;
    await done(
      changed > 1
        ? `${changed} payments to ${txTitle(tx)} tagged ${label}. Future ones will be too.`
        : `Tagged ${label}.${tx.merchantNorm ? ' Future payments to this payee will be too.' : ''}`,
    );
  };

  const notExpense = (tx: Transaction) => {
    const name = txTitle(tx);
    const justThis = async () => {
      await setTransactionExcluded(tx.id, true);
      await done('Marked as not an expense.');
    };
    if (!tx.merchantNorm) {
      justThis().catch(() => undefined);
      return;
    }
    Alert.alert(
      'Not an expense',
      `For example money moved to your own account. Should payments to ${name} always be left out of your spending?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Just this one', onPress: () => justThis().catch(() => undefined) },
        {
          text: `Always for ${name}`,
          onPress: async () => {
            const changed = await excludePayeeAlways(tx.id);
            await done(
              `${changed} ${changed === 1 ? 'payment' : 'payments'} to ${name} left out of spending, now and in future.`,
            );
          },
        },
      ],
    );
  };

  return (
    <Screen>
      <View style={styles.header}>
        <AppText variant="caption" color="muted">
          Tag each payee once. PACE remembers it and tags their future payments for you.
        </AppText>
      </View>

      {message ? (
        <Animated.View entering={FadeIn.duration(200)} accessibilityLiveRegion="polite">
          <Card tone="elevated">
            <View style={styles.row}>
              <Icon name="checkmark-circle" color="accentText" />
              <AppText style={styles.flex}>{message}</AppText>
            </View>
          </Card>
        </Animated.View>
      ) : null}

      {queue.isPending ? (
        <LoadingState label="Loading payments to review" />
      ) : queue.isError ? (
        <ErrorState onRetry={() => queue.refetch()} />
      ) : queue.data.items.length === 0 ? (
        <EmptyState
          icon="checkmark-done-circle-outline"
          title="All caught up"
          body="Every payment has a category. New payments from payees you have tagged are sorted automatically."
          actionLabel="Back to today"
          onAction={() => router.back()}
        />
      ) : (
        <>
          <AppText variant="heading" accessibilityRole="header">
            {queue.data.total} {queue.data.total === 1 ? 'payment' : 'payments'} to review
          </AppText>
          {queue.data.items.map((tx) => (
            <Animated.View
              key={tx.id}
              exiting={FadeOut.duration(180)}
              layout={LinearTransition.duration(220)}
            >
              <ReviewCard tx={tx} onPick={pick} onNotExpense={notExpense} />
            </Animated.View>
          ))}
          {queue.data.total > REVIEW_PAGE ? (
            <AppText variant="caption" color="muted" center>
              Showing the newest {REVIEW_PAGE}. The rest appear as you tag these.
            </AppText>
          ) : null}
        </>
      )}
    </Screen>
  );
}

function ReviewCard({
  tx,
  onPick,
  onNotExpense,
}: {
  tx: Transaction;
  onPick: (tx: Transaction, category: CategoryId) => Promise<void>;
  onNotExpense: (tx: Transaction) => void;
}) {
  const { colors } = useTheme();
  const today = useTodayKey();
  const [busy, setBusy] = useState(false);

  const choose = async (category: CategoryId) => {
    if (busy) return;
    setBusy(true);
    try {
      await onPick(tx, category);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <View style={styles.row}>
        <View style={styles.flex}>
          <AppText variant="bodyStrong" numberOfLines={1}>
            {txTitle(tx)}
          </AppText>
          <AppText variant="caption" color="muted" numberOfLines={1}>
            {formatDateTime(tx.occurredAt, today)} · {modeLabel(tx)}
          </AppText>
        </View>
        <View style={styles.amount}>
          <Amount paise={tx.amountPaise} variant="heading" fit />
        </View>
      </View>

      <View style={styles.chips} accessibilityLabel={`Choose a category for ${txTitle(tx)}`}>
        {QUICK_CATEGORIES.map((id) => (
          <Chip
            key={id}
            label={CATEGORIES[id].shortLabel}
            accessibilityLabel={`Tag as ${CATEGORIES[id].label}`}
            icon={CATEGORIES[id].icon as IconName}
            tint={colors.categories[id]}
            selected={false}
            onPress={() => {
              choose(id).catch(() => undefined);
            }}
          />
        ))}
        <Chip
          label="More"
          icon="ellipsis-horizontal"
          accessibilityLabel="More categories"
          selected={false}
          onPress={() => router.push(`/transaction/${tx.id}`)}
        />
      </View>

      <View style={[styles.divider, { backgroundColor: colors.border }]} />
      <Button
        label="Not an expense"
        variant="ghost"
        icon="swap-horizontal-outline"
        compact
        accessibilityHint="For money moved to your own account, a card bill or an investment"
        onPress={() => onNotExpense(tx)}
      />
    </Card>
  );
}

const styles = StyleSheet.create({
  header: { gap: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: SPACE.md },
  flex: { flex: 1 },
  amount: { maxWidth: '45%', alignItems: 'flex-end' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.sm, marginTop: SPACE.md },
  divider: { height: StyleSheet.hairlineWidth, marginVertical: SPACE.sm },
});
