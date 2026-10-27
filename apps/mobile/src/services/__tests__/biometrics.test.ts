import * as LocalAuthentication from 'expo-local-authentication';

import {
  authenticateWithBiometrics,
  checkBiometrics,
  getBiometricCredentials,
  isBiometricEnabled,
  saveBiometricCredentials,
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

  it('saves and retrieves biometric credentials securely', async () => {
    await saveBiometricCredentials('user@example.com', 'mypassword');
    expect(await isBiometricEnabled()).toBe(true);

    const creds = await getBiometricCredentials();
    expect(creds).toEqual({
      email: 'user@example.com',
      password: 'mypassword',
    });
  });

  it('clears credentials when disabled', async () => {
    await saveBiometricCredentials('user@example.com', 'mypassword');
    expect(await isBiometricEnabled()).toBe(true);

    await setBiometricEnabled(false);
    expect(await isBiometricEnabled()).toBe(false);
    expect(await getBiometricCredentials()).toBeNull();
  });
});
