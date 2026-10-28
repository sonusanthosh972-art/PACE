import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';

/** Older versions saved the email + password here; it is deleted on start and never written. */
const LEGACY_CREDENTIALS_KEY = 'paisapulse_biometric_creds';
const BIOMETRIC_ENABLED_KEY = 'paisapulse_biometric_enabled';
const LAST_EMAIL_KEY = 'paisapulse_last_email';

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
  /** The phone has a screen lock (PIN, pattern, password or biometrics) the app can ask for. */
  deviceSecure: boolean;
  supportedTypes: LocalAuthentication.AuthenticationType[];
  biometryName: string;
}

/**
 * Checks whether the device supports biometric authentication (fingerprint/face), whether one is
 * enrolled, and whether the phone has any screen lock at all (enough to unlock with the PIN).
 */
export async function checkBiometrics(): Promise<BiometricStatus> {
  try {
    const hasHardware = await LocalAuthentication.hasHardwareAsync();
    const isEnrolled = hasHardware ? await LocalAuthentication.isEnrolledAsync() : false;
    const supportedTypes = hasHardware
      ? await LocalAuthentication.supportedAuthenticationTypesAsync()
      : [];
    const level = await LocalAuthentication.getEnrolledLevelAsync();

    let biometryName = 'Biometrics';
    if (supportedTypes.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) {
      biometryName = 'Fingerprint';
    } else if (supportedTypes.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) {
      biometryName = 'Face Unlock';
    }

    return {
      hasHardware,
      isEnrolled,
      deviceSecure: level !== LocalAuthentication.SecurityLevel.NONE,
      supportedTypes,
      biometryName,
    };
  } catch {
    return {
      hasHardware: false,
      isEnrolled: false,
      deviceSecure: false,
      supportedTypes: [],
      biometryName: 'Biometrics',
    };
  }
}

/**
 * Asks the phone to confirm it is the owner: fingerprint/face when enrolled, otherwise (or as the
 * fallback) the phone's own PIN, pattern or password. False when the phone has no screen lock.
 */
export async function authenticateWithBiometrics(
  promptMessage = 'Unlock Paisa Pulse',
): Promise<boolean> {
  try {
    const status = await checkBiometrics();
    if (!status.deviceSecure) return false;

    const result = await LocalAuthentication.authenticateAsync({
      promptMessage,
      cancelLabel: 'Cancel',
      fallbackLabel: 'Use phone PIN',
      disableDeviceFallback: false,
    });

    return result.success;
  } catch {
    return false;
  }
}

/**
 * Whether the app lock is on. Unset means on when the phone has a screen lock to unlock with.
 */
export async function isBiometricEnabled(): Promise<boolean> {
  const enabled = await getSecureItem(BIOMETRIC_ENABLED_KEY);
  if (enabled === 'false') return false;
  const status = await checkBiometrics();
  if (!status.deviceSecure) return false; // nothing to unlock with: never lock the user out
  return true;
}

/** Turns the app lock on or off. */
export async function setBiometricEnabled(enabled: boolean): Promise<void> {
  await setSecureItem(BIOMETRIC_ENABLED_KEY, enabled ? 'true' : 'false');
}

/** Deletes the email + password that older versions stored for fingerprint sign-in. */
export async function purgeLegacyCredentials(): Promise<void> {
  await deleteSecureItem(LEGACY_CREDENTIALS_KEY);
}

/** Remembers the last signed-in email so sign-in forms can be prefilled (never the password). */
export async function rememberEmail(email: string): Promise<void> {
  await setSecureItem(LAST_EMAIL_KEY, email);
}

export async function getRememberedEmail(): Promise<string | null> {
  return getSecureItem(LAST_EMAIL_KEY);
}
