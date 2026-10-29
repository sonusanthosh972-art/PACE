import { create } from 'zustand';

import { getAppDb } from '@/data/appDb';
import { getSettings, setSetting } from '@/data/settingsRepo';
import { apiClient, ApiError, onAuthExpired, setApiBaseUrl } from '@/services/api/client';
import {
  authResponseSchema,
  userProfileSchema,
  type AuthResponse,
  type UserProfile,
} from '@/services/api/schemas';
import { clearTokens, getAccessToken, getRefreshToken, saveTokens } from '@/services/api/tokens';

/** Sign-out never waits long for the server: the phone signs out either way. */
const LOGOUT_TIMEOUT_MS = 5_000;

export type SyncState = 'idle' | 'syncing' | 'offline' | 'retrying' | 'error';

interface AuthState {
  user: UserProfile | null;
  isAuthenticated: boolean;
  isInitialised: boolean;
  syncStatus: SyncState;
  lastSyncedAt: number | null;
  syncError: string | null;
  nextRetrySeconds: number | null;

  init: () => Promise<void>;
  login: (email: string, password: string) => Promise<AuthResponse>;
  register: (email: string, password: string, name: string) => Promise<AuthResponse>;
  logout: () => Promise<void>;
  /** Emails a reset code if the account exists (the answer is the same either way). */
  requestPasswordReset: (email: string) => Promise<void>;
  resetPassword: (email: string, code: string, newPassword: string) => Promise<void>;
  /** Changes the password; other devices are signed out, this one stays signed in. */
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  sendVerificationCode: () => Promise<void>;
  verifyEmail: (code: string) => Promise<void>;
  setUser: (user: UserProfile | null) => void;
  setSyncStatus: (
    status: SyncState,
    error?: string | null,
    nextRetrySeconds?: number | null,
  ) => void;
  setLastSyncedAt: (timestamp: number) => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  isAuthenticated: false,
  isInitialised: false,
  syncStatus: 'idle',
  lastSyncedAt: null,
  syncError: null,
  nextRetrySeconds: null,

  init: async () => {
    try {
      const db = await getAppDb();
      const settings = await getSettings(db);
      if (settings.apiBaseUrl) {
        setApiBaseUrl(settings.apiBaseUrl);
      }

      const token = await getAccessToken();
      if (!token) {
        set({ isAuthenticated: false, user: null, isInitialised: true });
        return;
      }

      // If tokens exist, user is authenticated even offline!
      if (settings.accountEmail) {
        set({
          isAuthenticated: true,
          user: {
            id: 'local',
            email: settings.accountEmail,
            name: settings.accountEmail.split('@')[0] ?? 'User',
            salaryPaise: 0,
            payday: 1,
            savingsGoalPaise: 0,
            timezone: 'Asia/Kolkata',
          },
        });
      } else {
        set({ isAuthenticated: true });
      }

      // Attempt to verify and refresh profile from server
      try {
        const profile = await apiClient('/api/v1/me/profile', {}, userProfileSchema);
        set({
          user: profile,
          isAuthenticated: true,
          isInitialised: true,
          syncStatus: 'idle',
          syncError: null,
        });
        await setSetting(db, 'accountEmail', profile.email);
      } catch (err) {
        // ONLY log out if 401 Unauthorized (server rejected credentials and refresh failed)
        if (err instanceof ApiError && err.statusCode === 401) {
          await clearTokens();
          await setSetting(db, 'accountEmail', null);
          set({
            user: null,
            isAuthenticated: false,
            isInitialised: true,
            syncStatus: 'idle',
            syncError: null,
          });
        } else {
          // If offline / network error, STAY LOGGED IN!
          set({
            isAuthenticated: true,
            isInitialised: true,
            syncStatus: 'offline',
            syncError: 'Waiting for internet',
          });
        }
      }
    } catch {
      set({ isInitialised: true });
    }
  },

  login: async (email: string, password: string) => {
    const res = await apiClient(
      '/api/v1/auth/login',
      {
        method: 'POST',
        body: { email, password },
        skipAuth: true,
      },
      authResponseSchema,
    );

    await saveTokens(res.accessToken, res.refreshToken);
    set({ user: res.user, isAuthenticated: true, syncError: null, syncStatus: 'idle' });

    try {
      const db = await getAppDb();
      await setSetting(db, 'accountEmail', res.user.email);
    } catch {
      // Ignore DB write errors
    }

    return res;
  },

  register: async (email: string, password: string, name: string) => {
    const res = await apiClient(
      '/api/v1/auth/register',
      {
        method: 'POST',
        body: { email, password, name },
        skipAuth: true,
      },
      authResponseSchema,
    );

    await saveTokens(res.accessToken, res.refreshToken);
    set({ user: res.user, isAuthenticated: true, syncError: null, syncStatus: 'idle' });

    try {
      const db = await getAppDb();
      await setSetting(db, 'accountEmail', res.user.email);
    } catch {
      // Ignore DB write errors
    }

    return res;
  },

  logout: async () => {
    // End this device's session on the server too, so the refresh token is useless if leaked.
    const refreshToken = await getRefreshToken().catch(() => null);
    if (refreshToken) {
      await apiClient('/api/v1/auth/logout', {
        method: 'POST',
        body: { refreshToken },
        skipAuth: true,
        signal: AbortSignal.timeout(LOGOUT_TIMEOUT_MS),
      }).catch(() => undefined);
    }
    await clearTokens();
    try {
      const db = await getAppDb();
      await setSetting(db, 'accountEmail', null);
    } catch {
      // Ignore DB write errors
    }
    set({
      user: null,
      isAuthenticated: false,
      syncStatus: 'idle',
      syncError: null,
      nextRetrySeconds: null,
    });
  },

  requestPasswordReset: async (email: string) => {
    await apiClient('/api/v1/auth/forgot-password', {
      method: 'POST',
      body: { email },
      skipAuth: true,
    });
  },

  resetPassword: async (email: string, code: string, newPassword: string) => {
    await apiClient('/api/v1/auth/reset-password', {
      method: 'POST',
      body: { email, code, newPassword },
      skipAuth: true,
    });
  },

  changePassword: async (currentPassword: string, newPassword: string) => {
    const res = await apiClient(
      '/api/v1/me/password',
      { method: 'POST', body: { currentPassword, newPassword } },
      authResponseSchema,
    );
    await saveTokens(res.accessToken, res.refreshToken);
    set({ user: res.user });
  },

  sendVerificationCode: async () => {
    await apiClient('/api/v1/me/verify-email/send', { method: 'POST' });
  },

  verifyEmail: async (code: string) => {
    const user = await apiClient(
      '/api/v1/me/verify-email',
      { method: 'POST', body: { code } },
      userProfileSchema,
    );
    set({ user });
  },

  setUser: (user) => set({ user }),

  setSyncStatus: (status, error = null, nextRetrySeconds = null) =>
    set({ syncStatus: status, syncError: error, nextRetrySeconds }),

  setLastSyncedAt: (timestamp) => set({ lastSyncedAt: timestamp }),
}));

// Automatically log out when refresh token fails / session expires
onAuthExpired(() => {
  useAuthStore
    .getState()
    .logout()
    .catch(() => undefined);
});
