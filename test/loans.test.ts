import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../src/app';
import type { Book } from '../src/books/types';
import type { Loan } from '../src/loans/types';
import type { Member } from '../src/members/types';
import { resetBooks } from '../src/books/store';
import { resetLoans } from '../src/loans/store';
import { resetMembers } from '../src/members/store';
import { librarianAuthHeaders } from './helpers/auth';

const validMember = {
  name: 'Ada Lovelace',
  email: 'ada@example.com',
};

/**
 * The catalog rejects duplicate ISBNs, so every TEST book gets its own isbn.
 */
let isbnSuffix = 0;

let authHeader: { Authorization: string };

beforeEach(async () => {
  resetBooks();
  resetMembers();
  resetLoans();
  authHeader = await librarianAuthHeaders();
});

async function createTestBook(overrides: Partial<{
  title: string;
  author: string;
  isbn: string;
  totalCopies: number;
}> = {}): Promise<Book> {
  isbnSuffix += 1;

  const res = await request(app)
    .post('/books')
    .set(authHeader)
    .send({
      title: 'Dune',
      author: 'Frank Herbert',
      isbn: `978-0-441-1727-${isbnSuffix}`,
      totalCopies: 1,
      ...overrides,
    });

  expect(res.status).toBe(201);
  return res.body as Book;
}

async function createTestMember(overrides: Partial<typeof validMember> = {}): Promise<Member> {
  const res = await request(app)
    .post('/members')
    .set(authHeader)
    .send({ ...validMember, ...overrides });

  expect(res.status).toBe(201);
  return res.body as Member;
}

/**
 * Availability is asserted through the public book endpoint rather than the store,
 * so the tests prove the HTTP contract the acceptance criteria describe.
 */
async function availableCopiesOf(bookId: string): Promise<number> {
  const res = await request(app).get(`/books/${bookId}`).set(authHeader);

  expect(res.status).toBe(200);
  return res.body.availableCopies as number;
}

async function activeLoansOf(memberId: string): Promise<Loan[]> {
  const res = await request(app).get(`/members/${memberId}/loans`).set(authHeader);

  expect(res.status).toBe(200);
  return res.body as Loan[];
}

async function borrowForTest(memberId: string, bookId: string): Promise<Loan> {
  const res = await request(app)
    .post('/loans')
    .set(authHeader)
    .send({ bookId, memberId });

  expect(res.status).toBe(201);
  return res.body as Loan;
}

