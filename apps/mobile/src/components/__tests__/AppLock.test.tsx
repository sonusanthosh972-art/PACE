import { act, fireEvent, render } from '@testing-library/react-native';
import * as LocalAuthentication from 'expo-local-authentication';

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

  it('renders lock screen with Fingerprint as Option 1 and Normal Login as Option 2', async () => {
    const { getByRole, getByText } = await render(<AppLock onboardingComplete={true} />);

    expect(getByRole('header', { name: 'Paisa Pulse' })).toBeTruthy();
    expect(getByText('Your financial data is locked. Authenticate to continue.')).toBeTruthy();

    // Option 1: Fingerprint
    expect(getByRole('button', { name: 'Unlock with Fingerprint' })).toBeTruthy();

    // Option 2: Normal Login
    expect(getByRole('button', { name: 'Normal Login' })).toBeTruthy();
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

    // Press Normal Login
    const normalLoginBtn = getByRole('button', { name: 'Normal Login' });
    await fireEvent.press(normalLoginBtn);

    expect(getByText('Sign In with Password')).toBeTruthy();

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
    const { getByRole, getByText } = await render(<AppLock onboardingComplete={true} />);

    await fireEvent.press(getByRole('button', { name: 'Normal Login' }));
    expect(getByText('Sign In with Password')).toBeTruthy();

    const backButton = getByRole('button', { name: 'Back to Fingerprint' });
    await fireEvent.press(backButton);

    expect(getByRole('button', { name: 'Unlock with Fingerprint' })).toBeTruthy();
    expect(getByRole('button', { name: 'Normal Login' })).toBeTruthy();
  });
});
