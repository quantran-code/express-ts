import { sign, verify } from 'jsonwebtoken';
import { JWT_SECRET, JWT_EXPIRES_IN } from './config';
import type { Role } from '../store/users';

export interface TokenPayload {
  sub: string;
  role: Role;
}

export function signAccessToken(userId: number, role: Role): string {
  return sign({ role }, JWT_SECRET, {
    algorithm: 'HS256',
    expiresIn: JWT_EXPIRES_IN,
    subject: String(userId),
  });
}

export function verifyAccessToken(token: string): TokenPayload {
  const decoded = verify(token, JWT_SECRET, { algorithms: ['HS256'] });

  if (typeof decoded === 'string') {
    throw new Error('Invalid token payload.');
  }

  const { sub, role } = decoded;

  if (typeof sub !== 'string') {
    throw new Error('Invalid token subject.');
  }
  if (role !== 'member' && role !== 'librarian') {
    throw new Error('Invalid token role.');
  }

  return { sub, role };
}
