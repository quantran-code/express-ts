import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../src/app';
import type { Book } from '../src/books/types';
import type { Loan } from '../src/loans/types';
import type { Member } from '../src/members/types';
import { resetBooks } from '../src/books/store';
import { listLoans, resetLoans } from '../src/loans/store';
import { resetMembers } from '../src/members/store';
import { librarianAuthHeaders } from './helpers/auth';

const validMember = {
  name: 'Ada Lovelace',
  email: 'ada@example.com',
};

let authHeader: { Authorization: string };

beforeEach(async () => {
  resetBooks();
  resetMembers();
  resetLoans();
  authHeader = await librarianAuthHeaders();
});

async function createTestMember(overrides: Partial<typeof validMember> = {}): Promise<Member> {
  const res = await request(app)
    .post('/members')
    .set(authHeader)
    .send({ ...validMember, ...overrides });

  expect(res.status).toBe(201);
  return res.body as Member;
}

async function createTestBook(overrides: Partial<{
  title: string;
  author: string;
  isbn: string;
  totalCopies: number;
}> = {}): Promise<Book> {
  const res = await request(app)
    .post('/books')
    .set(authHeader)
    .send({
      title: 'Dune',
      author: 'Frank Herbert',
      isbn: '978-0-441-17271-9',
      totalCopies: 1,
      ...overrides,
    });

  expect(res.status).toBe(201);
  return res.body as Book;
}

/**
 * Active loans are seeded through the real borrow endpoint so the fixtures prove the
 * member and loan endpoints work together rather than injecting store state.
 */
async function borrowForTest(memberId: string, bookId: string): Promise<Loan> {
  const res = await request(app)
    .post('/loans')
    .set(authHeader)
    .send({ bookId, memberId });

  expect(res.status).toBe(201);
  return res.body as Loan;
}

describe('POST /members', () => {
  it('creates a member with a generated id and a normalised email', async () => {
    const res = await request(app)
      .post('/members')
      .set(authHeader)
      .send({ name: '  Ada Lovelace ', email: '  Ada@Example.COM ' });

    expect(res.status).toBe(201);
    expect(res.body.name).toBe('Ada Lovelace');
    expect(res.body.email).toBe('ada@example.com');
    expect(typeof res.body.id).toBe('string');
    expect(res.body.id.length).toBeGreaterThan(0);

    const list = await request(app).get('/members').set(authHeader);
    expect(list.status).toBe(200);
    expect(list.body).toHaveLength(1);
    expect(list.body[0].id).toBe(res.body.id);
  });

  it('rejects a body without name', async () => {
    const res = await request(app)
      .post('/members')
      .set(authHeader)
      .send({ email: 'ada@example.com' });

    expect(res.status).toBe(400);
    expect(res.body.errors.name).toBeDefined();

    const list = await request(app).get('/members').set(authHeader);
    expect(list.body).toHaveLength(0);
  });

  it('rejects a body without email', async () => {
    const res = await request(app)
      .post('/members')
      .set(authHeader)
      .send({ name: 'Ada Lovelace' });

    expect(res.status).toBe(400);
    expect(res.body.errors.email).toBeDefined();
  });

  it('rejects a malformed email', async () => {
    const res = await request(app)
      .post('/members')
      .set(authHeader)
      .send({ name: 'Ada Lovelace', email: 'ada-at-example' });

    expect(res.status).toBe(400);
    expect(res.body.errors.email).toBeDefined();

    const list = await request(app).get('/members').set(authHeader);
    expect(list.body).toHaveLength(0);
  });

  it('rejects an email that is already in use, ignoring case and whitespace', async () => {
    await createTestMember({ email: 'ada@example.com' });

    const res = await request(app)
      .post('/members')
      .set(authHeader)
      .send({ name: 'Ada Again', email: '  ADA@Example.com ' });

    expect(res.status).toBe(409);
    expect(res.body.error).toBeDefined();

    const list = await request(app).get('/members').set(authHeader);
    expect(list.body).toHaveLength(1);
    expect(list.body[0].email).toBe('ada@example.com');
  });
});

