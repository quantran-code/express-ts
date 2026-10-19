import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../src/app';
import {
  SEEDED_LIBRARIAN_EMAIL,
  SEEDED_LIBRARIAN_PASSWORD,
  resetUsers,
} from '../src/auth/store';
import { readTokenTtlSeconds, signAccessToken } from '../src/auth/tokens';
import { MIN_PASSWORD_LENGTH } from '../src/auth/validation';
import { INVALID_CREDENTIALS_MESSAGE } from '../src/routes/auth';
import { resetBooks } from '../src/books/store';
import { resetLoans } from '../src/loans/store';
import { resetMembers } from '../src/members/store';

const validRegistration = {
  name: 'Ada Lovelace',
  email: 'ada@example.com',
  password: 'correct-horse',
};

const librarianRegistration = {
  name: 'Deputy Librarian',
  email: 'deputy@library.test',
  password: 'deputy-password',
  role: 'librarian',
};

beforeEach(() => {
  resetUsers();
  resetMembers();
  resetBooks();
  resetLoans();
});

function register(body: Record<string, unknown>) {
  return request(app).post('/auth/register').send(body);
}

function login(email: string, password: string) {
  return request(app).post('/auth/login').send({ email, password });
}

async function librarianAccessToken(): Promise<string> {
  const res = await login(SEEDED_LIBRARIAN_EMAIL, SEEDED_LIBRARIAN_PASSWORD);
  expect(res.status).toBe(200);
  return res.body.accessToken as string;
}

async function librarianHeaders(): Promise<{ Authorization: string }> {
  return { Authorization: `Bearer ${await librarianAccessToken()}` };
}

describe('POST /auth/register', () => {
  it('AC1: creates a member account and a matching member record', async () => {
    const res = await register(validRegistration);

    expect(res.status).toBe(201);
    expect(res.body.id).toEqual(expect.any(String));
    expect(res.body.id.length).toBeGreaterThan(0);
    expect(res.body.name).toBe('Ada Lovelace');
    expect(res.body.email).toBe('ada@example.com');
    expect(res.body.role).toBe('member');
    expect(res.body.memberId).toEqual(expect.any(String));
    expect(res.body.password).toBeUndefined();
    expect(res.body.passwordHash).toBeUndefined();

    const loggedIn = await login(validRegistration.email, validRegistration.password);
    expect(loggedIn.status).toBe(200);

    const members = await request(app)
      .get('/members')
      .set({ Authorization: `Bearer ${loggedIn.body.accessToken}` });
    expect(members.status).toBe(200);
    expect(members.body).toHaveLength(1);
    expect(members.body[0].email).toBe('ada@example.com');
    expect(members.body[0].id).toBe(res.body.memberId);
  });

  it('AC2: rejects a duplicate email that differs only by case and whitespace', async () => {
    const first = await register(validRegistration);
    expect(first.status).toBe(201);

    const second = await register({ ...validRegistration, email: '  ADA@Example.COM ' });

    expect(second.status).toBe(409);
    expect(second.body.error).toBeDefined();
    expect(second.body.passwordHash).toBeUndefined();

    const members = await request(app).get('/members').set(await librarianHeaders());
    expect(members.body).toHaveLength(1);
  });

  it('AC2: rejects a missing password and creates no account', async () => {
    const res = await register({ name: 'Ada Lovelace', email: 'ada@example.com' });

    expect(res.status).toBe(400);
    expect(res.body.errors.password).toBeDefined();

    const attemptedLogin = await login('ada@example.com', validRegistration.password);
    expect(attemptedLogin.status).toBe(401);
    expect(attemptedLogin.body.error).toBe(INVALID_CREDENTIALS_MESSAGE);
  });

  it('AC2: rejects a password shorter than the minimum and creates no account', async () => {
    const res = await register({
      ...validRegistration,
      password: 'a'.repeat(MIN_PASSWORD_LENGTH - 1),
    });

    expect(res.status).toBe(400);
    expect(res.body.errors.password).toBeDefined();

    const attemptedLogin = await login('ada@example.com', 'a'.repeat(MIN_PASSWORD_LENGTH - 1));
    expect(attemptedLogin.status).toBe(401);

    const accepted = await register({
      ...validRegistration,
      password: 'a'.repeat(MIN_PASSWORD_LENGTH),
    });
    expect(accepted.status).toBe(201);
    expect(accepted.body.role).toBe('member');
  });

  it('rejects a malformed email', async () => {
    const res = await register({ ...validRegistration, email: 'ada-at-example' });

    expect(res.status).toBe(400);
    expect(res.body.errors.email).toBeDefined();
  });

  it('rejects an unknown role', async () => {
    const res = await register({ ...validRegistration, role: 'admin' });

    expect(res.status).toBe(400);
    expect(res.body.errors.role).toBeDefined();
  });
});

