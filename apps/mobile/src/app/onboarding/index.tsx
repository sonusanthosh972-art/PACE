import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';

import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { Icon, type IconName } from '@/components/Icon';
import { Screen } from '@/components/Screen';
import { getAppDb } from '@/data/appDb';
import { systemClock } from '@/services/clock';
import { loadDemoData } from '@/services/demo';
import { invalidateAll } from '@/state/queries';
import { useTheme } from '@/theme/ThemeProvider';
import { SPACE } from '@/theme/tokens';

const POINTS: [IconName, string][] = [
  ['calendar-outline', 'A daily budget from your salary, after rent, EMIs and savings.'],
  ['chatbox-ellipses-outline', 'Payments added automatically from your bank SMS.'],
  ['lock-closed-outline', 'Only bank messages are read. They never leave your phone.'],
];

export default function Welcome() {
  const { reducedMotion } = useTheme();
  const client = useQueryClient();
  const [loadingDemo, setLoadingDemo] = useState(false);
  const enter = (delay: number) =>
    reducedMotion ? FadeIn.duration(200) : FadeInDown.duration(400).delay(delay);

  const tryDemo = async () => {
    setLoadingDemo(true);
    try {
      await loadDemoData(await getAppDb(), systemClock);
      await invalidateAll(client);
      router.replace('/(tabs)');
    } finally {
      setLoadingDemo(false);
    }
  };

  return (
    <Screen
      edges={['top', 'bottom']}
      footer={
        <View style={styles.actions}>
          <Button label="Get started" onPress={() => router.push('/onboarding/salary')} />
          <Button
            label="Explore with sample data"
            variant="ghost"
            onPress={tryDemo}
            loading={loadingDemo}
            accessibilityHint="Fills the app with realistic example payments so you can look around"
          />
        </View>
      }
    >
      <View style={styles.hero}>
        <Animated.View entering={enter(0)}>
          <Icon name="leaf-outline" size={44} color="accentText" />
        </Animated.View>
        <Animated.View entering={enter(80)}>
          <AppText variant="title" accessibilityRole="header">
            Know what you can spend today.
          </AppText>
        </Animated.View>
        <Animated.View entering={enter(160)} style={styles.points}>
          {POINTS.map(([icon, text]) => (
            <View key={text} style={styles.point}>
              <Icon name={icon} color="muted" />
              <AppText color="muted" style={styles.flex}>
                {text}
              </AppText>
            </View>
          ))}
        </Animated.View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { gap: SPACE.xl, paddingTop: SPACE.xxxl },
  points: { gap: SPACE.lg },
  point: { flexDirection: 'row', gap: SPACE.md, alignItems: 'flex-start' },
  flex: { flex: 1 },
  actions: { gap: SPACE.sm },
});
