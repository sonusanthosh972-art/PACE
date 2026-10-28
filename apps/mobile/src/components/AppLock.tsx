import { useEffect, useRef, useState, useCallback } from 'react';
import {
  AppState,
  type AppStateStatus,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';

import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { TextField } from '@/components/Fields';
import { Icon } from '@/components/Icon';
import {
  authenticateWithBiometrics,
  checkBiometrics,
  isBiometricEnabled,
  purgeLegacyCredentials,
} from '@/services/biometrics';
import { useAuthStore } from '@/state/authStore';
import { useLockStore } from '@/state/lockStore';
import { useTheme } from '@/theme/ThemeProvider';
import { RADIUS, SPACE } from '@/theme/tokens';

/** Time away (switching apps, screen off) after which the app locks again. */
export const RELOCK_AFTER_MS = 30_000;

interface AppLockProps {
  onboardingComplete: boolean;
}

/**
 * Lock screen protecting financial data, shown only when the app lock is on (Settings) and the
 * phone has a screen lock. Unlocks with fingerprint/face or the phone's own PIN; a signed-in user
 * can also use their account password. There is no way past it without one of those.
 */
export function AppLock({ onboardingComplete }: AppLockProps) {
  const { colors } = useTheme();
  const isLocked = useLockStore((s) => s.isLocked);
  const unlock = useLockStore((s) => s.unlock);
  const lock = useLockStore((s) => s.lock);
  const user = useAuthStore((s) => s.user);
  const login = useAuthStore((s) => s.login);

  /** null while checking whether the lock applies at all. */
  const [lockEnabled, setLockEnabled] = useState<boolean | null>(null);
  const [hasBiometrics, setHasBiometrics] = useState(false);
  const [biometryName, setBiometryName] = useState('Fingerprint');
  const [authenticating, setAuthenticating] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  // Account password unlock (signed-in users only)
  const [passwordMode, setPasswordMode] = useState(false);
  const [password, setPassword] = useState('');
  const [loggingIn, setLoggingIn] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);

  const mountedRef = useRef(true);
  const backgroundTimeRef = useRef<number>(0);
  const autoPromptTriggered = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    purgeLegacyCredentials().catch(() => undefined);
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Decide whether the lock applies, each time the app becomes locked.
  useEffect(() => {
    if (!isLocked || !onboardingComplete) return;
    let active = true;
    Promise.all([checkBiometrics(), isBiometricEnabled()]).then(([status, enabled]) => {
      if (!active) return;
      setHasBiometrics(status.hasHardware && status.isEnrolled);
      setBiometryName(status.biometryName);
      setLockEnabled(enabled);
      if (!enabled) unlock();
    });
    return () => {
      active = false;
    };
  }, [isLocked, onboardingComplete, unlock]);

  const deviceUnlockLabel = hasBiometrics ? biometryName : 'phone PIN';

  const triggerDeviceUnlock = useCallback(async () => {
    if (authenticating) return;
    setAuthenticating(true);
    setAuthError(null);
    try {
      const success = await authenticateWithBiometrics(
        `Unlock Paisa Pulse with your ${deviceUnlockLabel}`,
      );
      if (!mountedRef.current) return;
      if (success) {
        unlock();
      } else {
        setAuthError('Not unlocked. Try again.');
      }
    } finally {
      if (mountedRef.current) {
        setAuthenticating(false);
      }
    }
  }, [authenticating, deviceUnlockLabel, unlock]);

  // Prompt once automatically when the lock screen appears
  useEffect(() => {
    if (isLocked && onboardingComplete && lockEnabled && !autoPromptTriggered.current) {
      autoPromptTriggered.current = true;
      const timer = setTimeout(() => {
        triggerDeviceUnlock();
      }, 350);
      return () => clearTimeout(timer);
    }
  }, [isLocked, onboardingComplete, lockEnabled, triggerDeviceUnlock]);

  // Lock again after the app has been away for a while
  useEffect(() => {
    if (!onboardingComplete) return;

    const sub = AppState.addEventListener('change', (nextState: AppStateStatus) => {
      if (nextState === 'background') {
        backgroundTimeRef.current = Date.now();
      } else if (nextState === 'active') {
        const awayMs = Date.now() - backgroundTimeRef.current;
        if (backgroundTimeRef.current > 0 && awayMs > RELOCK_AFTER_MS) {
          setLockEnabled(null);
          lock();
          setPasswordMode(false);
          setPassword('');
          setLoginError(null);
          setAuthError(null);
          autoPromptTriggered.current = false;
        }
        backgroundTimeRef.current = 0;
      }
    });

    return () => sub.remove();
  }, [onboardingComplete, lock]);

  // Account password: only the signed-in account can unlock this phone's data.
  const handlePasswordLogin = async () => {
    setLoginError(null);
    if (!user?.email) return;
    if (!password) {
      setLoginError('Please enter your password.');
      return;
    }

    setLoggingIn(true);
    try {
      await login(user.email, password);
      if (mountedRef.current) {
        setPassword('');
        unlock();
      }
    } catch (err: unknown) {
      if (mountedRef.current) {
        const msg = err instanceof Error ? err.message : 'Invalid password. Please try again.';
        setLoginError(msg);
      }
    } finally {
      if (mountedRef.current) {
        setLoggingIn(false);
      }
    }
  };

  // If app is not onboarded or already unlocked, do not display lock
  if (!onboardingComplete || !isLocked || lockEnabled === false) {
    return null;
  }

  // Still checking: cover the data without showing anything to tap yet.
  if (lockEnabled === null) {
    return (
      <View style={[StyleSheet.absoluteFill, styles.overlay, { backgroundColor: colors.bg }]} />
    );
  }

  return (
    <View style={[StyleSheet.absoluteFill, styles.overlay, { backgroundColor: colors.bg }]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboardAvoid}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {/* Brand header */}
          <View style={styles.header}>
            <View style={[styles.iconBadge, { backgroundColor: colors.surface }]}>
              <Icon name="lock-closed" size={32} color="accentText" />
            </View>
            <AppText variant="title" center accessibilityRole="header">
              Paisa Pulse
            </AppText>
            <AppText variant="caption" color="muted" center style={styles.subtitle}>
              Your financial data is locked. Authenticate to continue.
            </AppText>
          </View>

          {/* User badge if known */}
          {user?.email ? (
            <Card style={styles.userCard}>
              <View style={styles.userRow}>
                <View style={styles.userAvatar}>
                  <Icon name="person" size={18} color="onAccent" />
                </View>
                <View style={styles.userMeta}>
                  <AppText variant="bodyStrong">{user.name || user.email.split('@')[0]}</AppText>
                  <AppText variant="caption" color="muted">
                    {user.email}
                  </AppText>
                </View>
              </View>
            </Card>
          ) : null}

          {/* Error messages */}
          {authError && !passwordMode ? (
            <AppText
              variant="caption"
              color="coralText"
              center
              style={styles.errorText}
              accessibilityRole="alert"
            >
              {authError}
            </AppText>
          ) : null}

          {!passwordMode ? (
            /* Phone unlock (fingerprint/face or PIN), or the account password */
            <View style={styles.actionBlock}>
              <Button
                label={`Unlock with ${deviceUnlockLabel}`}
                icon={hasBiometrics ? 'finger-print-outline' : 'keypad-outline'}
                variant="primary"
                loading={authenticating}
                onPress={triggerDeviceUnlock}
                accessibilityHint={`Unlocks the app with your ${deviceUnlockLabel}`}
              />

              {user?.email ? (
                <Button
                  label="Use account password"
                  icon="log-in-outline"
                  variant="secondary"
                  onPress={() => setPasswordMode(true)}
                  accessibilityHint="Unlock with the password of the signed-in account"
                />
              ) : null}
            </View>
          ) : (
            /* Option 2 Form: Normal Password Login */
            <View style={styles.passwordForm}>
              <AppText variant="bodyStrong" center>
                Unlock with account password
              </AppText>

              <TextField
                label="Password"
                placeholder="••••••••"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
              />

              {loginError ? (
                <AppText variant="caption" color="coralText" accessibilityRole="alert">
                  {loginError}
                </AppText>
              ) : null}

              <Button
                label="Unlock"
                icon="log-in-outline"
                variant="primary"
                loading={loggingIn}
                onPress={handlePasswordLogin}
              />

              <Button
                label={`Back to ${deviceUnlockLabel}`}
                icon={hasBiometrics ? 'finger-print-outline' : 'keypad-outline'}
                variant="secondary"
                compact
                onPress={() => {
                  setPasswordMode(false);
                  setLoginError(null);
                }}
              />
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    zIndex: 9999,
    elevation: 9999,
  },
  keyboardAvoid: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: SPACE.xl,
    paddingVertical: SPACE.xxl,
    gap: SPACE.lg,
  },
  header: {
    alignItems: 'center',
    gap: SPACE.sm,
  },
  iconBadge: {
    width: 64,
    height: 64,
    borderRadius: RADIUS.pill,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACE.xs,
  },
  subtitle: {
    maxWidth: 280,
  },
  userCard: {
    padding: SPACE.md,
  },
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.md,
  },
  userAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#00C853',
    alignItems: 'center',
    justifyContent: 'center',
  },
  userMeta: {
    flex: 1,
  },
  errorText: {
    marginHorizontal: SPACE.md,
  },
  actionBlock: {
    gap: SPACE.md,
    marginTop: SPACE.sm,
  },
  passwordForm: {
    gap: SPACE.md,
    marginTop: SPACE.xs,
  },
});
