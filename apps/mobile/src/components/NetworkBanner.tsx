import { StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { SPACE } from '@/theme/tokens';

import { AppText } from './AppText';
import { Icon } from './Icon';

export function NetworkBanner() {
  const network = useNetworkStatus();

  if (network.isConnected && network.isInternetReachable !== false) {
    return null;
  }

  const isOffline = !network.isConnected;

  const title = isOffline ? "You're offline" : 'Slow connection';
  const message = isOffline
    ? "Changes will sync when you're back online"
    : 'Some features may be unavailable';

  return (
    <Animated.View
      entering={FadeIn.duration(200)}
      exiting={FadeOut.duration(200)}
      style={[
        styles.banner,
        {
          backgroundColor: isOffline ? '#7C2D12' : '#92400E',
        },
      ]}
    >
      <Icon name="cloud-download-outline" size={16} tint="#FED7AA" />
      <View style={styles.content}>
        <AppText style={styles.title} color="text">
          {title}
        </AppText>
        <AppText style={styles.message} color="muted">
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
    paddingVertical: SPACE.md,
  },
  content: {
    flex: 1,
  },
  title: {
    fontSize: 13,
    fontWeight: '600',
  },
  message: {
    fontSize: 12,
    marginTop: 2,
  },
});
