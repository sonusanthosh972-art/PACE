import * as LocalAuthentication from 'expo-local-authentication';

import * as SecureStore from 'expo-secure-store';

import {
  authenticateWithBiometrics,
  checkBiometrics,
  getRememberedEmail,
  isBiometricEnabled,
  purgeLegacyCredentials,
  rememberEmail,
  setBiometricEnabled,
} from '../biometrics';

describe('biometrics service', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await setBiometricEnabled(false);
  });

  it('checks hardware support and enrollment', async () => {
    const status = await checkBiometrics();
    expect(status.hasHardware).toBe(true);
    expect(status.isEnrolled).toBe(true);
    expect(status.biometryName).toBe('Fingerprint');
  });

  it('authenticates with biometrics successfully', async () => {
    const success = await authenticateWithBiometrics();
    expect(success).toBe(true);
    expect(LocalAuthentication.authenticateAsync).toHaveBeenCalled();
  });

  it('handles hardware absence gracefully', async () => {
    (LocalAuthentication.hasHardwareAsync as jest.Mock).mockResolvedValueOnce(false);
    const status = await checkBiometrics();
    expect(status.hasHardware).toBe(false);
    expect(status.isEnrolled).toBe(false);

    (LocalAuthentication.hasHardwareAsync as jest.Mock).mockResolvedValueOnce(false);
    const authed = await authenticateWithBiometrics();
    expect(authed).toBe(false);
  });

  it('unlocks with the phone PIN when no fingerprint is enrolled', async () => {
    (LocalAuthentication.isEnrolledAsync as jest.Mock).mockResolvedValue(false);
    (LocalAuthentication.getEnrolledLevelAsync as jest.Mock).mockResolvedValue(1); // SECRET
    try {
      expect((await checkBiometrics()).deviceSecure).toBe(true);
      expect(await authenticateWithBiometrics()).toBe(true);
      expect(LocalAuthentication.authenticateAsync).toHaveBeenCalledWith(
        expect.objectContaining({ disableDeviceFallback: false }),
      );
    } finally {
      (LocalAuthentication.isEnrolledAsync as jest.Mock).mockResolvedValue(true);
      (LocalAuthentication.getEnrolledLevelAsync as jest.Mock).mockResolvedValue(3);
    }
  });

  it('never locks when the phone has no screen lock', async () => {
    (LocalAuthentication.getEnrolledLevelAsync as jest.Mock).mockResolvedValue(0); // NONE
    try {
      await setBiometricEnabled(true);
      expect(await isBiometricEnabled()).toBe(false);
      expect(await authenticateWithBiometrics()).toBe(false);
    } finally {
      (LocalAuthentication.getEnrolledLevelAsync as jest.Mock).mockResolvedValue(3);
    }
  });

  it('turns the app lock on and off', async () => {
    await setBiometricEnabled(true);
    expect(await isBiometricEnabled()).toBe(true);
    await setBiometricEnabled(false);
    expect(await isBiometricEnabled()).toBe(false);
  });

  it('remembers only the email and deletes passwords saved by older versions', async () => {
    await SecureStore.setItemAsync(
      'paisapulse_biometric_creds',
      '{"email":"a@b.c","password":"x"}',
    );
    await purgeLegacyCredentials();
    expect(await SecureStore.getItemAsync('paisapulse_biometric_creds')).toBeNull();

    await rememberEmail('user@example.com');
    expect(await getRememberedEmail()).toBe('user@example.com');
  });
});
