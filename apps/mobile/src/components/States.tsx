import { StyleSheet, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { useRetry } from '@/hooks/useRetry';
import { MOTION, SPACE } from '@/theme/tokens';

import { AppText } from './AppText';
import { Button } from './Button';
import { Icon, type IconName } from './Icon';
import { PaceLoader } from './PaceLoader';
import { TransactionSkeletonList, BudgetSkeletonCard } from './Skeleton';

/**
 * Something is loading: the splash's PACE animation loops until the content arrives, with a quiet
 * line saying what is on its way. Screen readers hear the label as a progress indicator.
 */
export function LoadingState({ label = 'Loading' }: { label?: string }) {
  return (
    <Animated.View
      entering={FadeIn.duration(MOTION.fadeMs)}
      style={styles.loading}
      accessible
      accessibilityLabel={label}
      accessibilityRole="progressbar"
    >
      <PaceLoader />
      <AppText variant="caption" color="muted" center importantForAccessibility="no">
        {label}…
      </AppText>
    </Animated.View>
  );
}

interface MessageProps {
  icon: IconName;
  title: string;
  body?: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function EmptyState({ icon, title, body, actionLabel, onAction }: MessageProps) {
  return (
    <Animated.View entering={FadeIn.duration(250)} style={styles.message}>
      <Icon name={icon} size={36} color="muted" />
      <AppText variant="heading" center>
        {title}
      </AppText>
      {body ? (
        <AppText color="muted" center>
          {body}
        </AppText>
      ) : null}
      {actionLabel && onAction ? (
        <Button label={actionLabel} onPress={onAction} variant="secondary" compact />
      ) : null}
    </Animated.View>
  );
}

export function ErrorState({
  title = 'Something went wrong',
  body = 'Your data is safe on this phone. Please try again.',
  onRetry,
}: {
  title?: string;
  body?: string;
  onRetry?: () => void;
}) {
  const { retryCount } = useRetry();

  return (
    <View accessibilityRole="alert">
      <EmptyState
        icon="alert-circle-outline"
        title={title}
        body={body}
        actionLabel={onRetry ? (retryCount > 0 ? `Retry (${retryCount})` : 'Try again') : undefined}
        onAction={onRetry}
      />
    </View>
  );
}

export function SkeletonLoader({
  variant = 'transactions',
}: {
  variant?: 'transactions' | 'cards' | 'budget';
}) {
  return (
    <Animated.View entering={FadeIn.duration(MOTION.fadeMs)}>
      {variant === 'transactions' && <TransactionSkeletonList />}
      {variant === 'cards' && <TransactionSkeletonList />}
      {variant === 'budget' && <BudgetSkeletonCard />}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  loading: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACE.md,
    minHeight: 240,
    paddingVertical: SPACE.xxl,
  },
  message: {
    alignItems: 'center',
    gap: SPACE.md,
    paddingVertical: SPACE.xxxl,
    paddingHorizontal: SPACE.xl,
  },
});
