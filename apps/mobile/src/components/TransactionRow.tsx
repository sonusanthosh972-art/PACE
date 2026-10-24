import { StyleSheet, View } from 'react-native';

import { CATEGORIES } from '@/domain/categories';
import { formatINRWhole } from '@/domain/money';
import type { Transaction } from '@/domain/transaction';
import { formatTime, MODE_LABELS, txTitle } from '@/lib/format';
import { useTheme } from '@/theme/ThemeProvider';
import { MIN_TOUCH, RADIUS, SPACE } from '@/theme/tokens';

import { AppText } from './AppText';
import { Amount } from './Amount';
import { PressableScale } from './PressableScale';

interface Props {
  tx: Transaction;
  onPress?: () => void;
  showTime?: boolean;
}

export function describeTransaction(tx: Transaction): string {
  const parts = [
    `${tx.direction === 'credit' ? 'Received' : 'Spent'} ${formatINRWhole(tx.amountPaise)}`,
    tx.direction === 'credit' ? `from ${txTitle(tx)}` : `at ${txTitle(tx)}`,
    CATEGORIES[tx.category].label,
    formatTime(tx.occurredAt),
  ];
  if (tx.isExcluded) parts.push('not counted as an expense');
  if (tx.needsReview) parts.push('needs a category');
  return parts.join(', ');
}

export function TransactionRow({ tx, onPress, showTime = true }: Props) {
  const { colors } = useTheme();
  const category = CATEGORIES[tx.category];
  const credit = tx.direction === 'credit';
  const meta = [
    tx.needsReview ? 'Tap to tag' : category.label,
    MODE_LABELS[tx.mode],
    showTime ? formatTime(tx.occurredAt) : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <PressableScale
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole="button"
      accessibilityLabel={describeTransaction(tx)}
      accessibilityHint={onPress ? 'Opens details to change the category' : undefined}
      style={[styles.row, { backgroundColor: colors.surface }]}
    >
      <View
        style={[
          styles.badge,
          { backgroundColor: colors.elevated, borderColor: colors.categories[tx.category] },
        ]}
      >
        <AppText variant="heading" accessible={false}>
          {category.emoji}
        </AppText>
      </View>
      <View style={styles.middle}>
        <AppText variant="bodyStrong" numberOfLines={1}>
          {txTitle(tx)}
        </AppText>
        <AppText variant="caption" color={tx.needsReview ? 'amberText' : 'muted'} numberOfLines={1}>
          {tx.needsReview ? '● ' : ''}
          {meta}
        </AppText>
      </View>
      <View style={styles.right}>
        <Amount
          paise={tx.amountPaise}
          variant="bodyStrong"
          color={credit ? 'accentText' : 'text'}
          prefix={credit ? '+' : ''}
        />
        {tx.isExcluded ? (
          <AppText variant="caption" color="muted">
            Not counted
          </AppText>
        ) : null}
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.md,
    minHeight: MIN_TOUCH + 20,
    paddingVertical: SPACE.md,
    paddingHorizontal: SPACE.lg,
    borderRadius: RADIUS.md,
  },
  badge: {
    width: 44,
    height: 44,
    borderRadius: RADIUS.pill,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
  },
  middle: { flex: 1, gap: 2 },
  right: { alignItems: 'flex-end', gap: 2 },
});
