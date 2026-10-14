import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { sign } from 'jsonwebtoken';
import app from '../src/app';
import { resetBookStore } from '../src/store/books';
import { resetMemberStore } from '../src/store/members';
import { resetLoanStore } from '../src/store/loans';
import { resetUserStore, findUserByEmail } from '../src/store/users';
import {
  JWT_SECRET,
  MIN_PASSWORD_LENGTH,
  SEEDED_LIBRARIAN_EMAIL,
  SEEDED_LIBRARIAN_PASSWORD,
} from '../src/auth/config';
import { loginAsSeededLibrarian } from './helpers/auth';

const validRegistration = {
  name: 'Alice Johnson',
  email: 'alice@example.com',
  password: 'password123',
};

function postRegister(payload: Record<string, unknown> = validRegistration) {
  return request(app).post('/auth/register').send(payload);
}

function postLogin(payload: Record<string, unknown>) {
  return request(app).post('/auth/login').send(payload);
}

function expectError(
  res: { status: number; body: unknown },
  status: number,
  code: string,
): void {
  expect(res.status).toBe(status);
  expect(res.body).toEqual({ error: { code, message: expect.any(String) } });
}

describe('Auth API', () => {
  beforeEach(() => {
    resetBookStore();
    resetMemberStore();
    resetLoanStore();
    resetUserStore();
  });

  describe('POST /auth/register', () => {
    it('creates a member account with the member role and a hashed password', async () => {
      const res = await postRegister();

      expect(res.status).toBe(201);
      expect(res.body).toEqual({
        id: expect.any(Number),
        name: validRegistration.name,
        email: validRegistration.email,
        role: 'member',
      });
      expect(res.body).not.toHaveProperty('passwordHash');

      const stored = findUserByEmail(validRegistration.email);
      expect(stored).toBeDefined();
      expect(stored!.passwordHash).not.toBe(validRegistration.password);
      expect(stored!.passwordHash).toMatch(/^\$2[aby]\$/);
    });

    it('rejects a duplicate email case-insensitively on the trimmed value', async () => {
      const first = await postRegister();
      expect(first.status).toBe(201);

      const res = await postRegister({
        ...validRegistration,
        email: '  Alice@Example.com  ',
      });

      expectError(res, 409, 'DUPLICATE_EMAIL');
    });

    it('rejects a missing password with a clear message', async () => {
      const res = await postRegister({
        name: validRegistration.name,
        email: validRegistration.email,
      });

      expectError(res, 400, 'INVALID_FIELDS');
      expect((res.body as { error: { message: string } }).error.message).toContain('password');
    });

    it('rejects a too-short password with a clear message', async () => {
      const res = await postRegister({
        ...validRegistration,
        password: 'a'.repeat(MIN_PASSWORD_LENGTH - 1),
      });

      expectError(res, 400, 'INVALID_FIELDS');
      expect((res.body as { error: { message: string } }).error.message).toContain('password');
    });
  });

  describe('POST /auth/login', () => {
    it('returns an access token for correct credentials', async () => {
      const res = await postLogin({
        email: SEEDED_LIBRARIAN_EMAIL,
        password: SEEDED_LIBRARIAN_PASSWORD,
      });

      expect(res.status).toBe(200);
      expect(typeof res.body.token).toBe('string');
      expect((res.body.token as string).length).toBeGreaterThan(0);
    });

    it('returns the same generic error for a wrong password and an unknown email', async () => {
      const wrongPassword = await postLogin({
        email: SEEDED_LIBRARIAN_EMAIL,
        password: 'wrong-password',
      });
      const unknownEmail = await postLogin({
        email: 'unknown@example.com',
        password: 'password123',
      });

      expect(wrongPassword.status).toBe(401);
      expect(unknownEmail.status).toBe(401);
      expect(wrongPassword.body).toEqual(unknownEmail.body);
      expect(wrongPassword.body).toEqual({
        error: { code: 'INVALID_CREDENTIALS', message: 'Invalid credentials.' },
      });
    });
  });

  describe('authorization enforcement', () => {
    it('keeps health, register, and login public', async () => {
      const health = await request(app).get('/health');
      const register = await postRegister();
      const login = await postLogin({
        email: SEEDED_LIBRARIAN_EMAIL,
        password: SEEDED_LIBRARIAN_PASSWORD,
      });

      expect(health.status).toBe(200);
      expect(health.body).toEqual({ status: 'ok' });
      expect(register.status).toBe(201);
      expect(login.status).toBe(200);
    });

    it('rejects protected endpoints when no token is provided', async () => {
      const books = await request(app).get('/books');
      expectError(books, 401, 'UNAUTHORIZED');

      const createBook = await request(app).post('/books').send({
        title: 'Test',
        author: 'Author',
        isbn: '978-0000000000',
        totalCopies: 1,
      });
      expectError(createBook, 401, 'UNAUTHORIZED');

      const members = await request(app).get('/members');
      expectError(members, 401, 'UNAUTHORIZED');

      const overdue = await request(app).get('/loans/overdue');
      expectError(overdue, 401, 'UNAUTHORIZED');
    });

    it('rejects a malformed token', async () => {
      const res = await request(app)
        .get('/books')
        .set('Authorization', 'Bearer not-a-jwt');
      expectError(res, 401, 'UNAUTHORIZED');

      const nonBearer = await request(app)
        .get('/books')
        .set('Authorization', 'Basic abc123');
      expectError(nonBearer, 401, 'UNAUTHORIZED');
    });

    it('rejects an expired token', async () => {
      const expiredToken = sign(
        { role: 'librarian' },
        JWT_SECRET,
        { algorithm: 'HS256', expiresIn: -1, subject: '1' },
      );

      const res = await request(app)
        .get('/books')
        .set('Authorization', `Bearer ${expiredToken}`);

      expectError(res, 401, 'UNAUTHORIZED');
    });
  });

  describe('librarian creation and seed', () => {
    it('keeps the seeded librarian available after a reset', async () => {
      resetUserStore();

      const res = await postLogin({
        email: SEEDED_LIBRARIAN_EMAIL,
        password: SEEDED_LIBRARIAN_PASSWORD,
      });

      expect(res.status).toBe(200);
      expect(typeof res.body.token).toBe('string');
    });

    it('allows a librarian to create another librarian', async () => {
      const token = await loginAsSeededLibrarian();

      const res = await request(app)
        .post('/auth/librarian')
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: 'New Librarian',
          email: 'new-librarian@example.com',
          password: 'password123',
        });

      expect(res.status).toBe(201);
      expect(res.body).toEqual({
        id: expect.any(Number),
        name: 'New Librarian',
        email: 'new-librarian@example.com',
        role: 'librarian',
      });
    });

    it('forbids a member from creating a librarian', async () => {
      const registered = await postRegister();
      expect(registered.status).toBe(201);

      const login = await postLogin({
        email: validRegistration.email,
        password: validRegistration.password,
      });
      expect(login.status).toBe(200);
      const memberToken = login.body.token as string;

      const res = await request(app)
        .post('/auth/librarian')
        .set('Authorization', `Bearer ${memberToken}`)
        .send({
          name: 'Attempted Librarian',
          email: 'attempted@example.com',
          password: 'password123',
        });

      expectError(res, 403, 'FORBIDDEN');
    });

    it('rejects librarian creation without a token', async () => {
      const res = await request(app).post('/auth/librarian').send({
        name: 'Anonymous Librarian',
        email: 'anonymous@example.com',
        password: 'password123',
      });

      expectError(res, 401, 'UNAUTHORIZED');
    });
  });
});
