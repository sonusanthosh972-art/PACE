import { StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { useTheme } from '@/theme/ThemeProvider';
import { MOTION, SPACE } from '@/theme/tokens';

import { AppText, type TextColor } from './AppText';
import { Icon, type IconName } from './Icon';

/** Theme colours only: the tone marks the state, the text keeps the palette's tested contrast. */
const BANNER_STYLE: Record<'offline' | 'slow', { tone: TextColor; icon: IconName }> = {
  offline: { tone: 'coralText', icon: 'cloud-offline-outline' },
  slow: { tone: 'amberText', icon: 'cellular-outline' },
};

export function NetworkBanner() {
  const { colors } = useTheme();
  const network = useNetworkStatus();

  if (network.isConnected && network.isInternetReachable !== false) {
    return null;
  }

  const state = network.isConnected ? 'slow' : 'offline';
  const { tone, icon } = BANNER_STYLE[state];

  const title = state === 'offline' ? "You're offline" : 'Slow connection';
  const message =
    state === 'offline'
      ? "Changes will sync when you're back online"
      : 'Some features may be unavailable';

  return (
    <Animated.View
      entering={FadeIn.duration(MOTION.fadeMs)}
      exiting={FadeOut.duration(MOTION.fadeMs)}
      style={[styles.banner, { backgroundColor: colors.elevated, borderBottomColor: colors[tone] }]}
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
    >
      <Icon name={icon} size={18} color={tone} />
      <View style={styles.content}>
        <AppText variant="label" color={tone}>
          {title}
        </AppText>
        <AppText variant="caption" color="muted">
          {message}
        </AppText>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.md,
    paddingHorizontal: SPACE.lg,
    paddingVertical: SPACE.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  content: {
    flex: 1,
  },
});
