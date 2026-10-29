import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import ExitSample from '../settings/exit-sample';

const mockExit = jest.fn<Promise<void>, []>(() => Promise.resolve());
const mockReplace = jest.fn();

jest.mock('@/services/actions', () => ({ exitSampleData: () => mockExit() }));
jest.mock('expo-router', () => ({
  router: {
    replace: (...a: unknown[]) => mockReplace(...a),
    dismissAll: jest.fn(),
    canDismiss: jest.fn(() => false),
  },
}));

function renderScreen() {
  return render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 390, height: 844 },
        insets: { top: 0, left: 0, right: 0, bottom: 0 },
      }}
    >
      <QueryClientProvider client={new QueryClient()}>
        <ExitSample />
      </QueryClientProvider>
    </SafeAreaProvider>,
  );
}

describe('Use my real data', () => {
  beforeEach(() => {
    mockExit.mockClear();
    mockReplace.mockClear();
  });

  it('removes the sample data and restarts onboarding', async () => {
    await renderScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Remove sample data' }));
    expect(mockExit).toHaveBeenCalledTimes(1);
    expect(mockReplace).toHaveBeenCalledWith('/onboarding');
  }, 15000);

  it('stays on the screen and explains when removal fails', async () => {
    mockExit.mockRejectedValueOnce(new Error('db'));
    await renderScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Remove sample data' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/Could not remove/);
    expect(mockReplace).not.toHaveBeenCalled();
  });
});
