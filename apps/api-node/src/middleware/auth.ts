import crypto from 'node:crypto';
import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken } from '../services/auth.js';
import { problem } from '../http.js';

export interface AuthenticatedRequest extends Request {
  userId?: string;
  userEmail?: string;
}

/** Returns the authenticated user id. Only call from handlers behind requireAuth. */
export function userIdOf(req: AuthenticatedRequest): string {
  if (!req.userId) throw new Error('requireAuth did not run for this route');
  return req.userId;
}

export function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    problem(res, 401, 'Unauthorized', 'Missing or invalid Authorization header');
    return;
  }

  try {
    const claims = verifyAccessToken(authHeader.substring(7).trim());
    req.userId = claims.sub;
    req.userEmail = claims.email;
    next();
  } catch {
    problem(res, 401, 'Unauthorized', 'Token is invalid or expired');
  }
}

function sha256(value: string): Buffer {
  return crypto.createHash('sha256').update(value, 'utf8').digest();
}

/**
 * Guards the admin endpoints with a shared key (header x-admin-key), compared in constant time.
 * Without ADMIN_API_KEY configured the admin API is disabled rather than open.
 */
export function requireAdminKey(adminApiKey: string | null) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!adminApiKey) {
      problem(res, 503, 'Admin API disabled', 'Set ADMIN_API_KEY on the server to enable it.');
      return;
    }
    const supplied = req.header('x-admin-key') ?? '';
    if (!crypto.timingSafeEqual(sha256(supplied), sha256(adminApiKey))) {
      problem(res, 401, 'Unauthorized', 'Missing or invalid admin key');
      return;
    }
    next();
  };
}
