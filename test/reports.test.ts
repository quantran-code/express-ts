import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import app from '../src/app';
import { resetUsers } from '../src/auth/store';
import type { Book } from '../src/books/types';
import { resetBooks } from '../src/books/store';
import type { Loan } from '../src/loans/types';
import { resetLoans } from '../src/loans/store';
import type { Member } from '../src/members/types';
import { resetMembers } from '../src/members/store';
import type { MostBorrowedBook, OverdueSummaryEntry } from '../src/reports/types';
import { librarianAuthHeaders, memberAuthHeaders } from './helpers/auth';

/**
 * The standard loan period used by the overdue rules: 14 days in milliseconds.
 */
const LOAN_PERIOD_MS = 14 * 24 * 60 * 60 * 1000;

/**
 * Fixed instant the suite starts from, so dueDate arithmetic is exact.
 */
const NOW = Date.parse('2024-01-01T00:00:00.000Z');

/**
 * The catalog rejects duplicate ISBNs, so every TEST book gets its own isbn.
 */
let isbnSuffix = 0;

/**
 * Only Date is faked: supertest's HTTP handling needs the real timers. The clock is
 * restored in afterEach so a failing assertion cannot leave fake Date installed for every
 * test that runs after it in this file.
 */
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);

  resetUsers();
  resetMembers();
  resetBooks();
  resetLoans();
});

afterEach(() => {
  vi.useRealTimers();
});

/**
 * Tokens are minted per request, never cached: these tests move the clock 14 days past the
 * 1-hour token lifetime, so a header obtained before the jump would be expired for every
 * request made after it.
 */
async function createBookAsLibrarian(title: string, totalCopies = 1): Promise<Book> {
  isbnSuffix += 1;

  const res = await request(app)
    .post('/books')
    .set(await librarianAuthHeaders())
    .send({
      title,
      author: 'Frank Herbert',
      isbn: `978-0-441-1727-${isbnSuffix}`,
      totalCopies,
    });

  expect(res.status).toBe(201);
  return res.body as Book;
}

async function createMemberAsLibrarian(name: string, email: string): Promise<Member> {
  const res = await request(app)
    .post('/members')
    .set(await librarianAuthHeaders())
    .send({ name, email });

  expect(res.status).toBe(201);
  return res.body as Member;
}

async function borrowAsLibrarian(memberId: string, bookId: string): Promise<Loan> {
  const res = await request(app)
    .post('/loans')
    .set(await librarianAuthHeaders())
    .send({ bookId, memberId });

  expect(res.status).toBe(201);
  return res.body as Loan;
}

async function returnAsLibrarian(loanId: string): Promise<Loan> {
  const res = await request(app)
    .patch(`/loans/${loanId}/return`)
    .set(await librarianAuthHeaders());

  expect(res.status).toBe(200);
  return res.body as Loan;
}

describe('AC5: reporting access', () => {
  const reportingPaths = [
    '/loans/overdue',
    '/reports/most-borrowed',
    '/reports/overdue-summary',
  ];

  it('AC5: a member is refused the overdue list and both reports', async () => {
    const member = await memberAuthHeaders();

    for (const path of reportingPaths) {
      const res = await request(app).get(path).set(member);

      expect(res.status, `${path} as a member`).toBe(403);
      expect(res.body.error).toBeDefined();
      expect(Array.isArray(res.body)).toBe(false);
    }
  });

  it('AC5: a librarian may read the overdue list and both reports', async () => {
    const member = await createMemberAsLibrarian('Ada Lovelace', 'ada@example.com');
    const book = await createBookAsLibrarian('Dune');
    await borrowAsLibrarian(member.id, book.id);

    for (const path of reportingPaths) {
      const res = await request(app).get(path).set(await librarianAuthHeaders());

      expect(res.status, `${path} as a librarian`).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    }
  });
});

