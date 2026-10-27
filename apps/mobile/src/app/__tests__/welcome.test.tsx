import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import Welcome from '../onboarding/index';
import { useAuthStore } from '@/state/authStore';

// Skia's Jest mock has no font support; the logo is native graphics, so stand it in.
jest.mock('@/components/brand/PaceLogo', () => {
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    PaceLogo: () => <View accessible accessibilityRole="image" accessibilityLabel="Paisa Pulse" />,
  };
});

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  router: { push: (...a: unknown[]) => mockPush(...a), replace: jest.fn() },
}));

function renderWelcome() {
  return render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 390, height: 844 },
        insets: { top: 0, left: 0, right: 0, bottom: 0 },
      }}
    >
      <QueryClientProvider client={new QueryClient()}>
        <Welcome />
      </QueryClientProvider>
    </SafeAreaProvider>,
  );
}

describe('Welcome (landing)', () => {
  it('shows the brand mark, one clear promise and an honest privacy line', async () => {
    await renderWelcome();
    expect(screen.getByRole('image', { name: 'Paisa Pulse' })).toBeOnTheScreen();
    expect(
      screen.getByRole('header', { name: 'Know exactly what you can spend today.' }),
    ).toBeOnTheScreen();
    expect(
      screen.getByText('Only bank messages are read. Message text never leaves your phone.'),
    ).toBeOnTheScreen();
    expect(screen.getByLabelText('Example: ₹1,279 left today of ₹1,579')).toBeOnTheScreen();
  });

  it('starts with account creation as the primary step', async () => {
    await renderWelcome();
    await fireEvent.press(screen.getByRole('button', { name: 'Create account' }));
    expect(mockPush).toHaveBeenCalledWith('/settings/auth?mode=register');
  });

  it('opens sign in from the welcome screen', async () => {
    await renderWelcome();
    await fireEvent.press(screen.getByRole('button', { name: 'Sign in' }));
    expect(mockPush).toHaveBeenCalledWith('/settings/auth?mode=login');
  });

  it('offers a no-account setup and a clearly optional sample tour', async () => {
    await renderWelcome();
    await fireEvent.press(screen.getByRole('button', { name: 'Use without account' }));
    expect(mockPush).toHaveBeenCalledWith('/onboarding/salary');
    expect(screen.getByRole('button', { name: 'Try sample data' })).toBeOnTheScreen();
  });

  it('never offers sample data once signed in', async () => {
    useAuthStore.setState({ isAuthenticated: true });
    try {
      await renderWelcome();
      // Let the biometrics check on mount settle before asserting.
      await act(async () => {
        await new Promise((r) => setTimeout(r, 0));
      });
      expect(screen.queryByRole('button', { name: 'Try sample data' })).toBeNull();
      await fireEvent.press(screen.getByRole('button', { name: 'Continue setup' }));
      expect(mockPush).toHaveBeenCalledWith('/onboarding/salary');
    } finally {
      screen.unmount();
      useAuthStore.setState({ isAuthenticated: false });
    }
  });
});
