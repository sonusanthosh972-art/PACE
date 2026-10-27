import { useQueryClient } from '@tanstack/react-query';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { StepHeader } from '@/components/Controls';
import { Icon, type IconName } from '@/components/Icon';
import { Screen } from '@/components/Screen';
import {
  getPermissionState,
  PERMISSION_COPY,
  type PermissionKind,
  type PermissionState,
} from '@/lib/permissions';
import { saveBudgetSetup, updateSetting } from '@/services/actions';
import { refreshFromDevice } from '@/services/bootstrap';
import { useImportStatus } from '@/state/importStatus';
import { useOnboarding } from '@/state/onboardingStore';
import { invalidateAll } from '@/state/queries';
import { SPACE } from '@/theme/tokens';

const KINDS: PermissionKind[] = ['sms', 'notifications', 'notification-access'];

const STATE_LABEL: Record<PermissionState, string> = {
  granted: 'On',
  denied: 'Off · tap to change',
  undetermined: 'Tap to set up',
  unavailable: 'Needs the Android app build',
};

export default function PermissionsStep() {
  const client = useQueryClient();
  const draft = useOnboarding();
  const setImporting = useImportStatus((s) => s.setImporting);
  const [states, setStates] = useState<Record<PermissionKind, PermissionState> | null>(null);
  const [finishing, setFinishing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      const read = (k: PermissionKind) =>
        getPermissionState(k).catch((): PermissionState => 'unavailable');
      Promise.all([read('sms'), read('notifications'), read('notification-access')])
        .then(([sms, notifications, access]) => {
          if (active) setStates({ sms, notifications, 'notification-access': access });
        })
        .catch(() => undefined);
      return () => {
        active = false;
      };
    }, []),
  );

  const finish = async () => {
    if (!draft.salaryPaise) {
      router.replace('/onboarding/salary');
      return;
    }
    setFinishing(true);
    setError(null);
    try {
      await saveBudgetSetup(
        {
          monthlySalaryPaise: draft.salaryPaise,
          payday: draft.payday,
          monthlySavingsGoalPaise: draft.savingsGoalPaise ?? 0,
        },
        draft.fixedExpenses,
      );
      await updateSetting('onboardingComplete', true);
      await invalidateAll(client);
      router.dismissAll();
      router.replace('/(tabs)');
      draft.reset();
      // Import runs after Today is on screen, with a progress note.
      refreshFromDevice(() => setImporting(true))
        .catch(() => undefined)
        .finally(() => {
          setImporting(false);
          invalidateAll(client).catch(() => undefined);
        });
    } catch {
      setError('Could not save your budget. Please try again.');
      setFinishing(false);
    }
  };

  return (
    <Screen
      edges={['top', 'bottom']}
      footer={
        <Button
          label="Open my peaceful budget"
          icon="sparkles"
          onPress={finish}
          loading={finishing}
        />
      }
    >
      <StepHeader
        step={4}
        total={4}
        title="Private & respectful permissions"
        body="We believe financial privacy is a sacred human right. Every permission is completely transparent and in your full control."
      />

      <Card style={styles.privacyPledge}>
        <View style={styles.pledgeRow}>
          <Icon name="shield-checkmark" color="accentText" size={24} />
          <View style={styles.flex}>
            <AppText variant="bodyStrong">The Paisa Pulse Privacy Pledge</AppText>
            <AppText variant="caption" color="muted">
              Zero advertisements. Zero server uploads. Only bank transaction amounts are read. Your
              personal life remains strictly yours.
            </AppText>
          </View>
        </View>
      </Card>

      <View style={styles.list}>
        {KINDS.map((kind) => {
          const copy = PERMISSION_COPY[kind];
          const state = states?.[kind] ?? 'undetermined';
          const granted = state === 'granted';
          return (
            <Card
              key={kind}
              onPress={
                state === 'unavailable'
                  ? undefined
                  : () => router.push(`/onboarding/permission/${kind}`)
              }
              accessibilityLabel={`${copy.title}. ${STATE_LABEL[state]}`}
            >
              <View style={styles.row}>
                <Icon name={copy.icon as IconName} color={granted ? 'accentText' : 'muted'} />
                <View style={styles.flex}>
                  <AppText variant="bodyStrong">{copy.title}</AppText>
                  <AppText variant="caption" color={granted ? 'accentText' : 'muted'}>
                    {granted ? '✓ Active · Protecting your peace' : STATE_LABEL[state]}
                  </AppText>
                </View>
                {state !== 'unavailable' ? (
                  <Icon name="chevron-forward" size={18} color="muted" />
                ) : null}
              </View>
            </Card>
          );
        })}
      </View>
      {error ? (
        <AppText variant="caption" color="coralText" accessibilityRole="alert">
          {error}
        </AppText>
      ) : null}
      <AppText variant="caption" color="muted" center>
        Optional: If you prefer not to grant permissions now, you can record payments by hand
        anytime.
      </AppText>
    </Screen>
  );
}

const styles = StyleSheet.create({
  privacyPledge: { marginBottom: SPACE.md, padding: SPACE.md },
  pledgeRow: { flexDirection: 'row', alignItems: 'center', gap: SPACE.md },
  list: { gap: SPACE.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: SPACE.md },
  flex: { flex: 1 },
});