describe('POST /loans', () => {
  it('creates a loan and decrements availableCopies', async () => {
    const book = await createTestBook({ totalCopies: 2 });
    const member = await createTestMember();

    const res = await request(app)
      .post('/loans')
      .set(authHeader)
      .send({ bookId: book.id, memberId: member.id });

    expect(res.status).toBe(201);
    expect(typeof res.body.id).toBe('string');
    expect(res.body.id.length).toBeGreaterThan(0);
    expect(res.body.bookId).toBe(book.id);
    expect(res.body.memberId).toBe(member.id);
    expect(res.body.returnedAt).toBeNull();
    expect(typeof res.body.borrowedAt).toBe('string');
    expect(Number.isNaN(Date.parse(res.body.borrowedAt))).toBe(false);

    expect(await availableCopiesOf(book.id)).toBe(1);
  });

  it('rejects borrowing when no copies are available and changes nothing', async () => {
    const book = await createTestBook({ totalCopies: 1 });
    const holder = await createTestMember({ name: 'Ada Lovelace', email: 'ada@example.com' });
    const other = await createTestMember({ name: 'Alan Turing', email: 'alan@example.com' });

    await borrowForTest(holder.id, book.id);
    expect(await availableCopiesOf(book.id)).toBe(0);

    const res = await request(app)
      .post('/loans')
      .set(authHeader)
      .send({ bookId: book.id, memberId: other.id });

    expect(res.status).toBe(409);
    expect(res.body.error).toBeDefined();

    expect(await availableCopiesOf(book.id)).toBe(0);
    expect(await activeLoansOf(other.id)).toHaveLength(0);
  });

  it('rejects a duplicate active loan for the same book and changes nothing', async () => {
    const book = await createTestBook({ totalCopies: 2 });
    const member = await createTestMember();

    const first = await borrowForTest(member.id, book.id);
    expect(await availableCopiesOf(book.id)).toBe(1);

    const res = await request(app)
      .post('/loans')
      .set(authHeader)
      .send({ bookId: book.id, memberId: member.id });

    expect(res.status).toBe(409);
    expect(res.body.error).toBeDefined();

    expect(await availableCopiesOf(book.id)).toBe(1);
    const active = await activeLoansOf(member.id);
    expect(active).toHaveLength(1);
    expect(active[0].id).toBe(first.id);
  });

  it('rejects a fourth active loan and allows it once one is returned', async () => {
    const member = await createTestMember();
    const first = await createTestBook({ title: 'Book 1', totalCopies: 1 });
    const second = await createTestBook({ title: 'Book 2', totalCopies: 1 });
    const third = await createTestBook({ title: 'Book 3', totalCopies: 1 });
    const fourth = await createTestBook({ title: 'Book 4', totalCopies: 1 });

    const firstLoan = await borrowForTest(member.id, first.id);
    await borrowForTest(member.id, second.id);
    await borrowForTest(member.id, third.id);

    const rejected = await request(app)
      .post('/loans')
      .set(authHeader)
      .send({ bookId: fourth.id, memberId: member.id });

    expect(rejected.status).toBe(409);
    expect(rejected.body.error).toBeDefined();
    expect(rejected.body.error).toContain('3');

    expect(await availableCopiesOf(fourth.id)).toBe(1);
    expect(await activeLoansOf(member.id)).toHaveLength(3);

    const returned = await request(app).patch(`/loans/${firstLoan.id}/return`).set(authHeader);
    expect(returned.status).toBe(200);

    const accepted = await request(app)
      .post('/loans')
      .set(authHeader)
      .send({ bookId: fourth.id, memberId: member.id });

    expect(accepted.status).toBe(201);
    expect(accepted.body.bookId).toBe(fourth.id);
    expect(await availableCopiesOf(fourth.id)).toBe(0);
  });

  it('returns 404 for an unknown bookId', async () => {
    const member = await createTestMember();

    const res = await request(app)
      .post('/loans')
      .set(authHeader)
      .send({ bookId: '2b3c4d5e-0000-0000-0000-000000000000', memberId: member.id });

    expect(res.status).toBe(404);
    expect(res.body.error).toBeDefined();

    expect(await activeLoansOf(member.id)).toHaveLength(0);
  });

  it('returns 404 for an unknown memberId and leaves the book untouched', async () => {
    const book = await createTestBook({ totalCopies: 2 });

    const res = await request(app)
      .post('/loans')
      .set(authHeader)
      .send({ bookId: book.id, memberId: '2b3c4d5e-0000-0000-0000-000000000000' });

    expect(res.status).toBe(404);
    expect(res.body.error).toBeDefined();

    expect(await availableCopiesOf(book.id)).toBe(2);
  });

  it('rejects a body missing an id', async () => {
    const member = await createTestMember();
    const book = await createTestBook();

    const missingBook = await request(app)
      .post('/loans')
      .set(authHeader)
      .send({ memberId: member.id });
    expect(missingBook.status).toBe(400);
    expect(missingBook.body.errors.bookId).toBeDefined();

    const missingMember = await request(app)
      .post('/loans')
      .set(authHeader)
      .send({ bookId: book.id });
    expect(missingMember.status).toBe(400);
    expect(missingMember.body.errors.memberId).toBeDefined();

    expect(await availableCopiesOf(book.id)).toBe(1);
    expect(await activeLoansOf(member.id)).toHaveLength(0);
  });

  it('keeps availableCopies correct across a borrow, return and borrow sequence', async () => {
    const book = await createTestBook({ totalCopies: 2 });
    const member = await createTestMember();

    const first = await borrowForTest(member.id, book.id);
    expect(await availableCopiesOf(book.id)).toBe(1);

    const firstReturn = await request(app).patch(`/loans/${first.id}/return`).set(authHeader);
    expect(firstReturn.status).toBe(200);
    expect(await availableCopiesOf(book.id)).toBe(2);

    const second = await borrowForTest(member.id, book.id);
    expect(second.id).not.toBe(first.id);
    expect(await availableCopiesOf(book.id)).toBe(1);

    const secondReturn = await request(app).patch(`/loans/${second.id}/return`).set(authHeader);
    expect(secondReturn.status).toBe(200);
    expect(await availableCopiesOf(book.id)).toBe(2);
  });
});