describe('POST /auth/login', () => {
  it('AC3: returns an access token that unlocks a protected endpoint', async () => {
    const registered = await register(validRegistration);
    expect(registered.status).toBe(201);

    const res = await login(validRegistration.email, validRegistration.password);

    expect(res.status).toBe(200);
    expect(typeof res.body.accessToken).toBe('string');
    expect(res.body.accessToken.length).toBeGreaterThan(0);
    expect(res.body.tokenType).toBe('Bearer');
    expect(res.body.expiresIn).toBe(readTokenTtlSeconds());
    expect(res.body.password).toBeUndefined();
    expect(res.body.passwordHash).toBeUndefined();

    const books = await request(app)
      .get('/books')
      .set({ Authorization: `Bearer ${res.body.accessToken}` });
    expect(books.status).toBe(200);
    expect(books.body).toEqual([]);
  });

  it('AC3: wrong password and unknown email fail identically with the generic message', async () => {
    await register(validRegistration);

    const wrongPassword = await login(validRegistration.email, 'wrong-password');
    const unknownEmail = await login('nobody@example.com', validRegistration.password);

    expect(wrongPassword.status).toBe(401);
    expect(unknownEmail.status).toBe(401);
    expect(wrongPassword.body.error).toBe(INVALID_CREDENTIALS_MESSAGE);
    expect(unknownEmail.body.error).toBe(INVALID_CREDENTIALS_MESSAGE);
    expect(JSON.stringify(wrongPassword.body)).toBe(JSON.stringify(unknownEmail.body));
  });

  it('rejects a body missing a credential', async () => {
    const missingPassword = await login(validRegistration.email, '');
    expect(missingPassword.status).toBe(400);
    expect(missingPassword.body.errors.password).toBeDefined();

    const missingEmail = await request(app)
      .post('/auth/login')
      .send({ password: validRegistration.password });
    expect(missingEmail.status).toBe(400);
    expect(missingEmail.body.errors.email).toBeDefined();
  });
});

describe('session enforcement', () => {
  const protectedCalls = [
    {
      label: 'GET /books',
      send: (headers: Record<string, string>) => request(app).get('/books').set(headers),
    },
    {
      label: 'GET /members',
      send: (headers: Record<string, string>) => request(app).get('/members').set(headers),
    },
    {
      label: 'GET /loans/overdue',
      send: (headers: Record<string, string>) => request(app).get('/loans/overdue').set(headers),
    },
    {
      label: 'POST /books',
      send: (headers: Record<string, string>) =>
        request(app)
          .post('/books')
          .set(headers)
          .send({
            title: 'Dune',
            author: 'Frank Herbert',
            isbn: '978-0-441-17271-9',
            totalCopies: 1,
          }),
    },
    {
      label: 'POST /members',
      send: (headers: Record<string, string>) =>
        request(app)
          .post('/members')
          .set(headers)
          .send({ name: 'Alan Turing', email: 'alan@example.com' }),
    },
    {
      label: 'POST /loans',
      send: (headers: Record<string, string>) =>
        request(app)
          .post('/loans')
          .send({ bookId: 'missing-book', memberId: 'missing-member' })
          .set(headers),
    },
  ];

  it('AC4: rejects every protected endpoint without a valid, unexpired token', async () => {
    const registered = await register(validRegistration);
    expect(registered.status).toBe(201);

    const expiredToken = signAccessToken(
      { id: 'expired-user', email: 'expired@example.com', role: 'member', memberId: null },
      -10,
    );

    const unauthenticatedHeaders: Array<Record<string, string>> = [
      {},
      { Authorization: 'Bearer not-a-real-token' },
      { Authorization: `Bearer ${expiredToken}` },
      { Authorization: 'Basic not-a-bearer-token' },
      { Authorization: 'Bearer ' },
    ];

    for (const headers of unauthenticatedHeaders) {
      for (const { label, send } of protectedCalls) {
        const res = await send(headers);

        expect(res.status, `${label} with headers ${JSON.stringify(headers)}`).toBe(401);
        expect(res.body.error).toBeDefined();
      }
    }

    const librarian = await librarianHeaders();
    const books = await request(app).get('/books').set(librarian);
    expect(books.body).toEqual([]);

    const members = await request(app).get('/members').set(librarian);
    expect(members.body).toHaveLength(1);
    expect(members.body[0].email).toBe('ada@example.com');

    const overdue = await request(app).get('/loans/overdue').set(librarian);
    expect(overdue.body).toEqual([]);
  });

  it('AC4: register, login and the health check succeed with no Authorization header', async () => {
    const health = await request(app).get('/health');
    expect(health.status).toBe(200);
    expect(health.body).toEqual({ status: 'ok' });

    const registered = await request(app).post('/auth/register').send(validRegistration);
    expect(registered.status).toBe(201);

    const loggedIn = await request(app)
      .post('/auth/login')
      .send({ email: validRegistration.email, password: validRegistration.password });
    expect(loggedIn.status).toBe(200);
    expect(typeof loggedIn.body.accessToken).toBe('string');

    // A bad password is a credentials failure, not a missing-session rejection.
    const badLogin = await request(app)
      .post('/auth/login')
      .send({ email: validRegistration.email, password: 'wrong-password' });
    expect(badLogin.status).toBe(401);
    expect(badLogin.body.error).toBe(INVALID_CREDENTIALS_MESSAGE);
  });

  it('AC4: an expired token stops working with no state change', async () => {
    const headers = await librarianHeaders();
    const books = await request(app).get('/books').set(headers);
    expect(books.status).toBe(200);

    const expiredToken = signAccessToken(
      { id: 'expired-user', email: 'expired@example.com', role: 'librarian', memberId: null },
      -1,
    );

    const res = await request(app)
      .get('/books')
      .set({ Authorization: `Bearer ${expiredToken}` });
    expect(res.status).toBe(401);
    expect(res.body.error).toBeDefined();
  });
});

