import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { NotFoundError, ValidationError } from '../errors';

type JwtUser = {
  id: string;
  role: 'member' | 'librarian';
};

const JWT_SECRET = process.env.JWT_SECRET ?? 'dev-secret';

const requireAuth = (req: Request, res: Response, next: NextFunction): void => {
  const authHeader = req.headers.authorization;

  if (!authHeader || Array.isArray(authHeader) || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Unauthorized', message: 'Missing or invalid token' });
    return;
  }

  const token = authHeader.slice('Bearer '.length);

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (typeof decoded !== 'object' || decoded === null) {
      throw new Error('Invalid token');
    }

    const user = decoded as JwtUser;
    if (!user.id || (user.role !== 'member' && user.role !== 'librarian')) {
      throw new Error('Invalid token');
    }

    req.user = { id: user.id, role: user.role };
    next();
  } catch (_err) {
    res.status(401).json({ error: 'Unauthorized', message: 'Missing or invalid token' });
  }
};

const requireRole = (role: 'member' | 'librarian') => {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized', message: 'Missing or invalid token' });
      return;
    }

    if (req.user.role !== role) {
      res.status(403).json({ error: 'Forbidden', message: 'Insufficient role' });
      return;
    }

    next();
  };
};

export {
  requireAuth,
  requireRole,
};
