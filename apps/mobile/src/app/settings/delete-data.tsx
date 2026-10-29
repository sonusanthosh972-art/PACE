import { useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import * as SmsReader from '../../../modules/sms-reader';

import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { TextField } from '@/components/Fields';
import { Icon } from '@/components/Icon';
import { Screen } from '@/components/Screen';
import { deleteAllData } from '@/services/actions';
import { useOnboarding } from '@/state/onboardingStore';
import { SPACE } from '@/theme/tokens';

const CONFIRM_WORD = 'DELETE';

/** In-app confirmation for "Delete all my data" (local + server). */
export default function DeleteData() {
  const client = useQueryClient();
  const resetDraft = useOnboarding((s) => s.reset);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const confirmed = typed.trim().toUpperCase() === CONFIRM_WORD;

  const onDelete = async () => {
    setBusy(true);
    setError(null);
    try {
      await deleteAllData();
      await SmsReader.clearPending();
      resetDraft();
      client.clear();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
      if (router.canDismiss()) router.dismissAll(); // nothing to dismiss → no POP_TO_TOP warning
      router.replace('/onboarding');
    } catch {
      setError(
        'Could not reach the server, so nothing was deleted. Check your connection and try again.',
      );
      setBusy(false);
    }
  };

  return (
    <Screen
      edges={['bottom']}
      footer={
        <Button
          label="Delete everything"
          variant="danger"
          icon="trash-outline"
          disabled={!confirmed}
          loading={busy}
          onPress={onDelete}
          accessibilityHint="Permanently deletes all your Paisa Pulse data"
        />
      }
    >
      <View style={styles.icon}>
        <Icon name="warning-outline" size={40} color="coralText" />
      </View>
      <AppText variant="title" center>
        This cannot be undone
      </AppText>
      <AppText color="muted">This permanently deletes:</AppText>
      <View style={styles.list}>
        {[
          'All transactions, categories and rules on this phone',
          'Your salary, fixed expenses and savings goal',
          'Your account and synced data on the Paisa Pulse server',
        ].map((line) => (
          <View key={line} style={styles.bullet}>
            <Icon name="ellipse" size={8} color="muted" />
            <AppText style={styles.flex}>{line}</AppText>
          </View>
        ))}
      </View>
      <AppText color="muted">
        Your bank SMS stay in your SMS app; Paisa Pulse never changes them.
      </AppText>
      <TextField
        label={`Type ${CONFIRM_WORD} to confirm`}
        value={typed}
        onChangeText={setTyped}
        autoCapitalize="characters"
        autoCorrect={false}
      />
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
  list: { gap: SPACE.sm },
  bullet: { flexDirection: 'row', alignItems: 'center', gap: SPACE.md },
  flex: { flex: 1 },
});
