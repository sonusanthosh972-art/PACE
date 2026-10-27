const DAY_MS = 86_400_000;
const rateLimitHits: number[] = [];

/** Records one request rejected by a rate limiter (shown on the admin dashboard). */
export function recordRateLimitHit(now: number = Date.now()): void {
  rateLimitHits.push(now);
  while (rateLimitHits.length > 0 && rateLimitHits[0] < now - DAY_MS) rateLimitHits.shift();
}

export function rateLimitHits24h(now: number = Date.now()): number {
  return rateLimitHits.filter((t) => t >= now - DAY_MS).length;
}
