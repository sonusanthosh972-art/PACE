import { useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';

import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { ListRow, SectionTitle, Segmented } from '@/components/Controls';
import { TextField } from '@/components/Fields';
import { Icon } from '@/components/Icon';
import { Screen } from '@/components/Screen';
import { getAppDb } from '@/data/appDb';
import { setSetting } from '@/data/settingsRepo';
import { completeAccountFlow, type NextStep } from '@/services/accountFlow';
import {
  DEFAULT_API_URL,
  getApiBaseUrl,
  setApiBaseUrl,
  testConnection,
} from '@/services/api/client';
import { restoreFromServer } from '@/services/restore';
import { syncNow } from '@/services/sync';
import {
  authenticateWithBiometrics,
  checkBiometrics,
  getBiometricCredentials,
  saveBiometricCredentials,
} from '@/services/biometrics';
import { useAuthStore, type SyncState } from '@/state/authStore';
import { invalidateAll } from '@/state/queries';
import { SPACE } from '@/theme/tokens';

type Mode = 'login' | 'register';

function formatStatus(
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

export default function AuthScreen() {
  const queryClient = useQueryClient();
  const {
    user,
    isAuthenticated,
    syncStatus,
    lastSyncedAt,
    nextRetrySeconds,
    login,
    register,
    logout,
  } = useAuthStore();

  const params = useLocalSearchParams<{ mode?: string }>();
  const [mode, setMode] = useState<Mode>(params.mode === 'register' ? 'register' : 'login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Biometrics
  const [hasBiometrics, setHasBiometrics] = useState(false);
  const [biometryName, setBiometryName] = useState('Fingerprint');
  const [hasSavedCreds, setHasSavedCreds] = useState(false);

  const { colors } = useTheme();
  const autoBioPromptRef = useRef(false);

  useEffect(() => {
    checkBiometrics().then(async (status) => {
      setHasBiometrics(status.hasHardware && status.isEnrolled);
      setBiometryName(status.biometryName);
      const creds = await getBiometricCredentials();
      setHasSavedCreds(creds !== null);
    });
  }, []);

  /** Continues the ordered flow: setup → permissions → Today (see completeAccountFlow). */
  const goNext = useCallback(
    async (next: NextStep) => {
      await invalidateAll(queryClient);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
      if (next === '/(tabs)' && router.canGoBack()) {
        router.back();
        return;
      }
      router.dismissAll();
      router.replace(next);
    },
    [queryClient],
  );

  const onBiometricSignIn = useCallback(async () => {
    setError(null);
    const authed = await authenticateWithBiometrics(`Sign in with ${biometryName}`);
    if (!authed) return;

    const creds = await getBiometricCredentials();
    if (!creds) {
      setError(`No saved credentials found. Please enter password.`);
      return;
    }

    setEmail(creds.email);
    setPassword(creds.password);
    setBusy(true);
    try {
      const db = await getAppDb();
      const next = await completeAccountFlow(db, 'login', () => login(creds.email, creds.password));
      await goNext(next);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Biometric sign-in failed. Please try again.';
      setError(message);
    } finally {
      setBusy(false);
    }
  }, [biometryName, goNext, login]);

  useEffect(() => {
    if (mode === 'login' && hasBiometrics && hasSavedCreds && !autoBioPromptRef.current) {
      autoBioPromptRef.current = true;
      const timer = setTimeout(() => {
        onBiometricSignIn();
      }, 350);
      return () => clearTimeout(timer);
    }
  }, [mode, hasBiometrics, hasSavedCreds, onBiometricSignIn]);

  // Server address configuration
  const [serverAddress, setServerAddress] = useState(() => getApiBaseUrl());
  const [testingServer, setTestingServer] = useState(false);
  const [serverStatusMessage, setServerStatusMessage] = useState<string | null>(null);
  const [serverStatusSuccess, setServerStatusSuccess] = useState<boolean | null>(null);

  const onTestServer = async () => {
    setTestingServer(true);
    setServerStatusMessage(null);
    setServerStatusSuccess(null);
    const result = await testConnection(serverAddress);
    setServerStatusSuccess(result.ok);
    setServerStatusMessage(result.status);
    setTestingServer(false);
  };

  const onSaveServerAddress = async () => {
    const clean = serverAddress.trim().replace(/\/+$/, '');
    setApiBaseUrl(clean);
    try {
      const db = await getAppDb();
      await setSetting(db, 'apiBaseUrl', clean);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
      Alert.alert('Server address saved', `Paisa Pulse will connect to:\n${clean}`);
    } catch {
      // Ignore DB write errors
    }
  };

  const onResetServerAddress = async () => {
    setApiBaseUrl(null);
    setServerAddress(getApiBaseUrl());
    setServerStatusMessage(null);
    setServerStatusSuccess(null);
    try {
      await setSetting(await getAppDb(), 'apiBaseUrl', null);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
    } catch {
      // Ignore DB write errors
    }
  };

  const onSubmit = async () => {
    setError(null);
    const trimmedEmail = email.trim();
    const trimmedName = name.trim();

    if (!trimmedEmail) {
      setError('Please enter your email address.');
      return;
    }
    if (!password) {
      setError('Please enter your password.');
      return;
    }
    if (mode === 'register' && !trimmedName) {
      setError('Please enter your name.');
      return;
    }

    setBusy(true);
    try {
      const db = await getAppDb();
      const next = await completeAccountFlow(db, mode, () =>
        mode === 'register'
          ? register(trimmedEmail, password, trimmedName)
          : login(trimmedEmail, password),
      );

      if (hasBiometrics) {
        await saveBiometricCredentials(trimmedEmail, password);
      }
      await goNext(next);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Something went wrong. Please try again.';
      setError(message);
    } finally {
      setBusy(false);
    }
  };

  const onManualSync = async () => {
    setBusy(true);
    try {
      await syncNow();
      await invalidateAll(queryClient);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Sync failed. Please check connection.';
      Alert.alert('Sync failed', message);
    } finally {
      setBusy(false);
    }
  };

  const onRestore = async () => {
    Alert.alert(
      'Restore data from server',
      'This will download your transactions, profile, and fixed expenses from the server without overwriting pending offline edits.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Restore',
          onPress: async () => {
            setBusy(true);
            try {
              const db = await getAppDb();
              const result = await restoreFromServer(db);
              await invalidateAll(queryClient);
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
                () => undefined,
              );
              Alert.alert(
                'Restore complete',
                `Restored ${result.restoredTransactions} transactions and profile data.`,
              );
            } catch (err: unknown) {
              const msg = err instanceof Error ? err.message : 'Restore failed';
              Alert.alert('Restore failed', msg);
            } finally {
              setBusy(false);
            }
          },
        },
      ],
    );
  };

  const onLogout = () => {
    Alert.alert(
      'Sign out',
      'Your offline data on this phone remains completely safe. Automatic cloud backup will pause until you sign in again.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign out',
          style: 'destructive',
          onPress: async () => {
            await logout();
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
              () => undefined,
            );
          },
        },
      ],
    );
  };

  const renderServerConfig = () => (
    <Card style={styles.serverCard}>
      <AppText variant="bodyStrong">Server Address</AppText>
      <AppText variant="caption" color="muted">
        Already set to the Paisa Pulse server. Change it only if you run your own server (for local
        development: http://&lt;computer-ip&gt;:5080).
      </AppText>
      <TextField
        label="Server URL"
        placeholder="https://your-server.example.com"
        value={serverAddress}
        onChangeText={setServerAddress}
        autoCapitalize="none"
        autoCorrect={false}
      />
      <View style={styles.serverActions}>
        <Button
          label="Test connection"
          variant="secondary"
          compact
          loading={testingServer}
          onPress={onTestServer}
        />
        <Button label="Save address" variant="primary" compact onPress={onSaveServerAddress} />
      </View>
      {serverAddress.trim().replace(/\/+$/, '') !== DEFAULT_API_URL ? (
        <Button
          label="Use the Paisa Pulse server"
          variant="ghost"
          compact
          onPress={onResetServerAddress}
          accessibilityHint={`Switches back to ${DEFAULT_API_URL}`}
        />
      ) : null}
      {serverStatusMessage ? (
        <AppText
          variant="caption"
          color={serverStatusSuccess ? 'accentText' : 'coralText'}
          accessibilityRole="alert"
        >
          {serverStatusMessage}
        </AppText>
      ) : null}
    </Card>
  );

  if (isAuthenticated && user) {
    return (
      <Screen>
        <AppText variant="title">Account & Backup</AppText>
        <Card style={styles.card}>
          <View style={styles.userRow}>
            <View style={styles.avatar}>
              <Icon name="person" size={24} color="onAccent" />
            </View>
            <View style={styles.userMeta}>
              <AppText variant="bodyStrong">{user.name || 'User'}</AppText>
              <AppText variant="caption" color="muted">
                {user.email}
              </AppText>
            </View>
          </View>
        </Card>

        <SectionTitle>Backup status</SectionTitle>
        <View style={styles.group}>
          <ListRow
            icon="cloud-done-outline"
            title="Server sync"
            subtitle={formatStatus(syncStatus, lastSyncedAt, nextRetrySeconds)}
            right={
              <Button
                label="Sync now"
                variant="ghost"
                compact
                loading={syncStatus === 'syncing' || busy}
                onPress={onManualSync}
              />
            }
          />
          <ListRow
            icon="cloud-download-outline"
            title="Restore from server"
            subtitle="Download any data from another phone"
            onPress={busy ? undefined : onRestore}
          />
        </View>

        <SectionTitle>Server connection</SectionTitle>
        {renderServerConfig()}

        <SectionTitle>Session</SectionTitle>
        <View style={styles.group}>
          <ListRow
            icon="log-out-outline"
            title="Sign out"
            subtitle="Keep local data, pause cloud backup"
            onPress={onLogout}
          />
        </View>

        <AppText variant="caption" color="muted" center style={styles.footer}>
          Raw SMS never leave your phone. If you sign in, amounts and merchants are backed up to
          your server.
        </AppText>
      </Screen>
    );
  }

  return (
    <Screen>
      <AppText variant="title">Account & Backup</AppText>
      <AppText color="muted">
        {mode === 'register'
          ? 'Create your account. Next you set up your budget and allow bank SMS, so everything you see is your real spending.'
          : 'Sign in to continue. Your budget and transactions are restored from your server.'}
      </AppText>

      <Segmented
        label="Account Mode"
        options={[
          { value: 'login', label: 'Sign in' },
          { value: 'register', label: 'Create account' },
        ]}
        value={mode}
        onChange={(m) => {
          setMode(m);
          setError(null);
        }}
      />

      <View style={styles.form}>
        {mode === 'login' && hasBiometrics ? (
          <View style={styles.bioSection}>
            <Button
              label={`Sign In with ${biometryName}`}
              variant="secondary"
              icon="finger-print-outline"
              loading={busy}
              onPress={onBiometricSignIn}
              accessibilityHint={`Authenticate instantly using ${biometryName}`}
            />
            <View style={styles.orDivider}>
              <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
              <AppText variant="caption" color="muted">
                or use normal login
              </AppText>
              <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
            </View>
          </View>
        ) : null}

        {mode === 'register' ? (
          <TextField
            label="Name"
            placeholder="Your name"
            value={name}
            onChangeText={setName}
            autoCapitalize="words"
            autoCorrect={false}
          />
        ) : null}

        <TextField
          label="Email"
          placeholder="you@example.com"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
        />

        <TextField
          label="Password"
          placeholder="••••••••"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
        />

        {error ? (
          <AppText variant="caption" color="coralText" accessibilityRole="alert">
            {error}
          </AppText>
        ) : null}

        <Button
          label={mode === 'register' ? 'Create Account' : 'Sign In'}
          variant="primary"
          loading={busy}
          onPress={onSubmit}
          icon={mode === 'register' ? 'person-add-outline' : 'log-in-outline'}
        />
      </View>

      <SectionTitle>Server connection</SectionTitle>
      {renderServerConfig()}

      <Card style={styles.privacyCard}>
        <View style={styles.bulletRow}>
          <Icon name="shield-checkmark-outline" size={20} color="accentText" />
          <AppText variant="caption" color="muted" style={styles.flex}>
            Raw SMS text never leaves your phone. Only parsed amounts, merchants, categories and
            dates are backed up.
          </AppText>
        </View>
        <View style={styles.bulletRow}>
          <Icon name="lock-closed-outline" size={20} color="accentText" />
          <AppText variant="caption" color="muted" style={styles.flex}>
            Tokens are securely stored in hardware-encrypted storage.
          </AppText>
        </View>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { padding: SPACE.md + 4 },
  userRow: { flexDirection: 'row', alignItems: 'center', gap: SPACE.md },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#00C853',
    alignItems: 'center',
    justifyContent: 'center',
  },
  userMeta: { flex: 1, gap: 2 },
  group: { gap: SPACE.sm },
  form: { gap: SPACE.md, marginTop: SPACE.sm },
  bioSection: { gap: SPACE.sm },
  orDivider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.sm,
    marginVertical: SPACE.xs,
  },
  dividerLine: {
    flex: 1,
    height: 1,
  },
  serverCard: { padding: SPACE.md + 4, gap: SPACE.sm, marginTop: SPACE.xs },
  serverActions: { flexDirection: 'row', gap: SPACE.md, marginTop: SPACE.xs },
  privacyCard: { marginTop: SPACE.lg, padding: SPACE.md + 4, gap: SPACE.md },
  bulletRow: { flexDirection: 'row', alignItems: 'flex-start', gap: SPACE.md },
  flex: { flex: 1 },
  footer: { marginTop: SPACE.xl },
});
