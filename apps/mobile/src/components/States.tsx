import { StyleSheet, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { useTheme } from '@/theme/ThemeProvider';
import { RADIUS, SPACE } from '@/theme/tokens';

import { AppText } from './AppText';
import { Button } from './Button';
import { Icon, type IconName } from './Icon';

/** Static placeholder blocks (no shimmer: no looping animations), faded in once. */
export function LoadingState({ rows = 3, label = 'Loading' }: { rows?: number; label?: string }) {
  const { colors } = useTheme();
  return (
    <Animated.View
      entering={FadeIn.duration(250)}
      style={styles.loading}
      accessible
      accessibilityLabel={label}
      accessibilityRole="progressbar"
    >
      <View style={[styles.blockHero, { backgroundColor: colors.surface }]} />
      {Array.from({ length: rows }, (_, i) => (
        <View key={i} style={[styles.block, { backgroundColor: colors.surface }]} />
      ))}
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
  return (
    <View accessibilityRole="alert">
      <EmptyState
        icon="alert-circle-outline"
        title={title}
        body={body}
        actionLabel={onRetry ? 'Try again' : undefined}
        onAction={onRetry}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  loading: { gap: SPACE.md, paddingTop: SPACE.lg },
  blockHero: { height: 220, borderRadius: RADIUS.lg },
  block: { height: 64, borderRadius: RADIUS.md },
  message: {
    alignItems: 'center',
    gap: SPACE.md,
    paddingVertical: SPACE.xxxl,
    paddingHorizontal: SPACE.xl,
  },
});
