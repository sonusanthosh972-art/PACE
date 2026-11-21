import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { Alert } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import type { BudgetProfile, BudgetSnapshot } from '@/domain/budget';
import AffordScreen from '../afford';

const mockProfile: BudgetProfile = {
  monthlySalaryPaise: 8000000,
  payday: 1,
  fixedExpenses: [{ id: 'rent', name: 'Rent', amountPaise: 2500000, dueDay: 5 }],
  monthlySavingsGoalPaise: 1500000,
};

const mockSnapshot: BudgetSnapshot = {
  cycle: { start: '2026-10-01', end: '2026-10-31', totalDays: 31 },
  daysLeft: 16,
  spendablePaise: 4000000,
  spentBeforeTodayPaise: 1000000,
  spentTodayPaise: 0,
  todayBudgetPaise: 187500,
  remainingTodayPaise: 187500,
  nextDaysAveragePaise: 187500,
  usedRatio: 0,
};

const mockAddManual = jest.fn().mockResolvedValue({ id: 'tx_123' });
const mockBack = jest.fn();
const mockReplace = jest.fn();

jest.mock('@/services/actions', () => ({
  addManualTransaction: (...args: unknown[]) => mockAddManual(...args),
}));

jest.mock('expo-router', () => ({
  router: {
    back: () => mockBack(),
    replace: (...args: unknown[]) => mockReplace(...args),
  },
}));

jest.mock('@/state/queries', () => ({
  useProfile: () => ({
    data: mockProfile,
    isPending: false,
    isError: false,
    refetch: jest.fn(),
  }),
  useToday: () => ({
    data: {
      snapshot: mockSnapshot,
      today: '2026-10-15',
      streak: 5,
      transactions: [],
      yesterday: null,
    },
    isPending: false,
    isError: false,
    refetch: jest.fn(),
  }),
  invalidateAll: jest.fn().mockResolvedValue(undefined),
}));

function renderScreen() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 390, height: 844 },
        insets: { top: 0, left: 0, right: 0, bottom: 0 },
      }}
    >
      <QueryClientProvider client={queryClient}>
        <AffordScreen />
      </QueryClientProvider>
    </SafeAreaProvider>,
  );
}

describe('AffordScreen UI', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders header, guidance card, and presets initially', async () => {
    await renderScreen();
    expect(screen.getByText('Can I Afford This?')).toBeTruthy();
    expect(screen.getByText('How simulation protects your money')).toBeTruthy();
    expect(screen.getByText('₹500')).toBeTruthy();
    expect(screen.getByText('₹1,500')).toBeTruthy();
  });

  it('calculates SAFE outcome when a preset amount is selected', async () => {
    await renderScreen();
    const preset500 = screen.getByRole('button', { name: 'Set amount to ₹500' });
    await fireEvent.press(preset500);

    expect(screen.getByText('Fits your plan')).toBeTruthy();
    expect(screen.getByText('Comfortably Affordable')).toBeTruthy();
    expect(screen.getByText('Bills Protected')).toBeTruthy();
  });

  it('switches between Single Purchase and Compare Options tabs', async () => {
    await renderScreen();
    const compareTab = screen.getByRole('tab', { name: 'Compare multiple amounts' });
    await fireEvent.press(compareTab);

    expect(screen.getByText('Compare 3 Purchase Options')).toBeTruthy();
    expect(screen.getByText('Option A (e.g. Budget pick)')).toBeTruthy();

    const singleTab = screen.getByRole('tab', { name: 'Single purchase simulation' });
    await fireEvent.press(singleTab);
    expect(screen.getByText('Purchase amount')).toBeTruthy();
  });

  it('confirms a purchase and triggers addManualTransaction with idempotent client ID', async () => {
    jest.spyOn(Alert, 'alert');
    await renderScreen();

    // Select ₹1,500
    const preset1500 = screen.getByRole('button', { name: 'Set amount to ₹1,500' });
    await fireEvent.press(preset1500);

    // Confirm button
    const confirmButton = screen.getByRole('button', { name: /Confirm & Record/ });
    await fireEvent.press(confirmButton);

    expect(mockAddManual).toHaveBeenCalledTimes(1);
    const calledArgs = mockAddManual.mock.calls[0]?.[0];
    expect(calledArgs.amountPaise).toBe(150000);
    expect(calledArgs.id).toMatch(/^sim_purchase_/);
    expect(Alert.alert).toHaveBeenCalledWith(
      'Purchase Recorded',
      expect.stringContaining('₹1,500'),
      expect.any(Array),
    );
  });
});
