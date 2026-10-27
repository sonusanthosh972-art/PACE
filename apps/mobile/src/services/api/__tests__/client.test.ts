import { z } from 'zod';

import { apiClient, ApiError, onAuthExpired, setApiBaseUrl } from '../client';
import { clearTokens, saveTokens } from '../tokens';

describe('apiClient', () => {
  const originalFetch = global.fetch;

  beforeEach(async () => {
    await clearTokens();
    setApiBaseUrl('http://test-server:5080');
    jest.clearAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('makes request with JSON body and validates response with Zod', async () => {
    const mockResponse = { id: 'u1', name: 'Alice' };
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => mockResponse,
    });

    const schema = z.object({ id: z.string(), name: z.string() });
    const result = await apiClient(
      '/api/v1/test',
      { method: 'POST', body: { foo: 'bar' } },
      schema,
    );

    expect(result).toEqual(mockResponse);
    expect(global.fetch).toHaveBeenCalledWith(
      'http://test-server:5080/api/v1/test',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
          Accept: 'application/json',
        }),
        body: JSON.stringify({ foo: 'bar' }),
      }),
    );
  });

  it('attaches Bearer token when available', async () => {
    await saveTokens('valid-jwt-token', 'valid-refresh-token');

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({ ok: true }),
    });

    await apiClient('/api/v1/me', {}, z.object({ ok: z.boolean() }));

    expect(global.fetch).toHaveBeenCalledWith(
      'http://test-server:5080/api/v1/me',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer valid-jwt-token',
        }),
      }),
    );
  });

  it('automatically refreshes token on 401 and retries original request', async () => {
    await saveTokens('expired-access-token', 'good-refresh-token');

    let callCount = 0;
    global.fetch = jest.fn().mockImplementation(async (url: string) => {
      if (url.includes('/api/v1/auth/refresh')) {
        return {
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({
            accessToken: 'new-fresh-access-token',
            refreshToken: 'new-refresh-token',
            user: {
              id: 'u1',
              email: 'a@b.com',
              name: 'Alice',
              salaryPaise: 5000000,
              payday: 1,
              savingsGoalPaise: 1000000,
              timezone: 'Asia/Kolkata',
            },
          }),
        };
      }

      callCount++;
      if (callCount === 1) {
        return {
          ok: false,
          status: 401,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({ detail: 'Token expired' }),
        };
      }

      return {
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ data: 'secret' }),
      };
    });

    const result = await apiClient('/api/v1/protected', {}, z.object({ data: z.string() }));
    expect(result).toEqual({ data: 'secret' });
    expect(callCount).toBe(2);
  });

  it('triggers onAuthExpired and throws when refresh fails', async () => {
    await saveTokens('expired-access-token', 'bad-refresh-token');

    const authExpiredSpy = jest.fn();
    const unsubscribe = onAuthExpired(authExpiredSpy);

    global.fetch = jest.fn().mockImplementation(async (url: string) => {
      if (url.includes('/api/v1/auth/refresh')) {
        return {
          ok: false,
          status: 401,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({ detail: 'Refresh token invalid' }),
        };
      }
      return {
        ok: false,
        status: 401,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ detail: 'Unauthorized' }),
      };
    });

    await expect(
      apiClient('/api/v1/protected', {}, z.object({ data: z.string() })),
    ).rejects.toThrow('Session expired. Please sign in again.');
    expect(authExpiredSpy).toHaveBeenCalled();
    unsubscribe();
  });

  it('translates validation error into friendly message', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 400,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({
        title: 'Validation failed',
        status: 400,
        errors: {
          Email: ['Email is not a valid email address.'],
        },
      }),
    });

    await expect(apiClient('/api/v1/auth/login', {}, z.any())).rejects.toThrow(
      'Email is not a valid email address.',
    );
  });

  it('translates network failure into friendly error', async () => {
    global.fetch = jest.fn().mockRejectedValue(new TypeError('Network request failed'));

    try {
      await apiClient('/api/v1/test', {}, z.any());
      fail('Expected ApiError');
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      const apiErr = err as ApiError;
      expect(apiErr.isNetworkError).toBe(true);
      expect(apiErr.message).toBe('Unable to reach server. Please check your connection.');
    }
  });

  it('throws descriptive error if response schema validation fails', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({ wrong: 'shape' }),
    });

    const strictSchema = z.object({ expectedField: z.number() });
    await expect(apiClient('/api/v1/test', {}, strictSchema)).rejects.toThrow(
      'Unexpected server response format.',
    );
  });
});
