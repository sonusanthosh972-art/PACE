import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';

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
    id: user.id,
    email: user.email,
    name: user.name,
    jti: crypto.randomUUID().replace(/-/g, ''),
  };

  const accessToken = jwt.sign(payload, secret, {
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE,
    expiresIn: '15m',
  });

  const refreshToken = crypto.randomBytes(48).toString('base64url');

  return {
    accessToken,
    refreshToken,
    refreshTokenExpiresAt: refreshExpires,
  };
}

export function verifyAccessToken(token: string): any {
  const secret = getJwtSecret();
  return jwt.verify(token, secret, {
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE,
  });
}
