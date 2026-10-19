import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import app from '../src/app';
import type { Book } from '../src/books/types';
import type { Loan, OverdueLoan } from '../src/loans/types';
import type { Member } from '../src/members/types';
import { resetBooks } from '../src/books/store';
import { resetLoans } from '../src/loans/store';
import { resetMembers } from '../src/members/store';

/**
 * The standard loan period used by the acceptance criteria: 14 days in milliseconds.
 */
const LOAN_PERIOD_MS = 14 * 24 * 60 * 60 * 1000;

/**
 * Fixed instant the suite starts from, so dueDate arithmetic is exact and
 * the "just past the due date" boundary can be tested by moving the clock by 1ms.
 */
const NOW = Date.parse('2024-01-01T00:00:00.000Z');

const validMember = {
  name: 'Ada Lovelace',
  email: 'ada@example.com',
};

/**
 * The catalog rejects duplicate ISBNs, so every TEST book gets its own isbn.
 */
let isbnSuffix = 0;

/**
 * Only Date is faked: supertest's HTTP handling needs the real timers. The clock is
 * restored in afterEach so a failing assertion cannot leave fake Date installed for
 * every test that runs after it in this file.
 */
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);

  resetBooks();
  resetMembers();
  resetLoans();
});

afterEach(() => {
  vi.useRealTimers();
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
    .send({ ...validMember, ...overrides });

  expect(res.status).toBe(201);
  return res.body as Member;
}

async function borrowForTest(
  memberId: string,
  bookId: string,
  extra: Record<string, unknown> = {},
): Promise<Loan> {
  const res = await request(app).post('/loans').send({ bookId, memberId, ...extra });

  expect(res.status).toBe(201);
  return res.body as Loan;
}

async function overdueForTest(query = ''): Promise<OverdueLoan[]> {
  const res = await request(app).get(`/loans/overdue${query}`);

  expect(res.status).toBe(200);
  expect(Array.isArray(res.body)).toBe(true);
  return res.body as OverdueLoan[];
}

describe('POST /loans dueDate', () => {
  it('sets dueDate exactly 14 days after borrowedAt', async () => {
    const book = await createTestBook();
    const member = await createTestMember();

    const res = await request(app).post('/loans').send({ bookId: book.id, memberId: member.id });

    expect(res.status).toBe(201);
    expect(typeof res.body.borrowedAt).toBe('string');
    expect(typeof res.body.dueDate).toBe('string');
    expect(Date.parse(res.body.dueDate) - Date.parse(res.body.borrowedAt)).toBe(LOAN_PERIOD_MS);
    expect(res.body.borrowedAt).toBe(new Date(NOW).toISOString());
    expect(res.body.dueDate).toBe(new Date(NOW + LOAN_PERIOD_MS).toISOString());
  });

  it('ignores a dueDate supplied in the request body', async () => {
    const book = await createTestBook();
    const member = await createTestMember();

    const res = await request(app)
      .post('/loans')
      .send({ bookId: book.id, memberId: member.id, dueDate: '2000-01-01T00:00:00.000Z' });

    expect(res.status).toBe(201);
    expect(res.body.dueDate).toBe(new Date(NOW + LOAN_PERIOD_MS).toISOString());

    const stored = await request(app).get(`/members/${member.id}/loans`);
    expect(stored.status).toBe(200);
    expect(stored.body).toHaveLength(1);
    expect(stored.body[0].dueDate).toBe(res.body.dueDate);
  });
});

describe('GET /loans/overdue', () => {
  it('returns an empty array when no loans exist', async () => {
    expect(await overdueForTest()).toEqual([]);
  });

  it('returns an empty array while the loan is not yet past its due date', async () => {
    const book = await createTestBook();
    const member = await createTestMember();
    await borrowForTest(member.id, book.id);

    expect(await overdueForTest()).toEqual([]);
  });

  it('lists the loan with book title and member name once the due date passes', async () => {
    const book = await createTestBook();
    const member = await createTestMember();
    const loan = await borrowForTest(member.id, book.id);

    const before = await overdueForTest();
    expect(before).toEqual([]);

    // No write happens between the two requests: the status is recomputed per request.
    vi.setSystemTime(NOW + LOAN_PERIOD_MS + 1000);

    const after = await overdueForTest();
    expect(after).toHaveLength(1);

    const entry = after[0];
    expect(entry.id).toBe(loan.id);
    expect(entry.bookId).toBe(book.id);
    expect(entry.memberId).toBe(member.id);
    expect(entry.borrowedAt).toBe(loan.borrowedAt);
    expect(entry.dueDate).toBe(loan.dueDate);
    expect(entry.returnedAt).toBeNull();
    expect(entry.bookTitle).toBe('Dune');
    expect(entry.memberName).toBe('Ada Lovelace');
  });

  it('does not treat a loan as overdue at the exact due date instant', async () => {
    const book = await createTestBook();
    const member = await createTestMember();
    const loan = await borrowForTest(member.id, book.id);

    vi.setSystemTime(Date.parse(loan.dueDate));

    expect(await overdueForTest()).toEqual([]);

    vi.setSystemTime(Date.parse(loan.dueDate) + 1);

    const after = await overdueForTest();
    expect(after).toHaveLength(1);
    expect(after[0].id).toBe(loan.id);
  });

  it('never lists a returned loan, even after its due date has passed', async () => {
    const book = await createTestBook();
    const member = await createTestMember();
    const loan = await borrowForTest(member.id, book.id);

    const returned = await request(app).patch(`/loans/${loan.id}/return`);
    expect(returned.status).toBe(200);
    expect(returned.body.returnedAt).not.toBeNull();

    vi.setSystemTime(NOW + LOAN_PERIOD_MS + 1000);

    expect(await overdueForTest()).toEqual([]);
  });

  it('returns every overdue loan in one unpaginated array', async () => {
    const firstBook = await createTestBook({ title: 'Book A' });
    const secondBook = await createTestBook({ title: 'Book B' });
    const firstMember = await createTestMember({ name: 'Ada Lovelace', email: 'ada@example.com' });
    const secondMember = await createTestMember({ name: 'Alan Turing', email: 'alan@example.com' });

    const firstLoan = await borrowForTest(firstMember.id, firstBook.id);
    const secondLoan = await borrowForTest(secondMember.id, secondBook.id);

    vi.setSystemTime(NOW + LOAN_PERIOD_MS + 60 * 60 * 1000);

    const res = await request(app).get('/loans/overdue');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toHaveLength(2);
    const ids = res.body.map((loan: OverdueLoan) => loan.id);
    expect(ids).toEqual([firstLoan.id, secondLoan.id]);
    const titles = res.body.map((loan: OverdueLoan) => loan.bookTitle).sort();
    expect(titles).toEqual(['Book A', 'Book B']);

    const withPagingParams = await request(app).get('/loans/overdue?page=1&pageSize=1');
    expect(withPagingParams.status).toBe(200);
    expect(withPagingParams.body).toHaveLength(2);
  });
});
