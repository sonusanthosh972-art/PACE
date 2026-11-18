import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { morningCard, nightCard } from '@/domain/dayCards';
import { useLockStore } from '@/state/lockStore';
import { useSplash } from '@/state/splashStore';

import { DayCardHost, DayCardModal } from '../DayCard';

const mockPath = { value: '/' };
jest.mock('expo-router', () => ({ usePathname: () => mockPath.value }));

const mockClaim = jest.fn();
jest.mock('@/services/dayCards', () => ({
  claimDueCard: (...args: unknown[]) => mockClaim(...args),
}));
jest.mock('@/data/appDb', () => ({ getAppDb: jest.fn().mockResolvedValue({}) }));
// Reduce Motion: amounts show at once (no count-up finishing after the test ends).
jest.mock('@/theme/ThemeProvider', () => {
  const { COLORS } = jest.requireActual<typeof import('@/theme/tokens')>('@/theme/tokens');
  return { useTheme: () => ({ colors: COLORS, reducedMotion: true }) };
});
jest.mock('@/state/queries', () => ({
  useSettings: () => ({
    data: { onboardingComplete: true, nightTime: { hour: 21, minute: 0 } },
  }),
}));

const MORNING = morningCard({
  now: Date.UTC(2026, 10, 16, 3, 0),
  todayAllowancePaise: 450_00,
  yesterday: { budgetPaise: 400_00, spentPaise: 250_00 },
  newCycle: false,
  daysLeft: 12,
});

beforeEach(() => {
  mockPath.value = '/';
  // Like the real service: the card is claimed once, later checks find nothing due.
  mockClaim.mockReset().mockResolvedValueOnce(MORNING).mockResolvedValue(null);
  useSplash.setState({ dismissed: true });
  useLockStore.setState({ isLocked: false });
});

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe('DayCardModal', () => {
  it('shows the headline, the amount, the numbers and a clear Continue button', async () => {
    const onClose = jest.fn();
    await render(<DayCardModal card={MORNING} visible onClose={onClose} />);
    expect(screen.getByRole('header', { name: 'You did great yesterday! 🎉' })).toBeOnTheScreen();
    expect(screen.getByText('Safe to spend today')).toBeOnTheScreen();
    expect(screen.getByLabelText("Yesterday's allowance: ₹400")).toBeOnTheScreen();
    fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
    expect(onClose).toHaveBeenCalled();
  });

  it('labels the night card with Got it', async () => {
    const card = nightCard({
      budgetPaise: 500_00,
      spentPaise: 320_00,
      nextDaysAveragePaise: 520_00,
    });
    await render(<DayCardModal card={card} visible onClose={jest.fn()} />);
    expect(screen.getByRole('button', { name: 'Got it' })).toBeOnTheScreen();
    expect(screen.getByLabelText('Spent today: ₹320')).toBeOnTheScreen();
  });
});

describe('DayCardHost', () => {
  it('pops the due card up on a main tab, and closes it', async () => {
    await render(<DayCardHost />);
    await flush();
    expect(mockClaim).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('day-card-morning')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
    await flush();
    expect(screen.queryByTestId('day-card-morning')).toBeNull();
  });

  it('never interrupts adding a payment; shows once the user is back on a tab', async () => {
    mockPath.value = '/add';
    const view = await render(<DayCardHost />);
    await flush();
    expect(mockClaim).not.toHaveBeenCalled();

    mockPath.value = '/';
    await view.rerender(<DayCardHost />);
    await flush();
    expect(mockClaim).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('day-card-morning')).toBeOnTheScreen();
  });

  it('waits while the app is locked or the splash is up', async () => {
    useLockStore.setState({ isLocked: true });
    await render(<DayCardHost />);
    await flush();
    expect(mockClaim).not.toHaveBeenCalled();

    await act(async () => useLockStore.setState({ isLocked: false }));
    await flush();
    expect(mockClaim).toHaveBeenCalledTimes(1);
  });

  it('hides a shown card if the app locks, and brings it back after unlocking', async () => {
    await render(<DayCardHost />);
    await flush();
    expect(screen.getByTestId('day-card-morning')).toBeOnTheScreen();
    await act(async () => useLockStore.setState({ isLocked: true }));
    expect(screen.queryByTestId('day-card-morning')).toBeNull();
    await act(async () => useLockStore.setState({ isLocked: false }));
    expect(screen.getByTestId('day-card-morning')).toBeOnTheScreen();
  });

  it('shows nothing when no card is due', async () => {
    mockClaim.mockReset().mockResolvedValue(null);
    await render(<DayCardHost />);
    await flush();
    expect(screen.queryByTestId('day-card-morning')).toBeNull();
  });
});