describe('GET /members', () => {
  it('returns an empty array when no members exist', async () => {
    const res = await request(app).get('/members').set(authHeader);

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('returns every member', async () => {
    await createTestMember({ name: 'Ada Lovelace', email: 'ada@example.com' });
    await createTestMember({ name: 'Alan Turing', email: 'alan@example.com' });

    const res = await request(app).get('/members').set(authHeader);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    const names = res.body.map((member: Member) => member.name).sort();
    expect(names).toEqual(['Ada Lovelace', 'Alan Turing']);
  });
});

describe('GET /members/:id', () => {
  it('returns the matching member', async () => {
    const created = await createTestMember();

    const res = await request(app).get(`/members/${created.id}`).set(authHeader);

    expect(res.status).toBe(200);
    expect(res.body).toEqual(created);
  });

  it('returns 404 for an id that does not exist', async () => {
    const res = await request(app)
      .get('/members/2b3c4d5e-0000-0000-0000-000000000000')
      .set(authHeader);

    expect(res.status).toBe(404);
    expect(res.body.error).toBeDefined();
  });
});

describe('PUT /members/:id', () => {
  it('saves a changed name and email', async () => {
    const created = await createTestMember();

    const res = await request(app)
      .put(`/members/${created.id}`)
      .set(authHeader)
      .send({ name: 'Ada King', email: 'ada.king@example.com' });

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(created.id);
    expect(res.body.name).toBe('Ada King');
    expect(res.body.email).toBe('ada.king@example.com');

    const stored = await request(app).get(`/members/${created.id}`).set(authHeader);
    expect(stored.body).toEqual(res.body);
  });

  it('rejects a body missing a required field and leaves the member unchanged', async () => {
    const created = await createTestMember();

    const res = await request(app)
      .put(`/members/${created.id}`)
      .set(authHeader)
      .send({ name: 'Ada King' });

    expect(res.status).toBe(400);
    expect(res.body.errors.email).toBeDefined();

    const stored = await request(app).get(`/members/${created.id}`).set(authHeader);
    expect(stored.body).toEqual(created);
  });

  it('returns 409 when the email belongs to another member and leaves both unchanged', async () => {
    const first = await createTestMember({ name: 'Ada Lovelace', email: 'ada@example.com' });
    const second = await createTestMember({ name: 'Alan Turing', email: 'alan@example.com' });

    const res = await request(app)
      .put(`/members/${second.id}`)
      .set(authHeader)
      .send({ name: 'Alan Turing', email: ' ADA@Example.com ' });

    expect(res.status).toBe(409);
    expect(res.body.error).toBeDefined();

    const storedFirst = await request(app).get(`/members/${first.id}`).set(authHeader);
    const storedSecond = await request(app).get(`/members/${second.id}`).set(authHeader);
    expect(storedFirst.body.email).toBe('ada@example.com');
    expect(storedSecond.body.email).toBe('alan@example.com');
  });

  it('allows the member to keep its own email', async () => {
    const created = await createTestMember();

    const res = await request(app)
      .put(`/members/${created.id}`)
      .set(authHeader)
      .send({ name: 'Ada King', email: 'ada@example.com' });

    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Ada King');
    expect(res.body.email).toBe('ada@example.com');
  });

  it('returns 404 for an unknown id', async () => {
    const res = await request(app)
      .put('/members/2b3c4d5e-0000-0000-0000-000000000000')
      .set(authHeader)
      .send(validMember);

    expect(res.status).toBe(404);
    expect(res.body.error).toBeDefined();
  });
});

describe('PATCH /members/:id', () => {
  it('updates only the supplied field', async () => {
    const created = await createTestMember();

    const res = await request(app)
      .patch(`/members/${created.id}`)
      .set(authHeader)
      .send({ name: 'Ada King' });

    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Ada King');
    expect(res.body.email).toBe(created.email);
  });

  it('accepts an empty patch and changes nothing', async () => {
    const created = await createTestMember();

    const res = await request(app).patch(`/members/${created.id}`).set(authHeader).send({});

    expect(res.status).toBe(200);
    expect(res.body).toEqual(created);
  });

  it('returns 409 when the email belongs to another member and leaves the member unchanged', async () => {
    const first = await createTestMember({ name: 'Ada Lovelace', email: 'ada@example.com' });
    const second = await createTestMember({ name: 'Alan Turing', email: 'alan@example.com' });

    const res = await request(app)
      .patch(`/members/${second.id}`)
      .set(authHeader)
      .send({ email: 'ada@example.com' });

    expect(res.status).toBe(409);
    expect(res.body.error).toBeDefined();

    const storedFirst = await request(app).get(`/members/${first.id}`).set(authHeader);
    const storedSecond = await request(app).get(`/members/${second.id}`).set(authHeader);
    expect(storedFirst.body.email).toBe('ada@example.com');
    expect(storedSecond.body).toEqual(second);
  });

  it('rejects an invalid email and leaves the member unchanged', async () => {
    const created = await createTestMember();

    const res = await request(app)
      .patch(`/members/${created.id}`)
      .set(authHeader)
      .send({ email: 'not-an-email' });

    expect(res.status).toBe(400);
    expect(res.body.errors.email).toBeDefined();

    const stored = await request(app).get(`/members/${created.id}`).set(authHeader);
    expect(stored.body).toEqual(created);
  });

  it('returns 404 for an unknown id', async () => {
    const res = await request(app)
      .patch('/members/2b3c4d5e-0000-0000-0000-000000000000')
      .set(authHeader)
      .send({ name: 'Ada King' });

    expect(res.status).toBe(404);
    expect(res.body.error).toBeDefined();
  });
});

describe('DELETE /members/:id', () => {
  it('deletes a member with no active loans', async () => {
    const created = await createTestMember();

    const res = await request(app).delete(`/members/${created.id}`).set(authHeader);

    expect(res.status).toBe(204);

    const stored = await request(app).get(`/members/${created.id}`).set(authHeader);
    expect(stored.status).toBe(404);
  });

  it('returns 409 while the member has an active loan', async () => {
    const member = await createTestMember();
    const book = await createTestBook();
    await borrowForTest(member.id, book.id);

    const res = await request(app).delete(`/members/${member.id}`).set(authHeader);

    expect(res.status).toBe(409);
    expect(res.body.error).toBeDefined();

    const stillThere = await request(app).get(`/members/${member.id}`).set(authHeader);
    expect(stillThere.status).toBe(200);
    expect(stillThere.body).toEqual(member);
  });

  it('leaves already returned loans in place after a hard delete', async () => {
    const member = await createTestMember();
    const book = await createTestBook();
    const loan = await borrowForTest(member.id, book.id);

    const returned = await request(app).patch(`/loans/${loan.id}/return`).set(authHeader);
    expect(returned.status).toBe(200);
    expect(returned.body.returnedAt).not.toBeNull();

    const deleted = await request(app).delete(`/members/${member.id}`).set(authHeader);
    expect(deleted.status).toBe(204);

    const history = listLoans().filter((stored) => stored.memberId === member.id);
    expect(history).toHaveLength(1);
    expect(history[0].id).toBe(loan.id);
    expect(history[0].returnedAt).not.toBeNull();
  });

  it('returns 404 for an unknown id', async () => {
    const res = await request(app)
      .delete('/members/2b3c4d5e-0000-0000-0000-000000000000')
      .set(authHeader);

    expect(res.status).toBe(404);
    expect(res.body.error).toBeDefined();
  });
});

describe('GET /members/:id/loans', () => {
  it('returns 404 for an unknown member id', async () => {
    const res = await request(app)
      .get('/members/2b3c4d5e-0000-0000-0000-000000000000/loans')
      .set(authHeader);

    expect(res.status).toBe(404);
    expect(res.body.error).toBeDefined();
  });
});
