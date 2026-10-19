import { createHmac, timingSafeEqual } from 'crypto';
import type { AccessTokenPayload, AuthenticatedUser, Role } from './types';

/**
 * Access tokens stay valid for one hour when TOKEN_TTL_SECONDS is not configured.
 */
export const DEFAULT_TOKEN_TTL_SECONDS = 3600;

/**
 * Development fallback only: deployments are expected to set TOKEN_SECRET. A token
 * signed with this default stops verifying as soon as the real secret is configured.
 */
const INSECURE_DEV_SECRET = 'insecure-development-secret-change-me';

const JWT_ALGORITHM = 'HS256';
const JWT_TYPE = 'JWT';

/**
 * Reads TOKEN_TTL_SECONDS on every call, so a test can change it between calls.
 * Unset, non-numeric and non-positive values all fall back to the default.
 */
export function readTokenTtlSeconds(): number {
  const raw = process.env.TOKEN_TTL_SECONDS;
  if (raw === undefined) {
    return DEFAULT_TOKEN_TTL_SECONDS;
  }

  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return DEFAULT_TOKEN_TTL_SECONDS;
  }

  return parsed;
}

/**
 * Reads TOKEN_SECRET on every call. Falls back to a documented insecure development
 * default so the app runs out of the box.
 */
export function readTokenSecret(): string {
  const secret = process.env.TOKEN_SECRET;
  return secret !== undefined && secret !== '' ? secret : INSECURE_DEV_SECRET;
}

function toBase64Url(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64url');
}

function fromBase64Url(value: string): string {
  return Buffer.from(value, 'base64url').toString('utf8');
}

function signSigningInput(signingInput: string): string {
  return createHmac('sha256', readTokenSecret()).update(signingInput).digest('base64url');
}

function signaturesMatch(received: string, expected: string): boolean {
  const receivedBuffer = Buffer.from(received, 'utf8');
  const expectedBuffer = Buffer.from(expected, 'utf8');
  if (receivedBuffer.length !== expectedBuffer.length) {
    return false;
  }
  return timingSafeEqual(receivedBuffer, expectedBuffer);
}

function isRole(value: unknown): value is Role {
  return value === 'librarian' || value === 'member';
}

/**
 * Mints a real HS256 JWT by hand: `base64url(header).base64url(payload).base64url(hmac)`.
 * A negative `ttlSeconds` is honoured so a caller can mint an already-expired token.
 */
export function signAccessToken(
  user: { id: string; email: string; role: Role; memberId: string | null },
  ttlSeconds?: number,
): string {
  const iat = Math.floor(Date.now() / 1000);
  const exp = iat + (ttlSeconds !== undefined ? ttlSeconds : readTokenTtlSeconds());

  const payload: AccessTokenPayload = {
    sub: user.id,
    email: user.email,
    role: user.role,
    memberId: user.memberId,
    iat,
    exp,
  };

  const signingInput = `${toBase64Url(JSON.stringify({ alg: JWT_ALGORITHM, typ: JWT_TYPE }))}.${toBase64Url(JSON.stringify(payload))}`;
  return `${signingInput}.${signSigningInput(signingInput)}`;
}

/**
 * Verifies signature and expiry and maps the claims onto an AuthenticatedUser.
 * Every failure (malformed token, tampered signature, expired token) yields `null`
 * rather than throwing.
 */
export function verifyAccessToken(token: string): AuthenticatedUser | null {
  if (typeof token !== 'string' || token === '') {
    return null;
  }

  const parts = token.split('.');
  if (parts.length !== 3) {
    return null;
  }

  const [encodedHeader, encodedPayload, signature] = parts;
  if (encodedHeader === '' || encodedPayload === '' || signature === '') {
    return null;
  }

  const expectedSignature = signSigningInput(`${encodedHeader}.${encodedPayload}`);
  if (!signaturesMatch(signature, expectedSignature)) {
    return null;
  }

  let header: unknown;
  let payload: unknown;
  try {
    header = JSON.parse(fromBase64Url(encodedHeader));
    payload = JSON.parse(fromBase64Url(encodedPayload));
  } catch {
    return null;
  }

  if (typeof header !== 'object' || header === null) {
    return null;
  }
  if ((header as { alg?: unknown }).alg !== JWT_ALGORITHM) {
    return null;
  }

  if (typeof payload !== 'object' || payload === null) {
    return null;
  }

  const claims = payload as Partial<AccessTokenPayload>;
  if (typeof claims.sub !== 'string' || typeof claims.email !== 'string') {
    return null;
  }
  if (!isRole(claims.role) || typeof claims.exp !== 'number') {
    return null;
  }
  if (claims.memberId !== null && typeof claims.memberId !== 'string') {
    return null;
  }

  if (claims.exp <= Math.floor(Date.now() / 1000)) {
    return null;
  }

  return {
    id: claims.sub,
    email: claims.email,
    role: claims.role,
    memberId: claims.memberId === undefined ? null : claims.memberId,
  };
}
