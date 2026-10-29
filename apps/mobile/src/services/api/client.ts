import type { z } from 'zod';

import { authResponseSchema } from './schemas';
import { clearTokens, getAccessToken, getRefreshToken, saveTokens } from './tokens';

export class ApiError extends Error {
  readonly statusCode: number;
  readonly isNetworkError: boolean;
  readonly details?: unknown;

  constructor(message: string, statusCode = 0, isNetworkError = false, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.isNetworkError = isNetworkError;
    this.details = details;
  }
}

/** Hosted Paisa Pulse API (Render). Override with EXPO_PUBLIC_API_URL for local development. */
export const DEFAULT_API_URL = 'https://paisapulse-apis.onrender.com';

let customBaseUrl: string | null = null;

export function setApiBaseUrl(url: string | null): void {
  customBaseUrl = url?.trim().replace(/\/+$/, '') ?? null;
}

export function getApiBaseUrl(): string {
  // A custom server address is a development tool; release builds always use the hosted API.
  if (customBaseUrl && __DEV__) return customBaseUrl;
  if (process.env.EXPO_PUBLIC_API_URL) return process.env.EXPO_PUBLIC_API_URL.replace(/\/+$/, '');
  return DEFAULT_API_URL;
}

/** A sleeping free-tier server (e.g. Render) can take up to a minute to wake up. */
const CONNECTION_TEST_TIMEOUT_MS = 60_000;
/** Every request gives up after this, so a stalled network never hangs a screen or sync. */
const REQUEST_TIMEOUT_MS = 60_000;

/**
 * Pings the server health endpoint to verify connectivity from device to server.
 */
export async function testConnection(testUrl?: string): Promise<{ ok: boolean; status: string }> {
  const base = (testUrl?.trim() || getApiBaseUrl()).replace(/\/+$/, '');
  try {
    const res = await fetch(`${base}/health`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(CONNECTION_TEST_TIMEOUT_MS),
    });
    if (res.ok) {
      return { ok: true, status: 'Connected to server' };
    }
    return { ok: false, status: `Server responded with status ${res.status}` };
  } catch {
    return {
      ok: false,
      status: 'Could not reach the server. Check the address and your internet connection.',
    };
  }
}

type AuthExpiredListener = () => void;
const authExpiredListeners = new Set<AuthExpiredListener>();

export function onAuthExpired(listener: AuthExpiredListener): () => void {
  authExpiredListeners.add(listener);
  return () => authExpiredListeners.delete(listener);
}

function notifyAuthExpired(): void {
  for (const listener of authExpiredListeners) {
    try {
      listener();
    } catch {
      // Ignore listener errors
    }
  }
}

interface RequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
  skipAuth?: boolean;
  _isRetry?: boolean;
}

