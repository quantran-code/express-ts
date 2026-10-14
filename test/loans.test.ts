import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import app from '../src/app';
import { resetBookStore, getBook } from '../src/store/books';
import { resetMemberStore } from '../src/store/members';
import { resetLoanStore, countActiveLoansForMember } from '../src/store/loans';

const validBook = {
  title: 'The Pragmatic Programmer',
  author: 'Andrew Hunt',
  isbn: '978-0135957059',
  totalCopies: 4,
};

const validMember = {
  name: 'Alice Johnson',
  email: 'alice@example.com',
};

function postBook(payload: Record<string, unknown> = validBook) {
  return request(app).post('/books').send(payload);
}

function postMember(payload: Record<string, unknown> = validMember) {
  return request(app).post('/members').send(payload);
}

function postLoan(payload: Record<string, unknown>) {
  return request(app).post('/loans').send(payload);
}

function expectError(
  res: { status: number; body: unknown },
  status: number,
  code: string,
): void {
  expect(res.status).toBe(status);
  expect(res.body).toEqual({ error: { code, message: expect.any(String) } });
}

async function seedBook(payload: Record<string, unknown> = validBook) {
  const res = await postBook(payload);
  expect(res.status).toBe(201);
  return res.body as { id: number; totalCopies: number; availableCopies: number };
}

async function seedMember(payload: Record<string, unknown> = validMember) {
  const res = await postMember(payload);
  expect(res.status).toBe(201);
  return res.body as { id: number; name: string; email: string };
}

