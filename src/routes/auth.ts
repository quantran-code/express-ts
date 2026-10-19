import { Router, RequestHandler } from 'express';
import type { LoginResponse, Role } from '../auth/types';
import { readBearerToken } from '../auth/middleware';
import { hashPassword, verifyPassword } from '../auth/password';
import { createUser, findUserByEmail, toPublicUser } from '../auth/store';
import { readTokenTtlSeconds, signAccessToken, verifyAccessToken } from '../auth/tokens';
import { validateLogin, validateRegister } from '../auth/validation';
import { createMember, findMemberByEmail } from '../members/store';

export const authRouter: Router = Router();

/**
 * The single message returned for every failed login. An unknown email and a wrong
 * password must be indistinguishable, so neither is reported specifically.
 */
export const INVALID_CREDENTIALS_MESSAGE = 'Invalid credentials';

/**
 * Creates an account. Registration is public and defaults to the member role; asking for
 * the librarian role is only honoured for a caller who is already a librarian.
 */
export const registerHandler: RequestHandler = (req, res) => {
  const result = validateRegister(req.body);
  if (!result.ok) {
    res.status(400).json({ errors: result.errors });
    return;
  }

  if (findUserByEmail(result.value.email)) {
    res.status(409).json({ error: 'An account with this email already exists' });
    return;
  }

  /**
   * These routes are public, so a supplied `Authorization` header is the only thing that
   * can grant a librarian an escalation here. A header that is present but unusable is a
   * 401, consistent with every protected endpoint; an absent one simply means anonymous.
   */
  const token = readBearerToken(req);
  const caller = token === undefined ? null : verifyAccessToken(token);
  if (token !== undefined && !caller) {
    res.status(401).json({ error: 'Invalid or expired access token' });
    return;
  }

  let role: Role = 'member';
  if (result.value.role === 'librarian') {
    if (caller?.role !== 'librarian') {
      res.status(403).json({ error: 'A librarian role is required to create a librarian account' });
      return;
    }
    role = 'librarian';
  }

  const member =
    findMemberByEmail(result.value.email) ??
    createMember({ name: result.value.name, email: result.value.email });

  const user = createUser({
    name: result.value.name,
    email: result.value.email,
    passwordHash: hashPassword(result.value.password),
    role,
    memberId: member.id,
  });

  res.status(201).json(toPublicUser(user));
};

/**
 * Exchanges valid credentials for an access token. Every failure returns the same
 * status and body so a caller cannot probe which emails have accounts.
 */
export const loginHandler: RequestHandler = (req, res) => {
  const result = validateLogin(req.body);
  if (!result.ok) {
    res.status(400).json({ errors: result.errors });
    return;
  }

  const user = findUserByEmail(result.value.email);
  if (!user || !verifyPassword(result.value.password, user.passwordHash)) {
    res.status(401).json({ error: INVALID_CREDENTIALS_MESSAGE });
    return;
  }

  const body: LoginResponse = {
    accessToken: signAccessToken(user),
    tokenType: 'Bearer',
    expiresIn: readTokenTtlSeconds(),
  };

  res.status(200).json(body);
};

authRouter.post('/register', registerHandler);
authRouter.post('/login', loginHandler);
