import { memo } from 'react';
import { StyleSheet, View } from 'react-native';

import { CATEGORIES } from '@/domain/categories';
import { formatINRWhole } from '@/domain/money';
import type { Transaction } from '@/domain/transaction';
import { formatTime, modeLabel, txTitle } from '@/lib/format';
import { useTheme } from '@/theme/ThemeProvider';
import { ICON, MIN_TOUCH, RADIUS, SPACE, withAlpha } from '@/theme/tokens';

import { Amount } from './Amount';
import { AppText } from './AppText';
import { Icon, type IconName } from './Icon';
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

export const TransactionRow = memo(function TransactionRow({
  tx,
  onPress,
  showTime = true,
}: Props) {
  const { colors } = useTheme();
  const category = CATEGORIES[tx.category];
  const credit = tx.direction === 'credit';
  // The category shows as the icon; the line underneath is how and when it was paid.
  const meta = [
    tx.needsReview ? 'Tap to tag' : null,
    modeLabel(tx),
    showTime ? formatTime(tx.occurredAt) : null,
  ]
    .filter(Boolean)
    .join(' · ');

  const catColor = colors.categories[tx.category];

  return (
    <PressableScale
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole="button"
      accessibilityLabel={describeTransaction(tx)}
      accessibilityHint={onPress ? 'Opens details to change the category' : undefined}
      style={[styles.row, { backgroundColor: colors.surface, borderColor: colors.border }]}
    >
      <View
        style={[
          styles.badge,
          {
            backgroundColor: withAlpha(catColor, 0.12),
            borderColor: withAlpha(catColor, 0.22),
          },
        ]}
      >
        <Icon name={category.icon as IconName} size={ICON.md} tint={catColor} />
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
          fit
        />
        {tx.isExcluded ? (
          <AppText variant="caption" color="muted">
            Not counted
          </AppText>
        ) : null}
      </View>
    </PressableScale>
  );
});

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.md,
    minHeight: MIN_TOUCH + 16,
    paddingVertical: SPACE.md + 2,
    paddingHorizontal: SPACE.lg,
    borderRadius: RADIUS.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  badge: {
    width: 44,
    height: 44,
    borderRadius: RADIUS.pill,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  middle: { flex: 1, gap: 2 },
  right: { alignItems: 'flex-end', minWidth: 78, maxWidth: '35%' },
});