describe('Loan API', () => {
  beforeEach(() => {
    resetBookStore();
    resetMemberStore();
    resetLoanStore();
  });

  describe('POST /loans', () => {
    it('borrows an available book and decrements availableCopies', async () => {
      const book = await seedBook();
      const member = await seedMember();

      const res = await postLoan({ bookId: book.id, memberId: member.id });

      expect(res.status).toBe(201);
      expect(res.body).toEqual({
        id: 1,
        bookId: book.id,
        memberId: member.id,
        borrowedAt: expect.any(String),
        dueDate: expect.any(String),
        returnedAt: null,
      });
      expect(res.body.borrowedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);

      expect(getBook(book.id)!.availableCopies).toBe(validBook.totalCopies - 1);
      expect(countActiveLoansForMember(member.id)).toBe(1);
    });

    it('assigns incrementing loan ids', async () => {
      const book = await seedBook();
      const member = await seedMember();
      const secondBook = await seedBook({ ...validBook, isbn: '978-0134757599' });

      const first = await postLoan({ bookId: book.id, memberId: member.id });
      const second = await postLoan({ bookId: secondBook.id, memberId: member.id });

      expect(first.status).toBe(201);
      expect(second.status).toBe(201);
      expect(first.body.id).toBe(1);
      expect(second.body.id).toBe(2);
    });

    it('rejects borrowing when availableCopies is 0 and changes nothing', async () => {
      const book = await seedBook({ ...validBook, totalCopies: 1 });
      const member = await seedMember();

      getBook(book.id)!.availableCopies = 0;

      const res = await postLoan({ bookId: book.id, memberId: member.id });

      expectError(res, 422, 'NO_COPIES');
      expect(getBook(book.id)!.availableCopies).toBe(0);
      expect(countActiveLoansForMember(member.id)).toBe(0);
    });

    it('rejects a duplicate active loan for the same book', async () => {
      const book = await seedBook();
      const member = await seedMember();

      const first = await postLoan({ bookId: book.id, memberId: member.id });
      const second = await postLoan({ bookId: book.id, memberId: member.id });

      expect(first.status).toBe(201);
      expectError(second, 422, 'DUPLICATE_LOAN');
      expect(getBook(book.id)!.availableCopies).toBe(validBook.totalCopies - 1);
      expect(countActiveLoansForMember(member.id)).toBe(1);
    });

    it('enforces the 3 active loan limit', async () => {
      const member = await seedMember();
      const books = [];
      for (let i = 0; i < 3; i += 1) {
        books.push(await seedBook({ ...validBook, isbn: `978-000000000${i}` }));
      }
      const fourthBook = await seedBook({ ...validBook, isbn: '978-0000000004' });

      for (const book of books) {
        const res = await postLoan({ bookId: book.id, memberId: member.id });
        expect(res.status).toBe(201);
      }

      const res = await postLoan({ bookId: fourthBook.id, memberId: member.id });

      expectError(res, 422, 'LOAN_LIMIT_REACHED');
      expect(countActiveLoansForMember(member.id)).toBe(3);
      expect(getBook(fourthBook.id)!.availableCopies).toBe(fourthBook.availableCopies);
    });

    it('rejects an unknown bookId without changing state', async () => {
      const member = await seedMember();

      const res = await postLoan({ bookId: 999, memberId: member.id });

      expectError(res, 404, 'NOT_FOUND');
      expect(countActiveLoansForMember(member.id)).toBe(0);
    });

    it('rejects an unknown memberId without changing state', async () => {
      const book = await seedBook();

      const res = await postLoan({ bookId: book.id, memberId: 999 });

      expectError(res, 404, 'NOT_FOUND');
      expect(getBook(book.id)!.availableCopies).toBe(book.availableCopies);
    });

    it('rejects missing, non-integer, or non-positive bookId/memberId', async () => {
      const book = await seedBook();
      const member = await seedMember();

      const payloads = [
        { memberId: member.id },
        { bookId: book.id },
        { bookId: 0, memberId: member.id },
        { bookId: -2, memberId: member.id },
        { bookId: 1.5, memberId: member.id },
        { bookId: '1', memberId: member.id },
        { bookId: null, memberId: member.id },
        { bookId: book.id, memberId: 0 },
        { bookId: book.id, memberId: -2 },
        { bookId: book.id, memberId: 1.5 },
        { bookId: book.id, memberId: '1' },
        { bookId: book.id, memberId: null },
      ];

      for (const payload of payloads) {
        const res = await postLoan(payload);
        expectError(res, 400, 'INVALID_FIELDS');
      }
    });

    it('rejects a payload containing an unknown field', async () => {
      const book = await seedBook();
      const member = await seedMember();

      const res = await postLoan({ bookId: book.id, memberId: member.id, genre: 'Software' });

      expectError(res, 400, 'INVALID_FIELDS');
    });

    it('sets dueDate exactly 14 days after borrowedAt', async () => {
      const book = await seedBook();
      const member = await seedMember();

      const res = await postLoan({ bookId: book.id, memberId: member.id });

      expect(res.status).toBe(201);
      const borrowedAt = Date.parse(res.body.borrowedAt as string);
      const dueDate = Date.parse(res.body.dueDate as string);
      expect(dueDate - borrowedAt).toBe(14 * 24 * 60 * 60 * 1000);
    });

    it('rejects a payload that sets dueDate directly', async () => {
      const book = await seedBook();
      const member = await seedMember();

      const res = await postLoan({
        bookId: book.id,
        memberId: member.id,
        dueDate: '2025-01-01T00:00:00.000Z',
      });

      expectError(res, 400, 'INVALID_FIELDS');
    });
  });

  describe('POST /loans/:id/return', () => {
    it('returns an active loan and increments availableCopies', async () => {
      const book = await seedBook();
      const member = await seedMember();

      const borrow = await postLoan({ bookId: book.id, memberId: member.id });
      expect(borrow.status).toBe(201);
      const loanId = borrow.body.id as number;
      expect(getBook(book.id)!.availableCopies).toBe(validBook.totalCopies - 1);

      const res = await request(app).post(`/loans/${loanId}/return`);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        id: loanId,
        bookId: book.id,
        memberId: member.id,
        borrowedAt: expect.any(String),
        dueDate: expect.any(String),
        returnedAt: expect.any(String),
      });
      expect(res.body.returnedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(getBook(book.id)!.availableCopies).toBe(validBook.totalCopies);
    });

    it('returns 404 for an unknown loan id', async () => {
      const res = await request(app).post('/loans/999/return');
      expectError(res, 404, 'LOAN_NOT_FOUND');
    });

    it('returns 404 for a non-numeric loan id', async () => {
      for (const id of ['abc', '1.5', '-1', '0']) {
        const res = await request(app).post(`/loans/${id}/return`);
        expectError(res, 404, 'LOAN_NOT_FOUND');
      }
    });

    it('rejects returning an already-returned loan', async () => {
      const book = await seedBook();
      const member = await seedMember();

      const borrow = await postLoan({ bookId: book.id, memberId: member.id });
      expect(borrow.status).toBe(201);
      const loanId = borrow.body.id as number;

      const first = await request(app).post(`/loans/${loanId}/return`);
      expect(first.status).toBe(200);

      const second = await request(app).post(`/loans/${loanId}/return`);
      expectError(second, 404, 'LOAN_NOT_FOUND');
      expect(getBook(book.id)!.availableCopies).toBe(validBook.totalCopies);
    });

    it('restores availableCopies after a borrow-then-return sequence', async () => {
      const book = await seedBook();
      const member = await seedMember();
      const initialAvailable = getBook(book.id)!.availableCopies;

      const borrow = await postLoan({ bookId: book.id, memberId: member.id });
      expect(borrow.status).toBe(201);

      const afterBorrow = getBook(book.id)!.availableCopies;
      expect(afterBorrow).toBe(initialAvailable - 1);
      expect(afterBorrow).toBeGreaterThanOrEqual(0);
      expect(afterBorrow).toBeLessThanOrEqual(getBook(book.id)!.totalCopies);

      const res = await request(app).post(`/loans/${borrow.body.id}/return`);
      expect(res.status).toBe(200);

      const afterReturn = getBook(book.id)!.availableCopies;
      expect(afterReturn).toBe(initialAvailable);
      expect(afterReturn).toBeGreaterThanOrEqual(0);
      expect(afterReturn).toBeLessThanOrEqual(getBook(book.id)!.totalCopies);
    });
  });

  describe('GET /members/:id/loans includes dueDate', () => {
    it('returns each active loan with its system-set dueDate', async () => {
      const member = await seedMember();
      const book = await seedBook();

      const borrow = await postLoan({ bookId: book.id, memberId: member.id });
      expect(borrow.status).toBe(201);

      const res = await request(app).get(`/members/${member.id}/loans`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].dueDate).toBe(borrow.body.dueDate);
      expect(res.body[0].dueDate).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });
  });

  describe('GET /loans/overdue', () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    it('moves an active loan from not overdue to overdue as time passes its dueDate', async () => {
      vi.useFakeTimers({ toFake: ['Date'] });
      const now = new Date('2025-01-01T00:00:00.000Z');
      vi.setSystemTime(now);

      const book = await seedBook();
      const member = await seedMember();

      const borrow = await postLoan({ bookId: book.id, memberId: member.id });
      expect(borrow.status).toBe(201);

      const before = await request(app).get('/loans/overdue');
      expect(before.status).toBe(200);
      expect(before.body).toEqual([]);

      vi.setSystemTime(new Date(now.getTime() + 15 * 24 * 60 * 60 * 1000));

      const after = await request(app).get('/loans/overdue');
      expect(after.status).toBe(200);
      expect(after.body).toHaveLength(1);
      expect(after.body[0].id).toBe(borrow.body.id);
    });

    it('never includes a returned loan even when its dueDate has passed', async () => {
      vi.useFakeTimers({ toFake: ['Date'] });
      const now = new Date('2025-01-01T00:00:00.000Z');
      vi.setSystemTime(now);

      const book = await seedBook();
      const member = await seedMember();

      const borrow = await postLoan({ bookId: book.id, memberId: member.id });
      expect(borrow.status).toBe(201);

      const returned = await request(app).post(`/loans/${borrow.body.id}/return`);
      expect(returned.status).toBe(200);

      vi.setSystemTime(new Date(now.getTime() + 15 * 24 * 60 * 60 * 1000));

      const res = await request(app).get('/loans/overdue');
      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });
  });
});
