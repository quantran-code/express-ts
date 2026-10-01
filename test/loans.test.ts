import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../src/app';
import { reset as resetBookRepository } from '../src/repositories/bookRepository';
import { reset as resetMemberRepository } from '../src/repositories/memberRepository';
import { reset as resetLoanRepository } from '../src/repositories/loanRepository';

const getAuthHeaders = async () => {
  const adminRes = await request(app)
    .post('/auth/login')
    .send({ email: 'librarian@example.com', password: 'librarian-password' });

  return {
    Authorization: `Bearer ${adminRes.body.token}`,
  };
};

const createBookPayload = (overrides?: Partial<{ title: string; author: string; isbn: string; totalCopies: number }>) => {
  return {
    title: 'Clean Code',
    author: 'Robert C. Martin',
    isbn: 'isbn-1',
    totalCopies: 3,
    ...overrides,
  };
};

const createMemberPayload = (overrides?: Partial<{ name: string; email: string }>) => {
  return {
    name: 'John Doe',
    email: 'john@example.com',
    ...overrides,
  };
};

describe('Borrow/Return flow', () => {
  beforeEach(() => {
    resetBookRepository();
    resetMemberRepository();
    resetLoanRepository();
  });

  it('borrows and decrements book availableCopies; repeat borrow for same member+book returns 422', async () => {
    const headers = await getAuthHeaders();

    const bookRes = await request(app)
      .post('/books')
      .set(headers)
      .send(createBookPayload({ isbn: 'isbn-loan-1', totalCopies: 2 }));
    expect(bookRes.status).toBe(201);

    const memberRes = await request(app).post('/members').set(headers).send(createMemberPayload({ email: 'member-loan-1@example.com' }));
    expect(memberRes.status).toBe(201);

    const memberId = memberRes.body.id;
    const bookId = bookRes.body.id;

    const borrowRes1 = await request(app)
      .post(`/members/${memberId}/loans`)
      .set(headers)
      .send({ bookId, copies: 1 });
    expect(borrowRes1.status).toBe(201);
    expect(borrowRes1.body.memberId).toBe(memberId);
    expect(borrowRes1.body.bookId).toBe(bookId);
    expect(borrowRes1.body.copies).toBe(1);
    expect(typeof borrowRes1.body.id).toBe('string');

    const getBookAfterBorrow = await request(app).get(`/books/${bookId}`);
    expect(getBookAfterBorrow.status).toBe(200);
    expect(getBookAfterBorrow.body.availableCopies).toBe(1);
    expect(getBookAfterBorrow.body.loanedCopies).toBe(1);

    const borrowRes2 = await request(app)
      .post(`/members/${memberId}/loans`)
      .set(headers)
      .send({ bookId, copies: 1 });
    expect(borrowRes2.status).toBe(422);
  });

  it('returns an active loan and restores book availableCopies; double return returns 422', async () => {
    const headers = await getAuthHeaders();

    const bookRes = await request(app)
      .post('/books')
      .set(headers)
      .send(createBookPayload({ isbn: 'isbn-return-1', totalCopies: 2 }));
    expect(bookRes.status).toBe(201);

    const memberRes = await request(app).post('/members').set(headers).send(createMemberPayload({ email: 'member-return-1@example.com' }));
    expect(memberRes.status).toBe(201);

    const memberId = memberRes.body.id;
    const bookId = bookRes.body.id;

    const borrowRes = await request(app).post(`/members/${memberId}/loans`).set(headers).send({ bookId, copies: 1 });
    expect(borrowRes.status).toBe(201);

    const getBookAfterBorrow = await request(app).get(`/books/${bookId}`);
    expect(getBookAfterBorrow.status).toBe(200);
    expect(getBookAfterBorrow.body.availableCopies).toBe(1);
    expect(getBookAfterBorrow.body.loanedCopies).toBe(1);

    const returnRes = await request(app).post(`/members/${memberId}/returns`).set(headers).send({ bookId, copies: 1 });
    expect(returnRes.status).toBe(200);
    expect(returnRes.body.memberId).toBe(memberId);
    expect(returnRes.body.bookId).toBe(bookId);
    expect(returnRes.body.copies).toBe(1);
    expect(returnRes.body.returnedAt).toBeTypeOf('string');

    const getBookAfterReturn = await request(app).get(`/books/${bookId}`);
    expect(getBookAfterReturn.status).toBe(200);
    expect(getBookAfterReturn.body.availableCopies).toBe(2);
    expect(getBookAfterReturn.body.loanedCopies).toBe(0);

    const doubleReturnRes = await request(app).post(`/members/${memberId}/returns`).send({ bookId, copies: 1 });
    expect(doubleReturnRes.status).toBe(422);
  });

  it('borrowing with a nonexistent member or book returns 404', async () => {
    const headers = await getAuthHeaders();

    const bookRes = await request(app)
      .post('/books')
      .set(headers)
      .send(createBookPayload({ isbn: 'isbn-loan-404', totalCopies: 2 }));
    expect(bookRes.status).toBe(201);

    const bookId = bookRes.body.id;

    const borrowMissingMemberRes = await request(app)
      .post('/members/does-not-exist/loans')
      .send({ bookId, copies: 1 });
    expect(borrowMissingMemberRes.status).toBe(404);

    const memberRes = await request(app).post('/members').send(createMemberPayload({ email: 'member-loan-404@example.com' }));
    expect(memberRes.status).toBe(201);

    const missingBookRes = await request(app)
      .post(`/members/${memberRes.body.id}/loans`)
      .send({ bookId: 'does-not-exist', copies: 1 });
    expect(missingBookRes.status).toBe(404);
  });
});