describe('librarian escalation', () => {
  it('AC5: a librarian account is seeded ahead of time and can log in', async () => {
    const res = await login(SEEDED_LIBRARIAN_EMAIL, SEEDED_LIBRARIAN_PASSWORD);

    expect(res.status).toBe(200);
    expect(typeof res.body.accessToken).toBe('string');

    const books = await request(app)
      .get('/books')
      .set({ Authorization: `Bearer ${res.body.accessToken}` });
    expect(books.status).toBe(200);
  });

  it('AC5: the seeded librarian survives a store reset', async () => {
    resetUsers();

    const duplicate = await register({
      name: 'Impostor',
      email: SEEDED_LIBRARIAN_EMAIL,
      password: 'impostor-password',
    });
    expect(duplicate.status).toBe(409);

    const res = await login(SEEDED_LIBRARIAN_EMAIL, SEEDED_LIBRARIAN_PASSWORD);
    expect(res.status).toBe(200);
  });

  it('AC5: rejects role=librarian without a session or with a member session', async () => {
    const anonymous = await register(librarianRegistration);
    expect(anonymous.status).toBe(403);
    expect(anonymous.body.error).toBeDefined();

    const notCreated = await login(librarianRegistration.email, librarianRegistration.password);
    expect(notCreated.status).toBe(401);

    const member = await register(validRegistration);
    expect(member.status).toBe(201);

    const memberLogin = await login(validRegistration.email, validRegistration.password);
    expect(memberLogin.status).toBe(200);

    const asMember = await request(app)
      .post('/auth/register')
      .set({ Authorization: `Bearer ${memberLogin.body.accessToken}` })
      .send(librarianRegistration);
    expect(asMember.status).toBe(403);
    expect(asMember.body.error).toBeDefined();

    const stillNotCreated = await login(librarianRegistration.email, librarianRegistration.password);
    expect(stillNotCreated.status).toBe(401);
  });

  it('AC5: a logged-in librarian creates another librarian account that can log in', async () => {
    const librarian = await librarianHeaders();

    const created = await request(app)
      .post('/auth/register')
      .set(librarian)
      .send(librarianRegistration);

    expect(created.status).toBe(201);
    expect(created.body.role).toBe('librarian');
    expect(created.body.email).toBe(librarianRegistration.email);
    expect(created.body.passwordHash).toBeUndefined();
    expect(created.body.password).toBeUndefined();

    const newLibrarianLogin = await login(
      librarianRegistration.email,
      librarianRegistration.password,
    );
    expect(newLibrarianLogin.status).toBe(200);
    expect(typeof newLibrarianLogin.body.accessToken).toBe('string');

    const promoted = await request(app)
      .post('/auth/register')
      .set({ Authorization: `Bearer ${newLibrarianLogin.body.accessToken}` })
      .send({ ...librarianRegistration, name: 'Second Deputy', email: 'deputy2@library.test' });
    expect(promoted.status).toBe(201);
    expect(promoted.body.role).toBe('librarian');
  });
});