// Mutex promise for concurrent token refresh
let refreshPromise: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    try {
      const refreshToken = await getRefreshToken();
      if (!refreshToken) {
        await clearTokens();
        notifyAuthExpired();
        return null;
      }

      const baseUrl = getApiBaseUrl();
      const response = await fetch(`${baseUrl}/api/v1/auth/refresh`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({ refreshToken }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      if (!response.ok) {
        await clearTokens();
        notifyAuthExpired();
        return null;
      }

      const json: unknown = await response.json();
      const parsed = authResponseSchema.safeParse(json);
      if (!parsed.success) {
        await clearTokens();
        notifyAuthExpired();
        return null;
      }

      await saveTokens(parsed.data.accessToken, parsed.data.refreshToken);
      return parsed.data.accessToken;
    } catch {
      return null;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

function extractFriendlyErrorMessage(statusCode: number, data: unknown): string {
  if (typeof data === 'object' && data !== null) {
    const obj = data as Record<string, unknown>;
    // Check validation problem errors dictionary: { errors: { FieldName: ["message"] } }
    if (obj.errors && typeof obj.errors === 'object') {
      const errorEntries = Object.values(obj.errors as Record<string, unknown>);
      for (const entry of errorEntries) {
        if (Array.isArray(entry) && entry.length > 0 && typeof entry[0] === 'string') {
          return entry[0];
        }
      }
    }
    // Check ProblemDetails detail or title
    if (typeof obj.detail === 'string' && obj.detail.trim().length > 0) {
      return obj.detail;
    }
    if (typeof obj.title === 'string' && obj.title.trim().length > 0) {
      return obj.title;
    }
    if (typeof obj.message === 'string' && obj.message.trim().length > 0) {
      return obj.message;
    }
  }

  switch (statusCode) {
    case 400:
      return 'The request was invalid. Please check your information.';
    case 401:
      return 'Invalid email or password.';
    case 403:
      return 'You do not have permission to perform this action.';
    case 404:
      return 'The requested resource was not found.';
    case 409:
      return 'An account with this email address already exists.';
    case 429:
      return 'Too many requests. Please wait a moment and try again.';
    default:
      return statusCode >= 500
        ? 'The server encountered an error. Please try again later.'
        : 'Something went wrong. Please try again.';
  }
}

/**
 * Executes an HTTP request against the Paisa Pulse API, automatically attaching auth headers,
 * handling token refresh, translating errors into user-friendly messages, and validating the
 * response using the provided Zod schema.
 */
export async function apiClient<T>(
  endpoint: string,
  options: RequestOptions = {},
  schema?: z.ZodType<T>,
): Promise<T> {
  const baseUrl = getApiBaseUrl();
  const url = endpoint.startsWith('http')
    ? endpoint
    : `${baseUrl}${endpoint.startsWith('/') ? '' : '/'}${endpoint}`;

  const headers: Record<string, string> = {
    Accept: 'application/json',
    ...(options.headers as Record<string, string>),
  };

  if (options.body !== undefined && !(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }

  if (!options.skipAuth) {
    const accessToken = await getAccessToken();
    if (accessToken) {
      headers.Authorization = `Bearer ${accessToken}`;
    }
  }

  // Release builds never send data over plain HTTP.
  if (!__DEV__ && !url.startsWith('https://')) {
    throw new ApiError('Insecure server address. Paisa Pulse only connects over HTTPS.', 0, false);
  }

  let response: Response;
  try {
    response = await fetch(url, {
      ...options,
      signal: options.signal ?? AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      headers,
      body:
        options.body !== undefined
          ? typeof options.body === 'string'
            ? options.body
            : JSON.stringify(options.body)
          : undefined,
    });
  } catch (err) {
    throw new ApiError('Unable to reach server. Please check your connection.', 0, true, err);
  }

  // Handle 401 Unauthorized with token refresh (once per request)
  if (response.status === 401 && !options.skipAuth && !options._isRetry) {
    const newAccessToken = await refreshAccessToken();
    if (newAccessToken) {
      return apiClient<T>(endpoint, { ...options, _isRetry: true }, schema);
    }
    throw new ApiError('Session expired. Please sign in again.', 401);
  }

  // 204 No Content
  if (response.status === 204) {
    if (schema) {
      const parsed = schema.safeParse(undefined);
      if (!parsed.success) {
        throw new ApiError(
          'Response format was not expected.',
          response.status,
          false,
          parsed.error,
        );
      }
      return parsed.data;
    }
    return undefined as unknown as T;
  }

  // Error responses (status >= 400)
  if (!response.ok) {
    let errorJson: unknown = null;
    try {
      errorJson = await response.json();
    } catch {
      // response wasn't JSON
    }
    const friendlyMessage = extractFriendlyErrorMessage(response.status, errorJson);
    throw new ApiError(friendlyMessage, response.status, false, errorJson);
  }

  // Parse JSON and validate with Zod
  let responseData: unknown = null;
  const contentType = response.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    try {
      responseData = await response.json();
    } catch (err) {
      throw new ApiError('Invalid server response.', response.status, false, err);
    }
  }

  if (schema) {
    const parsed = schema.safeParse(responseData);
    if (!parsed.success) {
      throw new ApiError(
        'Unexpected server response format.',
        response.status,
        false,
        parsed.error,
      );
    }
    return parsed.data;
  }

  return responseData as T;
}
