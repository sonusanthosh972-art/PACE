import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { ListRow } from '@/components/Controls';
import { TextField } from '@/components/Fields';
import { useAuthStore } from '@/state/authStore';
import { SPACE } from '@/theme/tokens';

const MIN_PASSWORD = 8;

function message(err: unknown): string {
  return err instanceof Error ? err.message : 'Something went wrong. Please try again.';
}

/** Signed-in account security: confirm the email address and change the password. */
export function AccountSecurity() {
  const user = useAuthStore((s) => s.user);
  const sendVerificationCode = useAuthStore((s) => s.sendVerificationCode);
  const verifyEmail = useAuthStore((s) => s.verifyEmail);
  const changePassword = useAuthStore((s) => s.changePassword);

  const [codeSent, setCodeSent] = useState(false);
  const [code, setCode] = useState('');
  const [verifyBusy, setVerifyBusy] = useState(false);
  const [verifyError, setVerifyError] = useState<string | null>(null);

  const [changing, setChanging] = useState(false);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [pwBusy, setPwBusy] = useState(false);
  const [pwMessage, setPwMessage] = useState<{ ok: boolean; text: string } | null>(null);

  // Older servers do not report verification; only nag when they say it is not verified.
  const needsVerify = user?.emailVerified === false;

  const onSendCode = async () => {
    setVerifyError(null);
    setVerifyBusy(true);
    try {
      await sendVerificationCode();
      setCodeSent(true);
    } catch (err) {
      setVerifyError(message(err));
    } finally {
      setVerifyBusy(false);
    }
  };

  const onVerify = async () => {
    setVerifyError(null);
    if (!/^\d{6}$/.test(code.trim())) {
      setVerifyError('Enter the 6-digit code from the email.');
      return;
    }
    setVerifyBusy(true);
    try {
      await verifyEmail(code.trim());
      setCode('');
    } catch (err) {
      setVerifyError(message(err));
    } finally {
      setVerifyBusy(false);
    }
  };

  const onChangePassword = async () => {
    setPwMessage(null);
    if (!current) {
      setPwMessage({ ok: false, text: 'Enter your current password.' });
      return;
    }
    if (next.length < MIN_PASSWORD) {
      setPwMessage({ ok: false, text: `Use at least ${MIN_PASSWORD} characters.` });
      return;
    }
    setPwBusy(true);
    try {
      await changePassword(current, next);
      setCurrent('');
      setNext('');
      setChanging(false);
      setPwMessage({ ok: true, text: 'Password changed. Other devices were signed out.' });
    } catch (err) {
      setPwMessage({ ok: false, text: message(err) });
    } finally {
      setPwBusy(false);
    }
  };

  return (
    <View style={styles.group}>
      {needsVerify ? (
        <Card style={styles.card}>
          <AppText variant="bodyStrong">Confirm your email</AppText>
          <AppText variant="caption" color="muted">
            Confirming {user?.email} makes sure you can reset your password if you forget it.
          </AppText>
          {codeSent ? (
            <TextField
              label="Code"
              placeholder="123456"
              value={code}
              onChangeText={setCode}
              keyboardType="number-pad"
              maxLength={6}
              autoCorrect={false}
            />
          ) : null}
          {verifyError ? (
            <AppText variant="caption" color="coralText" accessibilityRole="alert">
              {verifyError}
            </AppText>
          ) : null}
          <Button
            label={codeSent ? 'Confirm email' : 'Email me a code'}
            icon={codeSent ? 'checkmark-circle-outline' : 'mail-outline'}
            loading={verifyBusy}
            onPress={codeSent ? onVerify : onSendCode}
          />
          {codeSent ? (
            <Button label="Send a new code" variant="ghost" compact onPress={onSendCode} />
          ) : null}
        </Card>
      ) : null}

      {changing ? (
        <Card style={styles.card}>
          <AppText variant="bodyStrong">Change password</AppText>
          <TextField
            label="Current password"
            value={current}
            onChangeText={setCurrent}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
          />
          <TextField
            label="New password"
            placeholder="At least 8 characters"
            value={next}
            onChangeText={setNext}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
          />
          {pwMessage && !pwMessage.ok ? (
            <AppText variant="caption" color="coralText" accessibilityRole="alert">
              {pwMessage.text}
            </AppText>
          ) : null}
          <Button
            label="Save new password"
            icon="key-outline"
            loading={pwBusy}
            onPress={onChangePassword}
          />
          <Button
            label="Cancel"
            variant="ghost"
            compact
            onPress={() => {
              setChanging(false);
              setPwMessage(null);
            }}
          />
        </Card>
      ) : (
        <ListRow
          icon="key-outline"
          title="Change password"
          subtitle={pwMessage?.ok ? pwMessage.text : 'Signs out your other devices'}
          onPress={() => {
            setPwMessage(null);
            setChanging(true);
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  group: { gap: SPACE.sm },
  card: { gap: SPACE.sm, padding: SPACE.md + 4 },
});
