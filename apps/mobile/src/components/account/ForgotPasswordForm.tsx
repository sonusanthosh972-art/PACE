import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { TextField } from '@/components/Fields';
import { useAuthStore } from '@/state/authStore';
import { SPACE } from '@/theme/tokens';

const MIN_PASSWORD = 8;

/**
 * Forgot password: email → 6-digit code → new password. The server answers the same way whether or
 * not the email has an account, so this screen never reveals that either.
 */
export function ForgotPasswordForm({
  initialEmail,
  onDone,
  onCancel,
}: {
  initialEmail: string;
  onDone: (email: string) => void;
  onCancel: () => void;
}) {
  const requestPasswordReset = useAuthStore((s) => s.requestPasswordReset);
  const resetPassword = useAuthStore((s) => s.resetPassword);
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState(initialEmail);
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (action: () => Promise<void>) => {
    setError(null);
    setBusy(true);
    try {
      await action();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const sendCode = () =>
    run(async () => {
      const trimmed = email.trim();
      if (!trimmed) throw new Error('Please enter your email address.');
      await requestPasswordReset(trimmed);
      setStep('code');
    });

  const submit = () =>
    run(async () => {
      if (!/^\d{6}$/.test(code.trim())) throw new Error('Enter the 6-digit code from the email.');
      if (password.length < MIN_PASSWORD) {
        throw new Error(`Use at least ${MIN_PASSWORD} characters for the new password.`);
      }
      await resetPassword(email.trim(), code.trim(), password);
      onDone(email.trim());
    });

  return (
    <View style={styles.form}>
      <AppText variant="bodyStrong">Reset your password</AppText>
      {step === 'email' ? (
        <>
          <AppText variant="caption" color="muted">
            We will email you a 6-digit code. It works for 15 minutes.
          </AppText>
          <TextField
            label="Email"
            placeholder="you@example.com"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
          />
        </>
      ) : (
        <>
          <AppText variant="caption" color="muted">
            If {email.trim()} has an account, a code is on its way. Check spam too.
          </AppText>
          <TextField
            label="Code"
            placeholder="123456"
            value={code}
            onChangeText={setCode}
            keyboardType="number-pad"
            maxLength={6}
            autoCorrect={false}
          />
          <TextField
            label="New password"
            placeholder="At least 8 characters"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
          />
        </>
      )}

      {error ? (
        <AppText variant="caption" color="coralText" accessibilityRole="alert">
          {error}
        </AppText>
      ) : null}

      <Button
        label={step === 'email' ? 'Send code' : 'Set new password'}
        icon={step === 'email' ? 'mail-outline' : 'key-outline'}
        loading={busy}
        onPress={step === 'email' ? sendCode : submit}
      />
      {step === 'code' ? (
        <Button label="Send a new code" variant="ghost" compact onPress={sendCode} />
      ) : null}
      <Button label="Back to sign in" variant="ghost" compact onPress={onCancel} />
    </View>
  );
}

const styles = StyleSheet.create({
  form: { gap: SPACE.md, marginTop: SPACE.sm },
});
