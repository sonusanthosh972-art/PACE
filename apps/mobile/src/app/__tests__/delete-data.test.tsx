import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import DeleteData from '../settings/delete-data';

const mockDeleteAll = jest.fn<Promise<void>, []>(() => Promise.resolve());
const mockReplace = jest.fn();

jest.mock('@/services/actions', () => ({ deleteAllData: () => mockDeleteAll() }));
jest.mock('expo-router', () => ({
  router: { replace: (...a: unknown[]) => mockReplace(...a), dismissAll: jest.fn() },
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
        <DeleteData />
      </QueryClientProvider>
    </SafeAreaProvider>,
  );
}

describe('Delete all my data', () => {
  beforeEach(() => {
    mockDeleteAll.mockClear();
    mockReplace.mockClear();
  });

  it('stays disabled until DELETE is typed, then wipes and returns to onboarding', async () => {
    await renderScreen();
    const button = screen.getByRole('button', { name: 'Delete everything' });
    expect(button).toBeDisabled();

    await fireEvent.changeText(screen.getByLabelText('Type DELETE to confirm'), 'delete');
    expect(button).toBeEnabled();

    await fireEvent.press(button);
    expect(mockDeleteAll).toHaveBeenCalledTimes(1);
    expect(mockReplace).toHaveBeenCalledWith('/onboarding');
  }, 15000);

  it('shows an error and keeps the data when the server delete fails', async () => {
    mockDeleteAll.mockRejectedValueOnce(new Error('offline'));
    await renderScreen();
    await fireEvent.changeText(screen.getByLabelText('Type DELETE to confirm'), 'DELETE');
    await fireEvent.press(screen.getByRole('button', { name: 'Delete everything' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/nothing was deleted/);
    expect(mockReplace).not.toHaveBeenCalled();
  });
});