describe('PATCH /loans/:id/return', () => {
  it('sets returnedAt and increments availableCopies by one', async () => {
    const book = await createTestBook({ totalCopies: 3 });
    const member = await createTestMember();
    const loan = await borrowForTest(member.id, book.id);

    expect(await availableCopiesOf(book.id)).toBe(2);

    const res = await request(app).patch(`/loans/${loan.id}/return`).set(authHeader);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(loan.id);
    expect(res.body.bookId).toBe(book.id);
    expect(res.body.memberId).toBe(member.id);
    expect(typeof res.body.returnedAt).toBe('string');
    expect(res.body.returnedAt).not.toBeNull();

    expect(await availableCopiesOf(book.id)).toBe(3);
  });

  it('returns 404 for an unknown loan id', async () => {
    const res = await request(app)
      .patch('/loans/2b3c4d5e-0000-0000-0000-000000000000/return')
      .set(authHeader);

    expect(res.status).toBe(404);
    expect(res.body.error).toBeDefined();
  });

  it('rejects returning the same loan twice without incrementing twice', async () => {
    const book = await createTestBook({ totalCopies: 2 });
    const member = await createTestMember();
    const loan = await borrowForTest(member.id, book.id);

    const first = await request(app).patch(`/loans/${loan.id}/return`).set(authHeader);
    expect(first.status).toBe(200);
    expect(await availableCopiesOf(book.id)).toBe(2);

    const second = await request(app).patch(`/loans/${loan.id}/return`).set(authHeader);

    expect(second.status).toBe(409);
    expect(second.body.error).toBeDefined();

    expect(await availableCopiesOf(book.id)).toBe(2);
  });
});

describe('GET /members/:id/loans', () => {
  it('lists only the member unreturned loans', async () => {
    const member = await createTestMember();
    const returnedBook = await createTestBook({ title: 'Returned', totalCopies: 1 });
    const activeBook = await createTestBook({ title: 'Still out', totalCopies: 1 });

    const returnedLoan = await borrowForTest(member.id, returnedBook.id);
    const activeLoan = await borrowForTest(member.id, activeBook.id);

    const returned = await request(app).patch(`/loans/${returnedLoan.id}/return`).set(authHeader);
    expect(returned.status).toBe(200);

    const res = await request(app).get(`/members/${member.id}/loans`).set(authHeader);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].id).toBe(activeLoan.id);
    expect(res.body[0].bookId).toBe(activeBook.id);
    expect(res.body[0].returnedAt).toBeNull();

    const ids = res.body.map((loan: Loan) => loan.id);
    expect(ids).not.toContain(returnedLoan.id);
  });

  it('returns an empty array for a member with no active loans', async () => {
    const member = await createTestMember();

    const res = await request(app).get(`/members/${member.id}/loans`).set(authHeader);

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('returns only the requested member loans', async () => {
    const first = await createTestMember({ name: 'Ada Lovelace', email: 'ada@example.com' });
    const second = await createTestMember({ name: 'Alan Turing', email: 'alan@example.com' });
    const book = await createTestBook({ totalCopies: 2 });

    const firstLoan = await borrowForTest(first.id, book.id);
    await borrowForTest(second.id, book.id);

    const res = await request(app).get(`/members/${first.id}/loans`).set(authHeader);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].id).toBe(firstLoan.id);
    expect(res.body[0].memberId).toBe(first.id);
  });
});
