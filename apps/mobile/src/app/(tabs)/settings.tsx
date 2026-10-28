import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Platform, StyleSheet, View } from 'react-native';

import * as SmsReader from '../../../modules/sms-reader';

import { AppLogo } from '@/components/AppLogo';
import { AppText } from '@/components/AppText';
import { Card } from '@/components/Card';
import { ListRow, SectionTitle, Segmented } from '@/components/Controls';
import { Screen } from '@/components/Screen';
import { ErrorState, LoadingState } from '@/components/States';
import type { Settings } from '@/data/settingsRepo';
import { formatINRWhole, sumPaise } from '@/domain/money';
import { formatTimeOfDay, ordinal } from '@/lib/format';
import { exportCsv, updateSetting } from '@/services/actions';
import {
  authenticateWithBiometrics,
  checkBiometrics,
  isBiometricEnabled,
  setBiometricEnabled,
} from '@/services/biometrics';
import { useAuthStore, type SyncState } from '@/state/authStore';
import { invalidateAll, useProfile, useSettings } from '@/state/queries';
import { SPACE } from '@/theme/tokens';

const THEMES: { value: Settings['theme']; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

function formatBackupStatus(
  status: SyncState,
  lastSyncedAt: number | null,
  nextRetrySecs: number | null,
): string {
  if (status === 'syncing') return 'Syncing…';
  if (status === 'offline') return 'Waiting for internet';
  if (status === 'retrying') {
    return nextRetrySecs
      ? `Couldn't reach server, retrying in ${nextRetrySecs}s`
      : "Couldn't reach server, retrying";
  }
  if (!lastSyncedAt) return 'Never backed up';

  const diffMs = Date.now() - lastSyncedAt;
  const diffMins = Math.floor(diffMs / 60_000);
  if (diffMins < 1) return 'Backed up just now';
  if (diffMins === 1) return 'Backed up 1 min ago';
  if (diffMins < 60) return `Backed up ${diffMins} min ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours === 1) return 'Backed up 1 hour ago';
  return `Backed up ${diffHours} hours ago`;
}

export default function SettingsScreen() {
  const settings = useSettings();
  const profile = useProfile();
  const client = useQueryClient();
  const [exporting, setExporting] = useState(false);
  const { user, isAuthenticated, syncStatus, lastSyncedAt, nextRetrySeconds } = useAuthStore();

  const [bioAvailable, setBioAvailable] = useState(false);
  const [bioEnabled, setBioEnabled] = useState(false);
  const [bioName, setBioName] = useState('Fingerprint');

  // Turning the lock on or off both need the owner's confirmation.
  const onToggleBiometrics = async () => {
    const ok = await authenticateWithBiometrics(
      bioEnabled ? 'Turn off app lock' : 'Turn on app lock',
    );
    if (!ok) return;
    await setBiometricEnabled(!bioEnabled);
    setBioEnabled(!bioEnabled);
  };

  useEffect(() => {
    let active = true;
    checkBiometrics().then(async (status) => {
      const enabled = await isBiometricEnabled();
      if (!active) return;
      setBioAvailable(status.deviceSecure);
      setBioName(status.hasHardware && status.isEnrolled ? status.biometryName : 'Phone PIN');
      setBioEnabled(enabled);
    });
    return () => {
      active = false;
    };
  }, []);

  if (settings.isPending || profile.isPending) {
    return (
      <Screen>
        <LoadingState rows={6} label="Loading settings" />
      </Screen>
    );
  }
  if (settings.isError || profile.isError || !settings.data) {
    return (
      <Screen>
        <ErrorState onRetry={() => Promise.all([settings.refetch(), profile.refetch()])} />
      </Screen>
    );
  }

  const s = settings.data;
  const p = profile.data;
  const fixedTotal = p ? sumPaise(p.fixedExpenses.map((f) => f.amountPaise)) : 0;
  const smsAvailable = Platform.OS === 'android' && SmsReader.isAvailable();

  const onExport = async () => {
    setExporting(true);
    try {
      const { count } = await exportCsv();
      if (count === 0) Alert.alert('Nothing to export', 'There are no transactions yet.');
    } catch {
      Alert.alert('Export failed', 'Could not create the CSV file. Please try again.');
    } finally {
      setExporting(false);
    }
  };

  return (
    <Screen>
      <AppText variant="title" accessibilityRole="header">
        Settings
      </AppText>

      <SectionTitle>Budget</SectionTitle>
      <View style={styles.group}>
        <ListRow
          icon="cash-outline"
          title="Salary & payday"
          value={p ? formatINRWhole(p.monthlySalaryPaise) : '—'}
          subtitle={p ? `Paid on the ${ordinal(p.payday)}` : undefined}
          onPress={() => router.push('/settings/budget')}
        />
        <ListRow
          icon="home-outline"
          title="Fixed expenses"
          value={formatINRWhole(fixedTotal)}
          subtitle={p ? `${p.fixedExpenses.length} items` : undefined}
          onPress={() => router.push('/settings/fixed-expenses')}
        />
        <ListRow
          icon="trending-up-outline"
          title="Savings goal"
          value={p ? formatINRWhole(p.monthlySavingsGoalPaise) : '—'}
          onPress={() => router.push('/settings/budget')}
        />
      </View>

      <SectionTitle>Notifications</SectionTitle>
      <View style={styles.group}>
        <ListRow
          icon="notifications-outline"
          title="Times & alerts"
          subtitle={
            s.notificationsEnabled
              ? `Morning ${formatTimeOfDay(s.morningTime)} · Night ${formatTimeOfDay(s.nightTime)}`
              : 'Off'
          }
          onPress={() => router.push('/settings/notifications')}
        />
      </View>

      <SectionTitle>Appearance</SectionTitle>
      <Segmented
        label="Theme"
        options={THEMES}
        value={s.theme}
        onChange={async (theme) => {
          await updateSetting('theme', theme);
          await invalidateAll(client);
        }}
      />

      <SectionTitle>Data sources</SectionTitle>
      <View style={styles.group}>
        <ListRow
          icon="chatbox-ellipses-outline"
          title="Bank SMS"
          subtitle={
            smsAvailable
              ? 'Only messages from bank senders are read'
              : 'Available on Android builds'
          }
          onPress={smsAvailable ? () => SmsReader.openAppSettings() : undefined}
        />
        <ListRow
          icon="notifications-circle-outline"
          title="Payment app notifications"
          subtitle={
            smsAvailable
              ? SmsReader.isNotificationAccessGranted()
                ? 'On · GPay, PhonePe, Paytm and bank apps'
                : 'Off · backup source for missed SMS'
              : 'Available on Android builds'
          }
          onPress={smsAvailable ? () => SmsReader.openNotificationAccessSettings() : undefined}
        />
      </View>

      <SectionTitle>Account & Backup</SectionTitle>
      <View style={styles.group}>
        <ListRow
          icon={isAuthenticated ? 'cloud-done-outline' : 'person-circle-outline'}
          title={
            isAuthenticated
              ? user?.name || user?.email || 'Cloud backup'
              : 'Sign in / Create account'
          }
          subtitle={
            isAuthenticated
              ? formatBackupStatus(syncStatus, lastSyncedAt, nextRetrySeconds)
              : 'Sign in to mirror or restore with your private server'
          }
          value={isAuthenticated ? 'On' : 'Off'}
          onPress={() => router.push('/settings/auth')}
        />
        {bioAvailable ? (
          <ListRow
            icon="finger-print-outline"
            title="App lock"
            subtitle={
              bioEnabled
                ? `Asks for your ${bioName.toLowerCase()} when you open the app`
                : 'Off: anyone with your phone can open the app'
            }
            value={bioEnabled ? 'On' : 'Off'}
            onPress={onToggleBiometrics}
          />
        ) : null}
      </View>

      <SectionTitle>Your data</SectionTitle>
      <View style={styles.group}>
        {s.demoMode ? (
          <ListRow
            icon="flask-outline"
            title="Use my real data"
            subtitle="Remove the sample payments and read your bank SMS"
            onPress={() => router.push('/settings/exit-sample')}
          />
        ) : null}
        <ListRow
          icon="download-outline"
          title={exporting ? 'Preparing CSV…' : 'Export CSV'}
          subtitle="All transactions, for Excel or Sheets"
          onPress={exporting ? undefined : onExport}
        />
        <ListRow
          icon="trash-outline"
          title="Delete all my data"
          subtitle="From this phone and the server"
          danger
          onPress={() => router.push('/settings/delete-data')}
        />
      </View>

      <SectionTitle>About</SectionTitle>
      <Card style={styles.aboutCard}>
        <View style={styles.aboutRow}>
          <AppLogo size={40} variant="mark" animated />
          <View style={styles.aboutText}>
            <AppText variant="bodyStrong">Paisa Pulse</AppText>
            <AppText variant="caption" color="accentText">
              Powered by PACE Engine · v1.0
            </AppText>
          </View>
        </View>
        <AppText variant="caption" color="muted">
          Crafted to give every person clarity, dignity, and peace of mind over their everyday
          finances.
        </AppText>
      </Card>

      <AppText variant="caption" color="muted" center style={styles.footer}>
        Raw SMS never leave your phone. If you sign in, amounts and merchants are backed up to your
        server.
        {s.demoMode ? '\nSample data mode is on.' : ''}
      </AppText>
    </Screen>
  );
}

const styles = StyleSheet.create({
  group: { gap: SPACE.sm },
  aboutCard: { padding: SPACE.md + 4, gap: SPACE.sm },
  aboutRow: { flexDirection: 'row', alignItems: 'center', gap: SPACE.md },
  aboutText: { gap: 2 },
  footer: { marginTop: SPACE.lg },
});