describe('AC6: most-borrowed report', () => {
  it('AC6: ranks by borrow count, breaks ties by title, counts returned loans and omits unborrowed books', async () => {
    const dune = await createBookAsLibrarian('Dune', 2);
    const neuromancer = await createBookAsLibrarian('Neuromancer', 1);
    const emma = await createBookAsLibrarian('Emma', 1);
    const neverBorrowed = await createBookAsLibrarian('Never Borrowed', 1);

    const ada = await createMemberAsLibrarian('Ada Lovelace', 'ada@example.com');
    const alan = await createMemberAsLibrarian('Alan Turing', 'alan@example.com');

    const adaDuneLoan = await borrowAsLibrarian(ada.id, dune.id);
    await borrowAsLibrarian(alan.id, dune.id);
    await borrowAsLibrarian(ada.id, neuromancer.id);
    await borrowAsLibrarian(alan.id, emma.id);

    // A loan that has already been returned still counts towards the total.
    const returned = await returnAsLibrarian(adaDuneLoan.id);
    expect(returned.returnedAt).not.toBeNull();

    const res = await request(app)
      .get('/reports/most-borrowed')
      .set(await librarianAuthHeaders());

    expect(res.status).toBe(200);

    const expected: MostBorrowedBook[] = [
      { bookId: dune.id, title: 'Dune', borrowCount: 2 },
      // Emma and Neuromancer are tied on one borrow each, so title A→Z decides.
      { bookId: emma.id, title: 'Emma', borrowCount: 1 },
      { bookId: neuromancer.id, title: 'Neuromancer', borrowCount: 1 },
    ];
    expect(res.body).toEqual(expected);

    const reportedIds = (res.body as MostBorrowedBook[]).map((entry) => entry.bookId);
    expect(reportedIds).not.toContain(neverBorrowed.id);
  });

  it('AC6: an empty catalog of borrows yields an empty array', async () => {
    await createBookAsLibrarian('Dune');

    const res = await request(app)
      .get('/reports/most-borrowed')
      .set(await librarianAuthHeaders());

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('AC6: no limit or pagination — paging parameters do not shorten the array', async () => {
    const dune = await createBookAsLibrarian('Dune', 2);
    const emma = await createBookAsLibrarian('Emma', 1);
    const member = await createMemberAsLibrarian('Ada Lovelace', 'ada@example.com');

    await borrowAsLibrarian(member.id, dune.id);
    await borrowAsLibrarian(member.id, emma.id);

    const plain = await request(app)
      .get('/reports/most-borrowed')
      .set(await librarianAuthHeaders());
    expect(plain.status).toBe(200);
    expect(plain.body).toHaveLength(2);

    const withPaging = await request(app)
      .get('/reports/most-borrowed?page=1&pageSize=1')
      .set(await librarianAuthHeaders());
    expect(withPaging.status).toBe(200);
    expect(withPaging.body).toEqual(plain.body);
    expect(withPaging.body).toHaveLength(2);
  });
});

describe('AC7: overdue summary report', () => {
  it('AC7: only members with a currently overdue loan appear, ordered by count then name', async () => {
    const dune = await createBookAsLibrarian('Dune');
    const emma = await createBookAsLibrarian('Emma');
    const neuromancer = await createBookAsLibrarian('Neuromancer');
    const middlemarch = await createBookAsLibrarian('Middlemarch');
    const returnedEarlyBook = await createBookAsLibrarian('Returned Early', 1);

    const ada = await createMemberAsLibrarian('Ada Lovelace', 'ada@example.com');
    const alan = await createMemberAsLibrarian('Alan Turing', 'alan@example.com');
    const zoe = await createMemberAsLibrarian('Zoe Zebra', 'zoe@example.com');
    const returner = await createMemberAsLibrarian('Returner Member', 'returner@example.com');

    await borrowAsLibrarian(ada.id, dune.id);
    await borrowAsLibrarian(ada.id, emma.id);
    await borrowAsLibrarian(alan.id, neuromancer.id);
    await borrowAsLibrarian(zoe.id, middlemarch.id);
    const returnedLoan = await borrowAsLibrarian(returner.id, returnedEarlyBook.id);

    // Returned well before the due date, so it can never become overdue.
    const returned = await returnAsLibrarian(returnedLoan.id);
    expect(returned.returnedAt).not.toBeNull();

    // Nothing is overdue yet: the status is recomputed from the clock per request.
    const beforeJump = await request(app)
      .get('/reports/overdue-summary')
      .set(await librarianAuthHeaders());
    expect(beforeJump.status).toBe(200);
    expect(beforeJump.body).toEqual([]);

    // No write happens between the two requests.
    vi.setSystemTime(NOW + LOAN_PERIOD_MS + 1000);

    const res = await request(app)
      .get('/reports/overdue-summary')
      .set(await librarianAuthHeaders());

    expect(res.status).toBe(200);

    const expected: OverdueSummaryEntry[] = [
      { memberId: ada.id, memberName: 'Ada Lovelace', overdueCount: 2 },
      // Alan Turing and Zoe Zebra are tied on one overdue loan each, so name A→Z decides.
      { memberId: alan.id, memberName: 'Alan Turing', overdueCount: 1 },
      { memberId: zoe.id, memberName: 'Zoe Zebra', overdueCount: 1 },
    ];
    expect(res.body).toEqual(expected);

    const reportedIds = (res.body as OverdueSummaryEntry[]).map((entry) => entry.memberId);
    expect(reportedIds).not.toContain(returner.id);
  });

  it('AC7: the clock is read per request — the exact due instant is not overdue, 1ms later it is', async () => {
    const member = await createMemberAsLibrarian('Ada Lovelace', 'ada@example.com');
    const book = await createBookAsLibrarian('Dune');
    const loan = await borrowAsLibrarian(member.id, book.id);

    vi.setSystemTime(Date.parse(loan.dueDate));

    const listAtDue = await request(app).get('/loans/overdue').set(await librarianAuthHeaders());
    expect(listAtDue.status).toBe(200);
    expect(listAtDue.body).toEqual([]);

    const summaryAtDue = await request(app)
      .get('/reports/overdue-summary')
      .set(await librarianAuthHeaders());
    expect(summaryAtDue.status).toBe(200);
    expect(summaryAtDue.body).toEqual([]);

    // No write happens between the two requests: the status is recomputed per request.
    vi.setSystemTime(Date.parse(loan.dueDate) + 1);

    const listAfter = await request(app).get('/loans/overdue').set(await librarianAuthHeaders());
    expect(listAfter.status).toBe(200);
    expect(listAfter.body).toHaveLength(1);
    expect(listAfter.body[0].id).toBe(loan.id);

    const summaryAfter = await request(app)
      .get('/reports/overdue-summary')
      .set(await librarianAuthHeaders());
    expect(summaryAfter.status).toBe(200);

    const expected: OverdueSummaryEntry[] = [
      { memberId: member.id, memberName: 'Ada Lovelace', overdueCount: 1 },
    ];
    expect(summaryAfter.body).toEqual(expected);
  });
});
