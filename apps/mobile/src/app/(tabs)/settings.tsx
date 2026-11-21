import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, AppState, Platform, StyleSheet, View } from 'react-native';

import * as SmsReader from '../../../modules/sms-reader';

import { AppHeader, HeaderBackground, TAB_GUTTER } from '@/components/AppHeader';
import { BrandLogo } from '@/components/brand/BrandLogo';
import { AppText } from '@/components/AppText';
import { Icon } from '@/components/Icon';
import { PressableScale } from '@/components/PressableScale';
import { ListRow, RowGroup, SectionTitle } from '@/components/Controls';
import { Screen } from '@/components/Screen';
import { ErrorState, LoadingState } from '@/components/States';
import { formatINRWhole, sumPaise } from '@/domain/money';
import { formatTimeOfDay, ordinal } from '@/lib/format';
import { getPermissionState, type PermissionState } from '@/lib/permissions';
import { exportCsv } from '@/services/actions';
import {
  authenticateWithBiometrics,
  checkBiometrics,
  isBiometricEnabled,
  setBiometricEnabled,
} from '@/services/biometrics';
import { useAuthStore, type SyncState } from '@/state/authStore';
import { useProfile, useSettings } from '@/state/queries';
import { useTheme } from '@/theme/ThemeProvider';
import { ICON, RADIUS, SPACE } from '@/theme/tokens';

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
  const [exporting, setExporting] = useState(false);
  const { user, isAuthenticated, syncStatus, lastSyncedAt, nextRetrySeconds } = useAuthStore();

  const [bioAvailable, setBioAvailable] = useState(false);
  const [bioEnabled, setBioEnabled] = useState(false);
  const [bioName, setBioName] = useState('Fingerprint');
  const [smsState, setSmsState] = useState<PermissionState>('undetermined');
  const [notifAccess, setNotifAccess] = useState(false);

  // Re-checked on return from the system settings, where these are changed.
  useEffect(() => {
    if (Platform.OS !== 'android' || !SmsReader.isAvailable()) return;
    const check = () => {
      getPermissionState('sms')
        .then(setSmsState)
        .catch(() => undefined);
      setNotifAccess(SmsReader.isNotificationAccessGranted());
    };
    check();
    const sub = AppState.addEventListener('change', (st) => {
      if (st === 'active') check();
    });
    return () => sub.remove();
  }, []);

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

  const header = (
    <AppHeader page="settings" title="Settings" hint="Manage your account and preferences." />
  );
  const screenProps = {
    background: <HeaderBackground />,
    backgroundScrolls: true,
    gutter: TAB_GUTTER,
  } as const;

  if (settings.isPending || profile.isPending) {
    return (
      <Screen {...screenProps}>
        {header}
        <LoadingState label="Loading settings" />
      </Screen>
    );
  }
  if (settings.isError || profile.isError || !settings.data) {
    return (
      <Screen {...screenProps}>
        {header}
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
    <Screen {...screenProps}>
      {header}

      <ProfileCard
        name={isAuthenticated ? user?.name || 'Your account' : 'Sign in or create account'}
        detail={
          isAuthenticated
            ? (user?.email ?? formatBackupStatus(syncStatus, lastSyncedAt, nextRetrySeconds))
            : 'Back up and restore on a new phone'
        }
        initial={(user?.name || user?.email || '').trim().charAt(0).toUpperCase()}
      />

      <RowGroup>
        <ListRow
          icon="wallet-outline"
          title="Budget & plans"
          subtitle={
            p
              ? `${formatINRWhole(p.monthlySalaryPaise)} income · payday on the ${ordinal(p.payday)} · ${formatINRWhole(p.monthlySavingsGoalPaise)} savings`
              : 'Income, bills and savings'
          }
          onPress={() => router.push('/settings/budget')}
          flush
        />
        <ListRow
          icon="home-outline"
          title="Fixed expenses"
          value={formatINRWhole(fixedTotal)}
          subtitle={
            p
              ? `${p.fixedExpenses.length} ${p.fixedExpenses.length === 1 ? 'item' : 'items'}`
              : undefined
          }
          onPress={() => router.push('/settings/fixed-expenses')}
          flush
        />
        <ListRow
          icon="notifications-outline"
          title="Notifications"
          subtitle={
            s.notificationsEnabled
              ? `Reminders at ${formatTimeOfDay(s.morningTime)} and ${formatTimeOfDay(s.nightTime)}`
              : 'Alerts and reminder time · off'
          }
          onPress={() => router.push('/settings/notifications')}
          flush
        />
        <ListRow
          icon="server-outline"
          title="Bank SMS"
          subtitle={
            smsAvailable
              ? smsState === 'granted'
                ? 'Connected · only bank senders are read'
                : 'Not allowed · tap to allow'
              : 'Available on Android builds'
          }
          onPress={smsAvailable ? () => SmsReader.openAppSettings() : undefined}
          flush
        />
        <ListRow
          icon="notifications-circle-outline"
          title="Payment app alerts"
          value={smsAvailable ? (notifAccess ? 'On' : 'Off') : undefined}
          subtitle={
            smsAvailable
              ? 'Backup for missed SMS: GPay, PhonePe, Paytm'
              : 'Available on Android builds'
          }
          onPress={smsAvailable ? () => SmsReader.openNotificationAccessSettings() : undefined}
          flush
        />
        <ListRow icon="moon-outline" title="Appearance" subtitle="Dark theme" flush />
      </RowGroup>

      <SectionTitle icon="shield-checkmark-outline">Security & backup</SectionTitle>
      <RowGroup>
        <ListRow
          icon={isAuthenticated ? 'cloud-done-outline' : 'person-circle-outline'}
          title={
            isAuthenticated
              ? user?.name || user?.email || 'Cloud backup'
              : 'Sign in or create account'
          }
          subtitle={
            isAuthenticated
              ? formatBackupStatus(syncStatus, lastSyncedAt, nextRetrySeconds)
              : 'Back up and restore on a new phone'
          }
          onPress={() => router.push('/settings/auth')}
          flush
        />
        {bioAvailable ? (
          <ListRow
            icon="finger-print-outline"
            title="App lock"
            subtitle={
              bioEnabled
                ? `Asks for your ${bioName.toLowerCase()} when you open the app`
                : 'Anyone with your phone can open the app'
            }
            value={bioEnabled ? 'On' : 'Off'}
            onPress={onToggleBiometrics}
            flush
          />
        ) : null}
      </RowGroup>

      <SectionTitle icon="folder-open-outline">Your data</SectionTitle>
      <RowGroup>
        {s.demoMode ? (
          <ListRow
            icon="flask-outline"
            title="Use my real data"
            subtitle="Remove the sample payments and read your bank SMS"
            onPress={() => router.push('/settings/exit-sample')}
            flush
          />
        ) : null}
        <ListRow
          icon="download-outline"
          title={exporting ? 'Preparing CSV…' : 'Export CSV'}
          subtitle="All transactions, for Excel or Sheets"
          onPress={exporting ? undefined : onExport}
          flush
        />
        <ListRow
          icon="trash-outline"
          title="Delete all my data"
          subtitle="From this phone and the server"
          danger
          onPress={() => router.push('/settings/delete-data')}
          flush
        />
      </RowGroup>

      <View style={styles.about}>
        <BrandLogo size={56} />
        <AppText variant="bodyStrong">PACE</AppText>
        <AppText variant="caption" color="muted" center style={styles.aboutBody}>
          Raw SMS never leave your phone. If you sign in, amounts and merchants are backed up to
          your server.
          {s.demoMode ? '\nSample data mode is on.' : ''}
        </AppText>
      </View>
    </Screen>
  );
}

