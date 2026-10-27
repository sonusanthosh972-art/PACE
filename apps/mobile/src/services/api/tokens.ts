import * as SecureStore from 'expo-secure-store';

const ACCESS_TOKEN_KEY = 'paisapulse_access_token';
const REFRESH_TOKEN_KEY = 'paisapulse_refresh_token';

// In-memory fallback if SecureStore is unavailable in a runtime environment
const memoryFallback = new Map<string, string>();

async function isSecureStoreAvailable(): Promise<boolean> {
  try {
    return await SecureStore.isAvailableAsync();
  } catch {
    return false;
  }
}

export async function saveTokens(accessToken: string, refreshToken: string): Promise<void> {
  if (await isSecureStoreAvailable()) {
    await SecureStore.setItemAsync(ACCESS_TOKEN_KEY, accessToken, {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
    await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, refreshToken, {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
  } else {
    memoryFallback.set(ACCESS_TOKEN_KEY, accessToken);
    memoryFallback.set(REFRESH_TOKEN_KEY, refreshToken);
  }
}

export async function getAccessToken(): Promise<string | null> {
  if (await isSecureStoreAvailable()) {
    return await SecureStore.getItemAsync(ACCESS_TOKEN_KEY);
  }
  return memoryFallback.get(ACCESS_TOKEN_KEY) ?? null;
}

export async function getRefreshToken(): Promise<string | null> {
  if (await isSecureStoreAvailable()) {
    return await SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
  }
  return memoryFallback.get(REFRESH_TOKEN_KEY) ?? null;
}

export async function clearTokens(): Promise<void> {
  if (await isSecureStoreAvailable()) {
    await SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY).catch(() => undefined);
    await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY).catch(() => undefined);
  }
  memoryFallback.delete(ACCESS_TOKEN_KEY);
  memoryFallback.delete(REFRESH_TOKEN_KEY);
}

export async function hasTokens(): Promise<boolean> {
  const token = await getAccessToken();
  return token !== null && token.length > 0;
}
