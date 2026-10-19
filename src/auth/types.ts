export type Role = 'librarian' | 'member';

/**
 * The account as it is kept in the in-memory User store. `passwordHash` is the only
 * credential-shaped field and must never reach a response body.
 */
export interface StoredUser {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  role: Role;
  memberId: string | null;
  createdAt: string;
}

/**
 * The only account shape that is ever serialized into a response.
 */
export type PublicUser = Omit<StoredUser, 'passwordHash'>;

export interface CreateUserInput {
  name: string;
  email: string;
  passwordHash: string;
  role: Role;
  memberId: string | null;
}

export interface RegisterInput {
  name: string;
  email: string;
  password: string;
  role?: Role;
}

export interface LoginInput {
  email: string;
  password: string;
}

/**
 * The claims carried by an access token. `iat` and `exp` are seconds since the epoch.
 */
export interface AccessTokenPayload {
  sub: string;
  email: string;
  role: Role;
  memberId: string | null;
  iat: number;
  exp: number;
}

/**
 * The verified identity attached to a request by the session middleware.
 */
export interface AuthenticatedUser {
  id: string;
  email: string;
  role: Role;
  memberId: string | null;
}

export interface LoginResponse {
  accessToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
}

declare global {
  namespace Express {
    interface Request {
      /**
       * Present only once the session middleware has verified an access token; absent
       * on anonymous requests (including the public register and login endpoints).
       */
      authUser?: AuthenticatedUser;
    }
  }
}

export type { FieldErrors, ValidationResult } from '../books/types';
