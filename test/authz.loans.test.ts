import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../src/app';
import { resetUsers } from '../src/auth/store';
import type { Book } from '../src/books/types';
import { resetBooks } from '../src/books/store';
import type { Loan } from '../src/loans/types';
import { resetLoans } from '../src/loans/store';
import type { Member } from '../src/members/types';
import { resetMembers } from '../src/members/store';
import { librarianAuthHeaders, memberAuthHeaders } from './helpers/auth';

const SELF_EMAIL = 'self@example.com';
const SELF_PASSWORD = 'self-password';
const OTHER_MEMBER = { name: 'Other Person', email: 'other@example.com' };

/**
 * The catalog rejects duplicate ISBNs, so every TEST book gets its own isbn.
 */
let isbnSuffix = 0;

let librarian: { Authorization: string };

beforeEach(async () => {
  resetUsers();
  resetMembers();
  resetBooks();
  resetLoans();
  librarian = await librarianAuthHeaders();
});

async function createMemberAsLibrarian(name: string, email: string): Promise<Member> {
  const res = await request(app).post('/members').set(librarian).send({ name, email });

  expect(res.status).toBe(201);
  return res.body as Member;
}

/**
 * The caller's own member record, read through GET /members: a member only ever sees
 * themselves there, so this yields the token's memberId without decoding the token.
 */
async function ownMember(auth: { Authorization: string }): Promise<Member> {
  const res = await request(app).get('/members').set(auth);

  expect(res.status).toBe(200);
  expect(res.body).toHaveLength(1);
  return res.body[0] as Member;
}

async function createBookAsLibrarian(title = 'Dune'): Promise<Book> {
  isbnSuffix += 1;

  const res = await request(app).post('/books').set(librarian).send({
    title,
    author: 'Frank Herbert',
    isbn: `978-0-441-1727-${isbnSuffix}`,
    totalCopies: 2,
  });

  expect(res.status).toBe(201);
  return res.body as Book;
}

async function borrowAsLibrarian(memberId: string, bookId: string): Promise<Loan> {
  const res = await request(app).post('/loans').set(librarian).send({ bookId, memberId });

  expect(res.status).toBe(201);
  return res.body as Loan;
}

async function activeLoansOf(memberId: string): Promise<Loan[]> {
  const res = await request(app).get(`/members/${memberId}/loans`).set(librarian);

  expect(res.status).toBe(200);
  return res.body as Loan[];
}

describe('AC2/AC3: borrow and return identity', () => {
  it('AC2: a member borrow with a foreign memberId is ignored in favour of the token', async () => {
    const member = await memberAuthHeaders(SELF_EMAIL, SELF_PASSWORD);
    const self = await ownMember(member);
    const other = await createMemberAsLibrarian(OTHER_MEMBER.name, OTHER_MEMBER.email);
    const book = await createBookAsLibrarian();

    const res = await request(app)
      .post('/loans')
      .set(member)
      .send({ bookId: book.id, memberId: other.id });

    expect(res.status).toBe(201);
    expect(res.body.bookId).toBe(book.id);
    expect(res.body.memberId).toBe(self.id);
    expect(res.body.memberId).not.toBe(other.id);

    expect(await activeLoansOf(other.id)).toEqual([]);
    const ownLoans = await activeLoansOf(self.id);
    expect(ownLoans).toHaveLength(1);
    expect(ownLoans[0].id).toBe(res.body.id);
  });

  it('AC2: a member borrow without memberId is recorded against the caller', async () => {
    const member = await memberAuthHeaders(SELF_EMAIL, SELF_PASSWORD);
    const self = await ownMember(member);
    const book = await createBookAsLibrarian();

    const res = await request(app).post('/loans').set(member).send({ bookId: book.id });

    expect(res.status).toBe(201);
    expect(res.body.memberId).toBe(self.id);

    const ownLoans = await activeLoansOf(self.id);
    expect(ownLoans).toHaveLength(1);
    expect(ownLoans[0].id).toBe(res.body.id);
  });

  it('AC2: a member can return their own loan', async () => {
    const member = await memberAuthHeaders(SELF_EMAIL, SELF_PASSWORD);
    await ownMember(member);
    const book = await createBookAsLibrarian();

    const borrowed = await request(app).post('/loans').set(member).send({ bookId: book.id });
    expect(borrowed.status).toBe(201);

    const res = await request(app).patch(`/loans/${borrowed.body.id}/return`).set(member);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(borrowed.body.id);
    expect(typeof res.body.returnedAt).toBe('string');
    expect(res.body.returnedAt).not.toBeNull();
  });

  it('AC3: a librarian borrows and returns on behalf of an explicit member id', async () => {
    const other = await createMemberAsLibrarian(OTHER_MEMBER.name, OTHER_MEMBER.email);
    const book = await createBookAsLibrarian();

    const borrowed = await borrowAsLibrarian(other.id, book.id);
    expect(borrowed.memberId).toBe(other.id);
    expect(borrowed.bookId).toBe(book.id);

    const returned = await request(app)
      .patch(`/loans/${borrowed.id}/return`)
      .set(librarian);

    expect(returned.status).toBe(200);
    expect(returned.body.id).toBe(borrowed.id);
    expect(typeof returned.body.returnedAt).toBe('string');
  });

  it('AC3: a librarian borrow without memberId is still a validation error', async () => {
    const book = await createBookAsLibrarian();

    const missing = await request(app).post('/loans').set(librarian).send({ bookId: book.id });
    expect(missing.status).toBe(400);
    expect(missing.body.errors.memberId).toBeDefined();

    const unknown = await request(app)
      .post('/loans')
      .set(librarian)
      .send({ bookId: book.id, memberId: '2b3c4d5e-0000-0000-0000-000000000000' });
    expect(unknown.status).toBe(404);
    expect(unknown.body.error).toBeDefined();
  });

  it('AC2: a member cannot return another member loan', async () => {
    const member = await memberAuthHeaders(SELF_EMAIL, SELF_PASSWORD);
    await ownMember(member);
    const other = await createMemberAsLibrarian(OTHER_MEMBER.name, OTHER_MEMBER.email);
    const book = await createBookAsLibrarian();
    const loan = await borrowAsLibrarian(other.id, book.id);

    const before = await request(app).get(`/books/${book.id}`).set(librarian);
    expect(before.body.availableCopies).toBe(1);

    const res = await request(app).patch(`/loans/${loan.id}/return`).set(member);

    expect(res.status).toBe(403);
    expect(res.body.error).toBeDefined();

    const stored = await activeLoansOf(other.id);
    expect(stored).toHaveLength(1);
    expect(stored[0].id).toBe(loan.id);
    expect(stored[0].returnedAt).toBeNull();

    const after = await request(app).get(`/books/${book.id}`).set(librarian);
    expect(after.body.availableCopies).toBe(1);
  });
});
