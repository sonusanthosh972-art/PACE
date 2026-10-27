import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import Welcome from '../onboarding/index';

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

  it('starts onboarding from the primary button', async () => {
    await renderWelcome();
    await fireEvent.press(screen.getByRole('button', { name: 'Get started' }));
    expect(mockPush).toHaveBeenCalledWith('/onboarding/salary');
  });

  it('opens sign in from the welcome screen', async () => {
    await renderWelcome();
    await fireEvent.press(screen.getByRole('button', { name: 'Sign in / Sign up' }));
    expect(mockPush).toHaveBeenCalledWith('/settings/auth');
  });
});
