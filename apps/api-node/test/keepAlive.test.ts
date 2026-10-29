import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { intervalFromEnv, KEEP_ALIVE_INTERVAL_MS, startKeepAlive } from '../src/jobs/keepAlive.js';

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('keep-alive', () => {
  it('pings its own public /health URL on a timer and stops cleanly', async () => {
    const urls: string[] = [];
    const fakeFetch = (async (url: string) => {
      urls.push(url);
      return new Response('{}', { status: 200 });
    }) as unknown as typeof fetch;

    const keepAlive = startKeepAlive({ RENDER_EXTERNAL_URL: 'https://paisapulse.onrender.com/' }, fakeFetch, 20);
    assert.ok(keepAlive);
    await wait(70);
    keepAlive.stop();
    const count = urls.length;
    assert.ok(count >= 2);
    assert.ok(urls.every((u) => u === 'https://paisapulse.onrender.com/health'));
    await wait(50);
    assert.equal(urls.length, count); // no pings after stop
  });

  it('stays off locally, when disabled, or with a bad URL', () => {
    assert.equal(startKeepAlive({}), null);
    assert.equal(startKeepAlive({ RENDER_EXTERNAL_URL: 'https://x.onrender.com', KEEP_ALIVE: 'false' }), null);
    assert.equal(startKeepAlive({ KEEP_ALIVE_URL: 'ftp://nope' }), null);
  });

  it('keeps running when a ping fails', async () => {
    let calls = 0;
    const failing = (async () => {
      calls++;
      throw new TypeError('network down');
    }) as unknown as typeof fetch;
    const keepAlive = startKeepAlive({ KEEP_ALIVE_URL: 'https://example.com' }, failing, 20);
    await wait(70);
    keepAlive?.stop();
    assert.ok(calls >= 2);
  });

  it('also keeps extra backends awake, without pinging any URL twice', async () => {
    const urls = new Set<string>();
    const fakeFetch = (async (url: string) => {
      urls.add(url);
      return new Response('{}', { status: 200 });
    }) as unknown as typeof fetch;
    const keepAlive = startKeepAlive(
      {
        RENDER_EXTERNAL_URL: 'https://api.onrender.com',
        KEEP_ALIVE_EXTRA_URLS: 'https://other.onrender.com/, https://api.onrender.com, ftp://bad',
      },
      fakeFetch,
      20,
    );
    await wait(50);
    keepAlive?.stop();
    assert.deepEqual([...urls].sort(), ['https://api.onrender.com/health', 'https://other.onrender.com/health']);
  });

  it('reads the interval in minutes and keeps it inside Render’s 15-minute window', () => {
    assert.equal(intervalFromEnv({}), KEEP_ALIVE_INTERVAL_MS);
    assert.equal(intervalFromEnv({ KEEP_ALIVE_INTERVAL_MINUTES: '5' }), 5 * 60_000);
    assert.equal(intervalFromEnv({ KEEP_ALIVE_INTERVAL_MINUTES: '0.5' }), 60_000);
    assert.equal(intervalFromEnv({ KEEP_ALIVE_INTERVAL_MINUTES: '60' }), 14 * 60_000);
    assert.equal(intervalFromEnv({ KEEP_ALIVE_INTERVAL_MINUTES: 'abc' }), KEEP_ALIVE_INTERVAL_MS);
  });
});
