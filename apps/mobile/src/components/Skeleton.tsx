import { StyleSheet, View, type ViewStyle } from 'react-native';
import { useEffect } from 'react';
import Animated, { useSharedValue, withRepeat, withTiming, Easing } from 'react-native-reanimated';

import { useTheme } from '@/theme/ThemeProvider';
import { RADIUS, SPACE } from '@/theme/tokens';

interface SkeletonProps {
  width?: number | string;
  height: number;
  borderRadius?: number;
  style?: ViewStyle;
}

export function Skeleton({
  width = '100%',
  height,
  borderRadius = RADIUS.sm,
  style,
}: SkeletonProps) {
  const { colors } = useTheme();
  const opacity = useSharedValue(0.5);

  useEffect(() => {
    opacity.value = withRepeat(
      withTiming(1, { duration: 1000, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
  }, [opacity]);

  return (
    <Animated.View
      style={[
        styles.skeleton,
        {
          width,
          height,
          borderRadius,
          backgroundColor: colors.elevated,
        } as ViewStyle,
        { opacity },
        style,
      ]}
    />
  );
}

export function TransactionSkeletonList() {
  return (
    <View style={styles.container}>
      {Array.from({ length: 5 }).map((_, i) => (
        <View key={i} style={styles.transactionSkeleton}>
          <Skeleton width={48} height={48} borderRadius={RADIUS.pill} />
          <View style={styles.transactionInfo}>
            <Skeleton width="60%" height={16} />
            <Skeleton width="40%" height={14} style={{ marginTop: SPACE.xs }} />
          </View>
          <Skeleton width={60} height={16} />
        </View>
      ))}
    </View>
  );
}

export function CardSkeletonList() {
  return (
    <View style={styles.container}>
      {Array.from({ length: 3 }).map((_, i) => (
        <View key={i} style={styles.cardSkeleton}>
          <Skeleton width="100%" height={100} borderRadius={RADIUS.md} />
        </View>
      ))}
    </View>
  );
}

export function BudgetSkeletonCard() {
  return (
    <View style={styles.budgetCardSkeleton}>
      <View style={styles.budgetHeader}>
        <Skeleton width={80} height={20} />
        <Skeleton width={120} height={32} />
      </View>
      <View style={styles.budgetBody}>
        <Skeleton width={200} height={200} borderRadius={100} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  skeleton: {
    backgroundColor: '#2C2F35',
  },
  container: {
    gap: SPACE.md,
  },
  transactionSkeleton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.md,
    padding: SPACE.md,
  },
  transactionInfo: {
    flex: 1,
    gap: SPACE.xs,
  },
  cardSkeleton: {
    marginBottom: SPACE.md,
  },
  budgetCardSkeleton: {
    padding: SPACE.lg,
    gap: SPACE.lg,
  },
  budgetHeader: {
    gap: SPACE.sm,
  },
  budgetBody: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
