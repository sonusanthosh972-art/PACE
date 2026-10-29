import { logger } from '../logger.js';

/** Render's free tier sleeps after 15 minutes without inbound traffic; ping well inside that. */
export const KEEP_ALIVE_INTERVAL_MS = 10 * 60 * 1000;
/** Bounds for KEEP_ALIVE_INTERVAL_MINUTES: more often only adds load; 14+ risks the 15-min cutoff. */
const MIN_INTERVAL_MINUTES = 1;
const MAX_INTERVAL_MINUTES = 14;
const PING_TIMEOUT_MS = 30_000;

function normaliseUrl(raw: string): string | null {
  const base = raw.trim().replace(/\/+$/, '');
  if (!base) return null;
  if (!/^https?:\/\//.test(base)) {
    logger.warn({ base }, '[KeepAlive] Ignoring URL: not http(s)');
    return null;
  }
  return base;
}

/** KEEP_ALIVE_INTERVAL_MINUTES, clamped to a safe range; the default when unset or invalid. */
export function intervalFromEnv(env: NodeJS.ProcessEnv): number {
  const minutes = Number(env.KEEP_ALIVE_INTERVAL_MINUTES);
  if (!env.KEEP_ALIVE_INTERVAL_MINUTES || !Number.isFinite(minutes)) return KEEP_ALIVE_INTERVAL_MS;
  return Math.min(MAX_INTERVAL_MINUTES, Math.max(MIN_INTERVAL_MINUTES, minutes)) * 60_000;
}

export interface KeepAlive {
  stop(): void;
}

/**
 * Keeps a free-tier instance awake by requesting its own *public* URL on a timer. The request goes
 * out through Render's edge and back in, so it counts as inbound traffic (a localhost call would
 * not). It can only prevent sleep, not wake a sleeping instance, so pair it with an external
 * uptime monitor for restarts.
 *
 * KEEP_ALIVE_EXTRA_URLS (comma-separated) lets this one service also keep other free backends
 * awake, so they do not each need their own pinger. Each target's /health is requested.
 *
 * Returns null when there is nothing to ping (local development) or KEEP_ALIVE=false.
 */
export function startKeepAlive(
  env: NodeJS.ProcessEnv = process.env,
  fetchImpl: typeof fetch = fetch,
  intervalMs: number = intervalFromEnv(env),
): KeepAlive | null {
  if (env.KEEP_ALIVE === 'false') return null;
  const own = normaliseUrl(env.KEEP_ALIVE_URL || env.RENDER_EXTERNAL_URL || '');
  const extra = (env.KEEP_ALIVE_EXTRA_URLS ?? '').split(',').map(normaliseUrl);
  const urls = [...new Set([own, ...extra].filter((u): u is string => u !== null))].map((b) => `${b}/health`);
  if (urls.length === 0) return null;

  const ping = async (url: string) => {
    try {
      const res = await fetchImpl(url, {
        headers: { 'user-agent': 'paisapulse-keepalive' },
        signal: AbortSignal.timeout(PING_TIMEOUT_MS),
      });
      if (!res.ok) logger.warn({ url, status: res.status }, '[KeepAlive] Health ping returned an error');
    } catch (err) {
      logger.warn({ url, err }, '[KeepAlive] Health ping failed');
    }
  };

  const timer = setInterval(() => {
    for (const url of urls) void ping(url);
  }, intervalMs);
  logger.info({ urls, everyMinutes: intervalMs / 60_000 }, '[KeepAlive] Pinging to prevent idle sleep');
  return { stop: () => clearInterval(timer) };
}
