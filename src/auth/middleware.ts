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

/**
 * True only for a caller whose verified token carries the librarian role. Used by the
 * member and loan routes, which scope their data by ownership rather than by role.
 */
export function isLibrarian(req: Request): boolean {
  return req.authUser?.role === 'librarian';
}

/**
 * The member record id carried by the caller's token, or `null` when the token has none
 * (the seeded librarian has no member record). Identity always comes from the token, so a
 * request body can never widen what the caller may act on.
 */
export function callerMemberId(req: Request): string | null {
  return req.authUser?.memberId ?? null;
}

/**
 * Restricts a route to librarians. Always mounted after `authenticateToken`, so a missing
 * or invalid token is already a 401 by the time this runs and the only rejection here is a
 * 403 for a member caller.
 */
export const requireLibrarian: RequestHandler = (req, res, next) => {
  if (!isLibrarian(req)) {
    res.status(403).json({ error: 'A librarian role is required' });
    return;
  }

  next();
};
