import { useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { Icon } from '@/components/Icon';
import { Screen } from '@/components/Screen';
import { exitSampleData } from '@/services/actions';
import { useOnboarding } from '@/state/onboardingStore';
import { SPACE } from '@/theme/tokens';

/** Leaves sample-data mode and restarts setup so the app reads the real bank SMS. */
export default function ExitSample() {
  const client = useQueryClient();
  const resetDraft = useOnboarding((s) => s.reset);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onExit = async () => {
    setBusy(true);
    setError(null);
    try {
      await exitSampleData();
      resetDraft();
      client.clear();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
      router.dismissAll();
      router.replace('/onboarding');
    } catch {
      setError('Could not remove the sample data. Please try again.');
      setBusy(false);
    }
  };

  return (
    <Screen
      edges={['bottom']}
      footer={
        <Button
          label="Remove sample data"
          icon="checkmark"
          loading={busy}
          onPress={onExit}
          accessibilityHint="Removes the example payments and starts setup with your real data"
        />
      }
    >
      <View style={styles.icon}>
        <Icon name="flask-outline" size={40} color="amberText" />
      </View>
      <AppText variant="title" center>
        Switch to your real data
      </AppText>
      <AppText color="muted">
        The payments you see now are examples. This removes them from this phone and takes you back
        to setup, where you enter your salary and allow SMS access. Paisa Pulse then reads the last
        90 days of your bank SMS.
      </AppText>
      <AppText color="muted">
        Your sign-in and anything already on the server stay as they are.
      </AppText>
      {error ? (
        <AppText variant="caption" color="coralText" accessibilityRole="alert">
          {error}
        </AppText>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  icon: { alignItems: 'center', marginTop: SPACE.lg },
});
