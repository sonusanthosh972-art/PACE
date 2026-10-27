import { clearTokens, getAccessToken, getRefreshToken, hasTokens, saveTokens } from '../tokens';

describe('tokens service', () => {
  beforeEach(async () => {
    await clearTokens();
  });

  it('stores and retrieves access and refresh tokens', async () => {
    expect(await hasTokens()).toBe(false);
    expect(await getAccessToken()).toBeNull();
    expect(await getRefreshToken()).toBeNull();

    await saveTokens('test-access-token', 'test-refresh-token');

    expect(await hasTokens()).toBe(true);
    expect(await getAccessToken()).toBe('test-access-token');
    expect(await getRefreshToken()).toBe('test-refresh-token');
  });

  it('clears tokens', async () => {
    await saveTokens('access', 'refresh');
    expect(await hasTokens()).toBe(true);

    await clearTokens();
    expect(await hasTokens()).toBe(false);
    expect(await getAccessToken()).toBeNull();
    expect(await getRefreshToken()).toBeNull();
  });
});
