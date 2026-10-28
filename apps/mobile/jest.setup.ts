// Reanimated/Worklets test mode: animations run synchronously on the JS thread.
import { setUpTests } from 'react-native-reanimated';

setUpTests();

try {
  require('@shopify/react-native-skia/jestSetup.js');
} catch {
  // If Skia mock is unavailable, continue
}

const mockSecureStore = new Map<string, string>();
jest.mock('expo-secure-store', () => ({
  isAvailableAsync: jest.fn(async () => true),
  getItemAsync: jest.fn(async (key: string) => mockSecureStore.get(key) ?? null),
  setItemAsync: jest.fn(async (key: string, value: string) => {
    mockSecureStore.set(key, value);
  }),
  deleteItemAsync: jest.fn(async (key: string) => {
    mockSecureStore.delete(key);
  }),
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 1,
}));

jest.mock('@react-native-community/netinfo', () => ({
  addEventListener: jest.fn(() => jest.fn()),
  fetch: jest.fn(async () => ({ isConnected: true, isInternetReachable: true })),
  useNetInfo: jest.fn(() => ({ isConnected: true, isInternetReachable: true })),
}));

jest.mock('expo-local-authentication', () => ({
  hasHardwareAsync: jest.fn(async () => true),
  isEnrolledAsync: jest.fn(async () => true),
  supportedAuthenticationTypesAsync: jest.fn(async () => [1]),
  authenticateAsync: jest.fn(async () => ({ success: true })),
  getEnrolledLevelAsync: jest.fn(async () => 3),
  SecurityLevel: { NONE: 0, SECRET: 1, BIOMETRIC_WEAK: 2, BIOMETRIC_STRONG: 3 },
  AuthenticationType: {
    FINGERPRINT: 1,
    FACIAL_RECOGNITION: 2,
    IRIS: 3,
  },
}));

jest.mock('react-native-webview', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    WebView: (props: unknown) =>
      React.createElement(View, { testID: 'pace-logo-webview', ...(props as object) }),
  };
});
