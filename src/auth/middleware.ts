import { Request, Response, NextFunction, RequestHandler } from 'express';
import { verifyAccessToken } from './token';
import { findUserById } from '../store/users';
import type { Role } from '../store/users';
import type { AuthContext } from './types';

function unauthorized(res: Response, message: string): void {
  res.status(401).json({ error: { code: 'UNAUTHORIZED', message } });
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;

  if (!header) {
    unauthorized(res, 'Missing Authorization header.');
    return;
  }

  const [scheme, token, ...extra] = header.trim().split(/\s+/);
  if (scheme !== 'Bearer' || !token || extra.length > 0) {
    unauthorized(res, 'Authorization header must use the Bearer scheme.');
    return;
  }

  let payload;
  try {
    payload = verifyAccessToken(token);
  } catch {
    unauthorized(res, 'Invalid or expired token.');
    return;
  }

  const userId = Number(payload.sub);
  if (!Number.isInteger(userId) || userId <= 0) {
    unauthorized(res, 'Invalid token subject.');
    return;
  }

  const user = findUserById(userId);
  if (!user) {
    unauthorized(res, 'User no longer exists.');
    return;
  }

  const auth: AuthContext = { userId, role: user.role };
  res.locals.auth = auth;
  next();
}

export function requireRole(role: Role): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    const auth = res.locals.auth as AuthContext | undefined;

    if (!auth || auth.role !== role) {
      res.status(403).json({
        error: { code: 'FORBIDDEN', message: 'Insufficient permissions.' },
      });
      return;
    }

    next();
  };
}
