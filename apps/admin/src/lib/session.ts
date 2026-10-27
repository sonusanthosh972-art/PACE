import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

/** Admin sign-in: one shared password, a signed httpOnly session cookie. Server-side only. */
export const SESSION_COOKIE = 'pp_admin_session';
export const SESSION_TTL_SECONDS = 12 * 60 * 60;
const MIN_SECRET_LENGTH = 32;

function sessionSecret(): string | null {
  const secret = process.env.ADMIN_SESSION_SECRET ?? '';
  return secret.length >= MIN_SECRET_LENGTH ? secret : null;
}

function sign(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('base64url');
}

function safeEqual(a: string, b: string): boolean {
  const ha = createHash('sha256').update(a).digest();
  const hb = createHash('sha256').update(b).digest();
  return timingSafeEqual(ha, hb);
}

/** True when ADMIN_PASSWORD and ADMIN_SESSION_SECRET are both configured. */
export function authConfigured(): boolean {
  return Boolean(process.env.ADMIN_PASSWORD) && sessionSecret() !== null;
}

export function passwordMatches(candidate: string): boolean {
  const expected = process.env.ADMIN_PASSWORD;
  return Boolean(expected) && safeEqual(candidate, expected ?? '');
}

/** Token format: `<expiresAtSeconds>.<hmac>` */
export function createSessionToken(nowMs: number = Date.now()): string {
  const secret = sessionSecret();
  if (!secret) throw new Error('ADMIN_SESSION_SECRET must be at least 32 characters.');
  const expires = String(Math.floor(nowMs / 1000) + SESSION_TTL_SECONDS);
  return `${expires}.${sign(expires, secret)}`;
}

export function isValidSession(token: string | undefined, nowMs: number = Date.now()): boolean {
  const secret = sessionSecret();
  if (!secret || !token) return false;
  const [expires, mac] = token.split('.');
  if (!expires || !mac || !/^\d+$/.test(expires)) return false;
  if (!safeEqual(mac, sign(expires, secret))) return false;
  return Number(expires) * 1000 > nowMs;
}
