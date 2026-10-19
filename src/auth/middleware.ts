import type { Request, RequestHandler } from 'express';
import { verifyAccessToken } from './tokens';

const BEARER_SCHEME = 'bearer';

/**
 * Reads an access token out of an `Authorization: Bearer <token>` header. The scheme is
 * matched case-insensitively; a missing header, another scheme or an empty token all
 * yield `undefined`, which the middleware reports as "no session".
 */
export function readBearerToken(req: Request): string | undefined {
  const header = req.headers.authorization;
  if (typeof header !== 'string') {
    return undefined;
  }

  const [scheme, ...rest] = header.trim().split(/\s+/);
  if (scheme.toLowerCase() !== BEARER_SCHEME) {
    return undefined;
  }

  const token = rest.join(' ').trim();
  return token === '' ? undefined : token;
}

/**
 * Requires a valid access token on the request. The token is verified on every request,
 * so an expired token stops working with no state change anywhere. On failure the request
 * is answered with 401 and `next()` is never called.
 */
export const authenticateToken: RequestHandler = (req, res, next) => {
  const token = readBearerToken(req);
  if (token === undefined) {
    res.status(401).json({ error: 'A bearer access token is required' });
    return;
  }

  const user = verifyAccessToken(token);
  if (!user) {
    res.status(401).json({ error: 'Invalid or expired access token' });
    return;
  }

  req.authUser = user;
  next();
};
