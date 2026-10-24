import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Platform, StyleSheet, View } from 'react-native';

import * as SmsReader from '../../../modules/sms-reader';

import { AppText } from '@/components/AppText';
import { ListRow, SectionTitle, Segmented } from '@/components/Controls';
import { Screen } from '@/components/Screen';
import { ErrorState, LoadingState } from '@/components/States';
import type { Settings } from '@/data/settingsRepo';
import { formatINRWhole, sumPaise } from '@/domain/money';
import { formatTimeOfDay, ordinal } from '@/lib/format';
import { exportCsv, updateSetting } from '@/services/actions';
import { invalidateAll, useProfile, useSettings } from '@/state/queries';
import { SPACE } from '@/theme/tokens';

const THEMES: { value: Settings['theme']; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

export default function SettingsScreen() {
  const settings = useSettings();
  const profile = useProfile();
  const client = useQueryClient();
  const [exporting, setExporting] = useState(false);

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

      <SectionTitle>Your data</SectionTitle>
      <View style={styles.group}>
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

      <AppText variant="caption" color="muted" center style={styles.footer}>
        Raw SMS never leave your phone. Only parsed amounts and merchants are stored.
        {s.demoMode ? '\nSample data mode is on.' : ''}
      </AppText>
    </Screen>
  );
}

const styles = StyleSheet.create({
  group: { gap: SPACE.sm },
  footer: { marginTop: SPACE.xl },
});