function ProfileCard({ name, detail, initial }: { name: string; detail: string; initial: string }) {
  const { colors } = useTheme();
  return (
    <PressableScale
      onPress={() => router.push('/settings/auth')}
      accessibilityRole="button"
      accessibilityLabel={`${name}, ${detail}. Account and backup.`}
      style={[styles.profile, { backgroundColor: colors.surface, borderColor: colors.border }]}
    >
      <View
        style={[styles.avatar, { backgroundColor: colors.elevated, borderColor: colors.primary }]}
      >
        {initial ? (
          <AppText variant="heading" style={{ color: colors.primary }}>
            {initial}
          </AppText>
        ) : (
          <Icon name="person-outline" size={ICON.lg} color="text" />
        )}
      </View>
      <View style={styles.flex}>
        <AppText variant="heading" numberOfLines={1}>
          {name}
        </AppText>
        <AppText variant="caption" color="muted" numberOfLines={1}>
          {detail}
        </AppText>
      </View>
      <Icon name="chevron-forward" size={ICON.md} color="muted" />
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, gap: 2 },
  profile: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.lg,
    padding: SPACE.lg,
    borderRadius: RADIUS.lg,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: SPACE.xs,
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: RADIUS.pill,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  about: { alignItems: 'center', gap: SPACE.xs, marginTop: SPACE.xxl, marginBottom: SPACE.xl },
  aboutBody: { maxWidth: 320 },
});
