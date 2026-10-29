import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { getDb } from '../db/mongo.js';
import type { AuthCodeDoc, AuthCodePurpose, SessionDoc, UserDoc } from '../db/models.js';

const JWT_ISSUER = 'PaisaPulse.Api';
const JWT_AUDIENCE = 'PaisaPulse.Mobile';

export function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error('JWT_SECRET must be at least 32 characters long');
  }
  return secret;
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

let dummyHash: Promise<string> | null = null;

/**
 * Like verifyPassword, but spends the same bcrypt time when the account does not exist, so the
 * response time does not reveal which emails are registered.
 */
export async function verifyPasswordOrDummy(password: string, hash: string | undefined): Promise<boolean> {
  if (!hash) {
    dummyHash ??= bcrypt.hash('paisa-pulse-dummy-password', 10);
    await verifyPassword(password, await dummyHash);
    return false;
  }
  return verifyPassword(password, hash);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  if (!password || !hash) return false;
  try {
    return await bcrypt.compare(password, hash);
  } catch {
    return false;
  }
}

export function hashRefreshToken(token: string): string {
  return crypto.createHash('sha256').update(token, 'utf8').digest('hex');
}

export interface TokenResult {
  accessToken: string;
  refreshToken: string;
  refreshTokenExpiresAt: Date;
}

export function generateTokens(user: { id: string; email: string; name: string }): TokenResult {
  const secret = getJwtSecret();
  const now = new Date();
  const refreshExpires = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // 30 days

  const payload = {
    sub: user.id,
    email: user.email,
    name: user.name,
    jti: crypto.randomUUID().replace(/-/g, ''),
  };

  const accessToken = jwt.sign(payload, secret, {
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE,
    algorithm: 'HS256',
    expiresIn: '15m',
  });

  const refreshToken = crypto.randomBytes(48).toString('base64url');

  return {
    accessToken,
    refreshToken,
    refreshTokenExpiresAt: refreshExpires,
  };
}

export interface AccessClaims {
  sub: string;
  email: string;
}

export function verifyAccessToken(token: string): AccessClaims {
  const decoded = jwt.verify(token, getJwtSecret(), {
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE,
    algorithms: ['HS256'],
  });
  if (typeof decoded !== 'object' || typeof decoded.sub !== 'string' || !decoded.sub) {
    throw new Error('Token has no subject');
  }
  return { sub: decoded.sub, email: typeof decoded.email === 'string' ? decoded.email : '' };
}

// ---------------------------------------------------------------------------------------------
// Sessions: one per signed-in device, so several phones can stay signed in and sign-out is real.

const sessions = () => getDb().collection<SessionDoc>('sessions');

/** Issues tokens for a new device session. */
export async function startSession(user: Pick<UserDoc, 'id' | 'email' | 'name'>): Promise<TokenResult> {
  const tokens = generateTokens(user);
  const now = new Date();
  await sessions().insertOne({
    id: crypto.randomUUID().replace(/-/g, ''),
    userId: user.id,
    tokenHash: hashRefreshToken(tokens.refreshToken),
    expiresAt: tokens.refreshTokenExpiresAt,
    createdAt: now,
    lastUsedAt: now,
  });
  return tokens;
}

/**
 * Exchanges a refresh token for new tokens. The old token works exactly once (it is deleted
 * atomically), so a stolen-and-replayed token fails. Tokens issued before sessions existed (stored
 * on the user) are accepted once and moved into a session.
 */
export async function rotateSession(refreshToken: string): Promise<{ user: UserDoc; tokens: TokenResult } | null> {
  const hash = hashRefreshToken(refreshToken);
  const now = new Date();
  const users = getDb().collection<UserDoc>('users');

  const session = await sessions().findOneAndDelete({ tokenHash: hash, expiresAt: { $gt: now } });
  let userId = session?.userId ?? null;
  if (!userId) {
    const legacy = await users.findOneAndUpdate(
      { refreshTokenHash: hash, refreshTokenExpiresAt: { $gt: now } },
      { $set: { refreshTokenHash: null, refreshTokenExpiresAt: null } },
    );
    userId = legacy?.id ?? null;
  }
  if (!userId) return null;

  const user = await users.findOne({ id: userId });
  if (!user) return null;
  return { user, tokens: await startSession(user) };
}

/** Signs one device out. Unknown tokens are ignored (sign-out always succeeds). */
export async function revokeSession(refreshToken: string): Promise<void> {
  await sessions().deleteOne({ tokenHash: hashRefreshToken(refreshToken) });
}

/** Signs every device out (password change/reset, account deletion). */
export async function revokeAllSessions(userId: string): Promise<void> {
  await sessions().deleteMany({ userId });
  await getDb()
    .collection<UserDoc>('users')
    .updateOne({ id: userId }, { $set: { refreshTokenHash: null, refreshTokenExpiresAt: null } });
}

// ---------------------------------------------------------------------------------------------
// One-time email codes (password reset, email verification).

export const CODE_TTL_MS = 15 * 60 * 1000;
export const MAX_CODE_ATTEMPTS = 5;

const authCodes = () => getDb().collection<AuthCodeDoc>('authCodes');

function codeHash(userId: string, purpose: AuthCodePurpose, code: string): string {
  return crypto.createHmac('sha256', getJwtSecret()).update(`${purpose}:${userId}:${code}`).digest('hex');
}

/** Creates a fresh 6-digit code (replacing any earlier one) and returns it for emailing. */
export async function issueCode(userId: string, purpose: AuthCodePurpose): Promise<string> {
  const code = crypto.randomInt(0, 1_000_000).toString().padStart(6, '0');
  const now = new Date();
  await authCodes().updateOne(
    { userId, purpose },
    {
      $set: {
        codeHash: codeHash(userId, purpose, code),
        attempts: 0,
        expiresAt: new Date(now.getTime() + CODE_TTL_MS),
        createdAt: now,
      },
    },
    { upsert: true },
  );
  return code;
}

/**
 * Checks a code. A correct code is consumed; each wrong one counts, and after MAX_CODE_ATTEMPTS the
 * code is deleted so it cannot be brute-forced.
 */
export async function consumeCode(userId: string, purpose: AuthCodePurpose, code: string): Promise<boolean> {
  const doc = await authCodes().findOneAndUpdate(
    { userId, purpose, expiresAt: { $gt: new Date() }, attempts: { $lt: MAX_CODE_ATTEMPTS } },
    { $inc: { attempts: 1 } },
    { returnDocument: 'after' },
  );
  if (!doc) return false;
  const expected = Buffer.from(doc.codeHash, 'hex');
  const actual = Buffer.from(codeHash(userId, purpose, code), 'hex');
  if (expected.length === actual.length && crypto.timingSafeEqual(expected, actual)) {
    await authCodes().deleteOne({ userId, purpose });
    return true;
  }
  if (doc.attempts >= MAX_CODE_ATTEMPTS) await authCodes().deleteOne({ userId, purpose });
  return false;
}
