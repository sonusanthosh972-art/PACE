import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import AuthScreen from '../settings/auth';
import { useAuthStore } from '@/state/authStore';

const mockBack = jest.fn();
jest.mock('expo-router', () => ({
  router: { back: () => mockBack() },
}));

jest.mock('@/data/appDb', () => ({
  getAppDb: jest.fn(async () => ({})),
}));

jest.mock('@/data/profileRepo', () => ({
  getProfile: jest.fn(async () => ({
    monthlySalaryPaise: 5000000,
    payday: 1,
    monthlySavingsGoalPaise: 1000000,
    fixedExpenses: [],
  })),
}));

jest.mock('@/data/settingsRepo', () => ({
  setSetting: jest.fn(async () => undefined),
}));

jest.mock('@/data/transactionsRepo', () => ({
  countTransactions: jest.fn(async () => 5),
}));

const mockSyncNow = jest.fn(async () => ({ syncedTransactions: 0, syncedProfile: false }));
jest.mock('@/services/sync', () => ({
  syncNow: () => mockSyncNow(),
}));

async function renderScreen() {
  return render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 390, height: 844 },
        insets: { top: 0, left: 0, right: 0, bottom: 0 },
      }}
    >
      <QueryClientProvider client={new QueryClient()}>
        <AuthScreen />
      </QueryClientProvider>
    </SafeAreaProvider>,
  );
}

describe('AuthScreen', () => {
  beforeEach(() => {
    mockBack.mockClear();
    mockSyncNow.mockClear();
    useAuthStore.setState({
      isAuthenticated: false,
      user: null,
      syncStatus: 'idle',
      lastSyncedAt: null,
    });
  });

  it('renders sign in mode and validates required fields', async () => {
    const { getByText, getByRole, findByRole } = await renderScreen();

    expect(getByText('Account & Backup')).toBeTruthy();
    expect(getByRole('button', { name: 'Sign In' })).toBeTruthy();

    await fireEvent.press(getByRole('button', { name: 'Sign In' }));
    expect(await findByRole('alert')).toHaveTextContent('Please enter your email address.');
  });

  it('switches to create account mode with name input', async () => {
    const { getByRole, getByLabelText } = await renderScreen();

    const createAccountTab = getByRole('radio', { name: 'Create account' });
    await fireEvent.press(createAccountTab);

    expect(getByLabelText('Name')).toBeTruthy();
    expect(getByRole('button', { name: 'Create Account' })).toBeTruthy();
  });

  it('renders server address configuration and allows testing', async () => {
    const { getByLabelText, getByRole } = await renderScreen();

    const serverInput = getByLabelText('Server URL');
    expect(serverInput).toBeTruthy();

    const testButton = getByRole('button', { name: 'Test connection' });
    expect(testButton).toBeTruthy();
  });

  it('shows logged in state with user details and backup status', async () => {
    useAuthStore.setState({
      isAuthenticated: true,
      user: {
        id: 'u1',
        email: 'alice@example.com',
        name: 'Alice',
        salaryPaise: 5000000,
        payday: 1,
        savingsGoalPaise: 1000000,
        timezone: 'Asia/Kolkata',
      },
      lastSyncedAt: Date.now() - 120_000, // 2 minutes ago
      syncStatus: 'idle',
    });

    const { getByText } = await renderScreen();

    expect(getByText('Alice')).toBeTruthy();
    expect(getByText('alice@example.com')).toBeTruthy();
    expect(getByText('Backed up 2 min ago')).toBeTruthy();
    expect(getByText('Sign out')).toBeTruthy();
  });
});
