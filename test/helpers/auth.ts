import request from 'supertest';
import { expect } from 'vitest';
import app from '../../src/app';
import { SEEDED_LIBRARIAN_EMAIL, SEEDED_LIBRARIAN_PASSWORD } from '../../src/auth/store';

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
