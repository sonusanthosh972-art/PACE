import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken } from '../services/auth.js';

export interface AuthenticatedRequest extends Request {
  userId?: string;
  userEmail?: string;
}

export function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({
      type: 'https://tools.ietf.org/html/rfc7235#section-3.1',
      title: 'Unauthorized',
      status: 401,
      detail: 'Missing or invalid Authorization header',
    });
    return;
  }

  const token = authHeader.substring(7).trim();
  try {
    const decoded = verifyAccessToken(token);
    req.userId = decoded.sub || decoded.id;
    req.userEmail = decoded.email;
    next();
  } catch (err: any) {
    res.status(401).json({
      type: 'https://tools.ietf.org/html/rfc7235#section-3.1',
      title: 'Unauthorized',
      status: 401,
      detail: 'Token is invalid or expired',
    });
  }
}
