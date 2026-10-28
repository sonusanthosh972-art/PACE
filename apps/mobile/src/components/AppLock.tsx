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
import { router } from 'expo-router';

import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { TextField } from '@/components/Fields';
import { Icon } from '@/components/Icon';
import {
  authenticateWithBiometrics,
  checkBiometrics,
  getBiometricCredentials,
  isBiometricEnabled,
} from '@/services/biometrics';
import { useAuthStore } from '@/state/authStore';
import { useLockStore } from '@/state/lockStore';
import { useTheme } from '@/theme/ThemeProvider';
import { RADIUS, SPACE } from '@/theme/tokens';

interface AppLockProps {
  onboardingComplete: boolean;
}

/**
 * AppLock screen protecting financial data.
 * When the app opens, it prompts for Fingerprint (Option 1).
 * If the user does not want to use fingerprint, they can use Normal Login (Option 2).
 */
export function AppLock({ onboardingComplete }: AppLockProps) {
  const { colors } = useTheme();
  const isLocked = useLockStore((s) => s.isLocked);
  const unlock = useLockStore((s) => s.unlock);
  const lock = useLockStore((s) => s.lock);
  const user = useAuthStore((s) => s.user);
  const login = useAuthStore((s) => s.login);

  const [hasBiometrics, setHasBiometrics] = useState(false);
  const [biometryName, setBiometryName] = useState('Fingerprint');
  const [bioEnabled, setBioEnabled] = useState(true);
  const [hasSavedCreds, setHasSavedCreds] = useState(false);
  const [authenticating, setAuthenticating] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  // Normal login state
  const [passwordMode, setPasswordMode] = useState(false);
  const [password, setPassword] = useState('');
  const [loginEmail, setLoginEmail] = useState('');
  const [loggingIn, setLoggingIn] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);

  const mountedRef = useRef(true);
  const backgroundTimeRef = useRef<number>(0);
  const autoPromptTriggered = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Check hardware and saved credentials
  useEffect(() => {
    let active = true;
    checkBiometrics().then(async (status) => {
      if (!active) return;
      const available = status.hasHardware && status.isEnrolled;
      setHasBiometrics(available);
      setBiometryName(status.biometryName);
      const enabled = await isBiometricEnabled();
      setBioEnabled(enabled);
      const creds = await getBiometricCredentials();
      setHasSavedCreds(creds !== null);
      if (user?.email) {
        setLoginEmail(user.email);
      } else if (creds?.email) {
        setLoginEmail(creds.email);
      }
    });
    return () => {
      active = false;
    };
  }, [user]);

  // Primary Action: Authenticate with Biometrics (Option 1)
  const triggerBiometricUnlock = useCallback(async () => {
    if (authenticating) return;
    setAuthenticating(true);
    setAuthError(null);
    try {
      const success = await authenticateWithBiometrics(`Unlock Paisa Pulse with ${biometryName}`);
      if (!mountedRef.current) return;
      if (success) {
        unlock();
      } else {
        setAuthError(
          `Authentication was cancelled or not recognized. Try again or use normal login.`,
        );
      }
    } catch {
      if (mountedRef.current) {
        setAuthError(`Could not authenticate with ${biometryName}. Please use normal login.`);
      }
    } finally {
      if (mountedRef.current) {
        setAuthenticating(false);
      }
    }
  }, [authenticating, biometryName, unlock]);

  // Auto-prompt fingerprint once when locked on app open
  useEffect(() => {
    if (
      isLocked &&
      onboardingComplete &&
      !autoPromptTriggered.current &&
      hasBiometrics &&
      bioEnabled
    ) {
      autoPromptTriggered.current = true;
      const timer = setTimeout(() => {
        triggerBiometricUnlock();
      }, 350);
      return () => clearTimeout(timer);
    }
  }, [isLocked, onboardingComplete, hasBiometrics, bioEnabled, triggerBiometricUnlock]);

  // Re-lock when app moves to background and comes back to active
  useEffect(() => {
    if (!onboardingComplete) return;

    const sub = AppState.addEventListener('change', (nextState: AppStateStatus) => {
      if (nextState === 'background') {
        backgroundTimeRef.current = Date.now();
      } else if (nextState === 'active') {
        const bgDuration = Date.now() - backgroundTimeRef.current;
        if (backgroundTimeRef.current > 0 && bgDuration > 1000) {
          lock();
          setPasswordMode(false);
          setPassword('');
          setLoginError(null);
          autoPromptTriggered.current = false;
        }
        backgroundTimeRef.current = 0;
      }
    });

    return () => sub.remove();
  }, [onboardingComplete, lock]);

  // Secondary Action: Normal login with password (Option 2)
  const handlePasswordLogin = async () => {
    setLoginError(null);
    const targetEmail = user?.email || loginEmail.trim();

    if (!targetEmail) {
      setLoginError('Please enter your email address.');
      return;
    }
    if (!password) {
      setLoginError('Please enter your password.');
      return;
    }

    setLoggingIn(true);
    try {
      await login(targetEmail, password);
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

  const handleDevicePasscodeFallback = async () => {
    setAuthenticating(true);
    setAuthError(null);
    try {
      const ok = await authenticateWithBiometrics('Unlock Paisa Pulse');
      if (ok && mountedRef.current) {
        unlock();
      }
    } finally {
      if (mountedRef.current) {
        setAuthenticating(false);
      }
    }
  };

  // If app is not onboarded or already unlocked, do not display lock
  if (!onboardingComplete || !isLocked) {
    return null;
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
          {user?.name || user?.email || loginEmail ? (
            <Card style={styles.userCard}>
              <View style={styles.userRow}>
                <View style={styles.userAvatar}>
                  <Icon name="person" size={18} color="onAccent" />
                </View>
                <View style={styles.userMeta}>
                  <AppText variant="bodyStrong">
                    {user?.name || (user?.email ? user.email.split('@')[0] : 'Your Account')}
                  </AppText>
                  <AppText variant="caption" color="muted">
                    {user?.email || loginEmail}
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
            /* Option 1: Biometric First + Option 2: Normal Login button */
            <View style={styles.actionBlock}>
              {hasBiometrics ? (
                <Button
                  label={`Unlock with ${biometryName}`}
                  icon="finger-print-outline"
                  variant="primary"
                  loading={authenticating}
                  onPress={triggerBiometricUnlock}
                  accessibilityHint={`Unlock immediately with your ${biometryName}`}
                />
              ) : null}

              <Button
                label="Normal Login"
                icon="log-in-outline"
                variant={hasBiometrics ? 'secondary' : 'primary'}
                onPress={() => setPasswordMode(true)}
                accessibilityHint="Log in with your email and password instead of fingerprint"
              />

              {!user && !hasSavedCreds ? (
                <Button
                  label="Unlock with device passcode"
                  icon="keypad-outline"
                  variant="ghost"
                  compact
                  onPress={handleDevicePasscodeFallback}
                  accessibilityHint="Use your device PIN, pattern or password"
                />
              ) : null}
            </View>
          ) : (
            /* Option 2 Form: Normal Password Login */
            <View style={styles.passwordForm}>
              <AppText variant="bodyStrong" center>
                Sign In with Password
              </AppText>

              {!user?.email && (
                <TextField
                  label="Email"
                  placeholder="you@example.com"
                  value={loginEmail}
                  onChangeText={setLoginEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              )}

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

              {hasBiometrics ? (
                <Button
                  label={`Back to ${biometryName}`}
                  icon="finger-print-outline"
                  variant="secondary"
                  compact
                  onPress={() => {
                    setPasswordMode(false);
                    setLoginError(null);
                  }}
                />
              ) : null}

              <Button
                label="Sign in with different account"
                variant="ghost"
                compact
                onPress={() => {
                  unlock();
                  router.push('/settings/auth?mode=login');
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
