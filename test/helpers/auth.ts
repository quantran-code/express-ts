import request from 'supertest';
import { expect } from 'vitest';
import app from '../../src/app';
import { SEEDED_LIBRARIAN_EMAIL, SEEDED_LIBRARIAN_PASSWORD } from '../../src/auth/store';

/**
 * Default identity used by memberAuthHeaders, so repeated calls inside one test are cheap:
 * the first call registers, the later ones hit the 409 that means "already registered" and
 * simply log in.
 */
const DEFAULT_MEMBER_NAME = 'Test Member';
const DEFAULT_MEMBER_EMAIL = 'member@library.test';
const DEFAULT_MEMBER_PASSWORD = 'member-password';

/**
 * Logs in as the seeded librarian and returns a ready-to-use Authorization header.
 *
 * A token is minted by every call rather than cached, so a suite that moves the clock
 * forward (test/loans.overdue.test.ts jumps 14 days past a 1-hour token) can ask for a
 * header at the shifted instant and still get an unexpired one.
 */
export async function librarianAuthHeaders(): Promise<{ Authorization: string }> {
  const res = await request(app)
    .post('/auth/login')
    .send({ email: SEEDED_LIBRARIAN_EMAIL, password: SEEDED_LIBRARIAN_PASSWORD });

  expect(res.status).toBe(200);
  expect(typeof res.body.accessToken).toBe('string');

  return { Authorization: `Bearer ${res.body.accessToken}` };
}

/**
 * Registers (or re-registers) a member account and returns its Authorization header.
 * Registration goes through the public endpoint, so the account gets the member role and
 * a matching member record; a 409 means the account already exists for this email in the
 * current store state, in which case logging in is enough.
 */
export async function memberAuthHeaders(
  email: string = DEFAULT_MEMBER_EMAIL,
  password: string = DEFAULT_MEMBER_PASSWORD,
): Promise<{ Authorization: string }> {
  const registered = await request(app)
    .post('/auth/register')
    .send({ name: DEFAULT_MEMBER_NAME, email, password });

  expect([201, 409]).toContain(registered.status);

  const loggedIn = await request(app)
    .post('/auth/login')
    .send({ email, password });

  expect(loggedIn.status).toBe(200);
  expect(typeof loggedIn.body.accessToken).toBe('string');

  return { Authorization: `Bearer ${loggedIn.body.accessToken}` };
}
