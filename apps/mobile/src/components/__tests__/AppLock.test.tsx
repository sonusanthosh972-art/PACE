import { act, fireEvent, render } from '@testing-library/react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import { AppState, type AppStateStatus } from 'react-native';

import { AppLock } from '../AppLock';
import { useAuthStore } from '@/state/authStore';
import { useLockStore } from '@/state/lockStore';

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn() },
}));

describe('AppLock component', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useLockStore.setState({ isLocked: true });
    useAuthStore.setState({
      isAuthenticated: false,
      user: null,
    });
  });

  it('renders nothing when onboarding is not complete', async () => {
    const { queryByText } = await render(<AppLock onboardingComplete={false} />);
    expect(queryByText('Paisa Pulse')).toBeNull();
  });

  it('renders nothing when already unlocked', async () => {
    useLockStore.setState({ isLocked: false });
    const { queryByText } = await render(<AppLock onboardingComplete={true} />);
    expect(queryByText('Paisa Pulse')).toBeNull();
  });

  it('renders lock screen with Fingerprint and account password option for signed-in user', async () => {
    useAuthStore.setState({
      isAuthenticated: true,
      user: {
        id: 'u1',
        email: 'sonu@example.com',
        name: 'Sonu',
        salaryPaise: 5000000,
        payday: 1,
        savingsGoalPaise: 1000000,
        timezone: 'Asia/Kolkata',
      },
    });
    const { getByRole, getByText } = await render(<AppLock onboardingComplete={true} />);

    expect(getByRole('header', { name: 'Paisa Pulse' })).toBeTruthy();
    expect(getByText('Your financial data is locked. Authenticate to continue.')).toBeTruthy();

    // Option 1: Fingerprint
    expect(getByRole('button', { name: 'Unlock with Fingerprint' })).toBeTruthy();

    // Option 2: Account Password
    expect(getByRole('button', { name: 'Use account password' })).toBeTruthy();
  });

  it('unlocks when biometric authentication succeeds', async () => {
    const { getByRole } = await render(<AppLock onboardingComplete={true} />);

    const bioButton = getByRole('button', { name: 'Unlock with Fingerprint' });
    await act(async () => {
      await fireEvent.press(bioButton);
    });

    expect(LocalAuthentication.authenticateAsync).toHaveBeenCalled();
    expect(useLockStore.getState().isLocked).toBe(false);
  });

  it('switches to normal login and allows unlocking with password', async () => {
    useAuthStore.setState({
      isAuthenticated: true,
      user: {
        id: 'u1',
        email: 'sonu@example.com',
        name: 'Sonu',
        salaryPaise: 5000000,
        payday: 1,
        savingsGoalPaise: 1000000,
        timezone: 'Asia/Kolkata',
      },
      login: jest.fn(async () => ({
        accessToken: 'tok',
        refreshToken: 'ref',
        user: {
          id: 'u1',
          email: 'sonu@example.com',
          name: 'Sonu',
          salaryPaise: 5000000,
          payday: 1,
          savingsGoalPaise: 1000000,
          timezone: 'Asia/Kolkata',
        },
      })),
    });

    const { getByRole, getByText, getByPlaceholderText } = await render(
      <AppLock onboardingComplete={true} />,
    );

    // Press Use account password
    const passwordLoginBtn = getByRole('button', { name: 'Use account password' });
    await fireEvent.press(passwordLoginBtn);

    expect(getByText('Unlock with account password')).toBeTruthy();

    const passwordInput = getByPlaceholderText('••••••••');
    await fireEvent.changeText(passwordInput, 'validpassword');

    const unlockBtn = getByRole('button', { name: 'Unlock' });
    await act(async () => {
      await fireEvent.press(unlockBtn);
    });

    expect(useAuthStore.getState().login).toHaveBeenCalledWith('sonu@example.com', 'validpassword');
    expect(useLockStore.getState().isLocked).toBe(false);
  });

  it('allows switching back to Fingerprint from normal login', async () => {
    useAuthStore.setState({
      isAuthenticated: true,
      user: {
        id: 'u1',
        email: 'sonu@example.com',
        name: 'Sonu',
        salaryPaise: 5000000,
        payday: 1,
        savingsGoalPaise: 1000000,
        timezone: 'Asia/Kolkata',
      },
    });
    const { getByRole, getByText } = await render(<AppLock onboardingComplete={true} />);

    await fireEvent.press(getByRole('button', { name: 'Use account password' }));
    expect(getByText('Unlock with account password')).toBeTruthy();

    const backButton = getByRole('button', { name: 'Back to Fingerprint' });
    await fireEvent.press(backButton);

    expect(getByRole('button', { name: 'Unlock with Fingerprint' })).toBeTruthy();
    expect(getByRole('button', { name: 'Use account password' })).toBeTruthy();
  });

  it('waits for the splash to finish before showing the fingerprint prompt', async () => {
    const { getByRole, rerender } = await render(
      <AppLock onboardingComplete={true} canPrompt={false} />,
    );
    // The lock is already covering the app under the splash…
    expect(getByRole('header', { name: 'Paisa Pulse' })).toBeTruthy();
    await act(async () => {
      await new Promise((r) => setTimeout(r, 450));
    });
    expect(LocalAuthentication.authenticateAsync).not.toHaveBeenCalled();

    // …and prompts once the splash is gone.
    await rerender(<AppLock onboardingComplete={true} canPrompt={true} />);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 450));
    });
    expect(LocalAuthentication.authenticateAsync).toHaveBeenCalledTimes(1);
  });

  it('covers the app as soon as it goes to the background, so returning never shows it', async () => {
    let onChange: ((s: AppStateStatus) => void) | null = null;
    const spy = jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, handler) => {
      onChange = handler as (s: AppStateStatus) => void;
      return { remove: jest.fn() } as unknown as ReturnType<typeof AppState.addEventListener>;
    });
    try {
      const { getByRole, queryByTestId } = await render(<AppLock onboardingComplete={true} />);
      await act(async () => {
        await fireEvent.press(getByRole('button', { name: 'Unlock with Fingerprint' }));
      });
      expect(useLockStore.getState().isLocked).toBe(false);
      expect(queryByTestId('app-lock-cover')).toBeNull();

      await act(async () => onChange?.('background'));
      expect(queryByTestId('app-lock-cover')).toBeTruthy();

      // Back within the re-lock time: the cover simply goes away.
      await act(async () => onChange?.('active'));
      expect(queryByTestId('app-lock-cover')).toBeNull();
      expect(useLockStore.getState().isLocked).toBe(false);
    } finally {
      spy.mockRestore();
    }
  });
});
