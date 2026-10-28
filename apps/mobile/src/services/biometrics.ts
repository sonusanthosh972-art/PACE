import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';

const BIOMETRIC_CREDENTIALS_KEY = 'paisapulse_biometric_creds';
const BIOMETRIC_ENABLED_KEY = 'paisapulse_biometric_enabled';

// In-memory fallback if SecureStore is unavailable in a test environment
const memoryFallback = new Map<string, string>();

async function isSecureStoreAvailable(): Promise<boolean> {
  try {
    return await SecureStore.isAvailableAsync();
  } catch {
    return false;
  }
}

async function getSecureItem(key: string): Promise<string | null> {
  if (await isSecureStoreAvailable()) {
    return SecureStore.getItemAsync(key);
  }
  return memoryFallback.get(key) ?? null;
}

async function setSecureItem(key: string, value: string): Promise<void> {
  if (await isSecureStoreAvailable()) {
    await SecureStore.setItemAsync(key, value, {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
  } else {
    memoryFallback.set(key, value);
  }
}

async function deleteSecureItem(key: string): Promise<void> {
  if (await isSecureStoreAvailable()) {
    await SecureStore.deleteItemAsync(key).catch(() => undefined);
  }
  memoryFallback.delete(key);
}

export interface BiometricStatus {
  hasHardware: boolean;
  isEnrolled: boolean;
  supportedTypes: LocalAuthentication.AuthenticationType[];
  biometryName: string;
}

/**
 * Checks whether the device hardware supports biometric authentication (fingerprint/face)
 * and whether the user has at least one biometric enrolled.
 */
export async function checkBiometrics(): Promise<BiometricStatus> {
  try {
    const hasHardware = await LocalAuthentication.hasHardwareAsync();
    const isEnrolled = hasHardware ? await LocalAuthentication.isEnrolledAsync() : false;
    const supportedTypes = hasHardware
      ? await LocalAuthentication.supportedAuthenticationTypesAsync()
      : [];

    let biometryName = 'Biometrics';
    if (supportedTypes.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) {
      biometryName = 'Fingerprint';
    } else if (supportedTypes.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) {
      biometryName = 'Face Unlock';
    }

    return {
      hasHardware,
      isEnrolled,
      supportedTypes,
      biometryName,
    };
  } catch {
    return {
      hasHardware: false,
      isEnrolled: false,
      supportedTypes: [],
      biometryName: 'Biometrics',
    };
  }
}

/**
 * Prompts the native Android/iOS biometric prompt.
 */
export async function authenticateWithBiometrics(
  promptMessage = 'Unlock Paisa Pulse',
): Promise<boolean> {
  try {
    const status = await checkBiometrics();
    if (!status.hasHardware || !status.isEnrolled) return false;

    const result = await LocalAuthentication.authenticateAsync({
      promptMessage,
      cancelLabel: 'Cancel',
      fallbackLabel: 'Use password',
      disableDeviceFallback: false,
    });

    return result.success;
  } catch {
    return false;
  }
}

/**
 * Saves encrypted user credentials for instant biometric sign-in.
 */
export async function saveBiometricCredentials(email: string, password: string): Promise<void> {
  await setSecureItem(BIOMETRIC_CREDENTIALS_KEY, JSON.stringify({ email, password }));
  await setSecureItem(BIOMETRIC_ENABLED_KEY, 'true');
}

/**
 * Retrieves the stored credentials if biometric sign-in is enabled.
 */
export async function getBiometricCredentials(): Promise<{
  email: string;
  password: string;
} | null> {
  const enabled = await getSecureItem(BIOMETRIC_ENABLED_KEY);
  if (enabled !== 'true') return null;
  const raw = await getSecureItem(BIOMETRIC_CREDENTIALS_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Returns whether biometric quick-unlock is enabled.
 */
export async function isBiometricEnabled(): Promise<boolean> {
  const enabled = await getSecureItem(BIOMETRIC_ENABLED_KEY);
  if (enabled === 'false') return false;
  if (enabled === 'true') return true;
  const status = await checkBiometrics();
  return status.hasHardware && status.isEnrolled;
}

/**
 * Toggles biometric unlock.
 */
export async function setBiometricEnabled(enabled: boolean): Promise<void> {
  if (!enabled) {
    await deleteSecureItem(BIOMETRIC_CREDENTIALS_KEY);
    await setSecureItem(BIOMETRIC_ENABLED_KEY, 'false');
  } else {
    await setSecureItem(BIOMETRIC_ENABLED_KEY, 'true');
  }
}
