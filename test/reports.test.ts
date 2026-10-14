import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import app from '../src/app';
import { resetBookStore } from '../src/store/books';
import { resetMemberStore } from '../src/store/members';
import { resetLoanStore } from '../src/store/loans';
import { resetUserStore } from '../src/store/users';
import { loginAsSeededLibrarian } from './helpers/auth';

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

let librarianToken = '';

function get(url: string, token: string) {
  return request(app).get(url).set('Authorization', `Bearer ${token}`);
}

function post(url: string, token: string, payload?: Record<string, unknown>) {
  const req = request(app).post(url).set('Authorization', `Bearer ${token}`);
  return payload === undefined ? req : req.send(payload);
}

function postBook(payload: Record<string, unknown> = validBook) {
  return post('/books', librarianToken, payload);
}

function postMember(payload: Record<string, unknown> = validMember) {
  return post('/members', librarianToken, payload);
}

function postLoan(payload: Record<string, unknown>) {
  return post('/loans', librarianToken, payload);
}

function postReturn(loanId: number) {
  return post(`/loans/${loanId}/return`, librarianToken);
}

function expectError(
  res: { status: number; body: unknown },
  status: number,
  code: string,
): void {
  expect(res.status).toBe(status);
  expect(res.body).toEqual({ error: { code, message: expect.any(String) } });
}

describe('Reports API', () => {
  beforeEach(async () => {
    resetBookStore();
    resetMemberStore();
    resetLoanStore();
    resetUserStore();

    librarianToken = await loginAsSeededLibrarian();
  });

  describe('authorization', () => {
    it('returns 401 UNAUTHORIZED without a token', async () => {
      const mostBorrowed = await request(app).get('/reports/most-borrowed-books');
      expectError(mostBorrowed, 401, 'UNAUTHORIZED');

      const overdueSummary = await request(app).get('/reports/overdue-summary');
      expectError(overdueSummary, 401, 'UNAUTHORIZED');
    });

    it('returns 403 FORBIDDEN with a member token', async () => {
      const register = await request(app).post('/auth/register').send({
        name: 'Member User',
        email: 'member@example.com',
        password: 'password123',
      });
      expect(register.status).toBe(201);

      const login = await request(app).post('/auth/login').send({
        email: 'member@example.com',
        password: 'password123',
      });
      expect(login.status).toBe(200);
      const memberToken = login.body.token as string;

      const mostBorrowed = await get('/reports/most-borrowed-books', memberToken);
      expectError(mostBorrowed, 403, 'FORBIDDEN');

      const overdueSummary = await get('/reports/overdue-summary', memberToken);
      expectError(overdueSummary, 403, 'FORBIDDEN');
    });
  });

  describe('GET /reports/most-borrowed-books', () => {
    it('ranks borrowed books from most to least and counts returned loans', async () => {
      const memberRes = await postMember();
      expect(memberRes.status).toBe(201);
      const memberId = memberRes.body.id as number;

      const bookA = await postBook({ ...validBook, isbn: '978-0000000001' });
      const bookB = await postBook({ ...validBook, isbn: '978-0000000002' });
      const bookC = await postBook({ ...validBook, isbn: '978-0000000003' });
      expect(bookA.status).toBe(201);
      expect(bookB.status).toBe(201);
      expect(bookC.status).toBe(201);

      // Book A: borrowed twice, one of the loans returned.
      const a1 = await postLoan({ bookId: bookA.body.id, memberId });
      expect(a1.status).toBe(201);
      const a1Return = await postReturn(a1.body.id);
      expect(a1Return.status).toBe(200);
      const a2 = await postLoan({ bookId: bookA.body.id, memberId });
      expect(a2.status).toBe(201);

      // Book B: borrowed twice, one of the loans returned, tying with A.
      const b1 = await postLoan({ bookId: bookB.body.id, memberId });
      expect(b1.status).toBe(201);
      const b1Return = await postReturn(b1.body.id);
      expect(b1Return.status).toBe(200);
      const b2 = await postLoan({ bookId: bookB.body.id, memberId });
      expect(b2.status).toBe(201);

      // Book C: borrowed once.
      const c1 = await postLoan({ bookId: bookC.body.id, memberId });
      expect(c1.status).toBe(201);

      const res = await get('/reports/most-borrowed-books', librarianToken);

      expect(res.status).toBe(200);
      expect(res.body).toEqual([
        {
          bookId: bookA.body.id,
          title: validBook.title,
          author: validBook.author,
          borrowCount: 2,
        },
        {
          bookId: bookB.body.id,
          title: validBook.title,
          author: validBook.author,
          borrowCount: 2,
        },
        {
          bookId: bookC.body.id,
          title: validBook.title,
          author: validBook.author,
          borrowCount: 1,
        },
      ]);
    });
  });

  describe('GET /reports/overdue-summary', () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    it('reports per-member overdue loan counts and excludes returned loans', async () => {
      vi.useFakeTimers({ toFake: ['Date'] });
      const now = new Date('2025-01-01T00:00:00.000Z');
      vi.setSystemTime(now);

      const member1 = await postMember({ name: 'Alice Johnson', email: 'alice@example.com' });
      const member2 = await postMember({ name: 'Bob Smith', email: 'bob@example.com' });
      expect(member1.status).toBe(201);
      expect(member2.status).toBe(201);

      const book1 = await postBook({ ...validBook, isbn: '978-0000000001' });
      const book2 = await postBook({ ...validBook, isbn: '978-0000000002' });
      const book3 = await postBook({ ...validBook, isbn: '978-0000000003' });
      const book4 = await postBook({ ...validBook, isbn: '978-0000000004' });
      expect(book1.status).toBe(201);
      expect(book2.status).toBe(201);
      expect(book3.status).toBe(201);
      expect(book4.status).toBe(201);

      const m1Loan1 = await postLoan({ bookId: book1.body.id, memberId: member1.body.id });
      const m1Loan2 = await postLoan({ bookId: book2.body.id, memberId: member1.body.id });
      const m2Loan1 = await postLoan({ bookId: book3.body.id, memberId: member2.body.id });
      const m2Loan2 = await postLoan({ bookId: book4.body.id, memberId: member2.body.id });
      expect(m1Loan1.status).toBe(201);
      expect(m1Loan2.status).toBe(201);
      expect(m2Loan1.status).toBe(201);
      expect(m2Loan2.status).toBe(201);

      vi.setSystemTime(new Date(now.getTime() + 15 * 24 * 60 * 60 * 1000));

      const returned = await postReturn(m1Loan1.body.id);
      expect(returned.status).toBe(200);

      const res = await get('/reports/overdue-summary', librarianToken);

      expect(res.status).toBe(200);
      expect(res.body).toEqual([
        {
          memberId: member1.body.id,
          name: member1.body.name,
          email: member1.body.email,
          overdueLoans: 1,
        },
        {
          memberId: member2.body.id,
          name: member2.body.name,
          email: member2.body.email,
          overdueLoans: 2,
        },
      ]);
    });
  });
});
