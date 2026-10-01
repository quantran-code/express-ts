import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import app from '../src/app';
import { reset as resetBookRepository } from '../src/repositories/bookRepository';
import { reset as resetMemberRepository } from '../src/repositories/memberRepository';
import { reset as resetLoanRepository } from '../src/repositories/loanRepository';

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

describe('Overdue loans', () => {
  beforeEach(() => {
    resetBookRepository();
    resetMemberRepository();
    resetLoanRepository();
  });

  it('shows overdue loans only when dueDate has passed and loan not returned; flips at request time', async () => {
    const now = new Date('2026-01-01T00:00:00.000Z');

    const viAny = (vi as any);
    viAny.useFakeTimers();
    viAny.setSystemTime(now);

    const bookRes = await request(app)
      .post('/books')
      .send(createBookPayload({ isbn: 'isbn-overdue-1', totalCopies: 2 }));
    expect(bookRes.status).toBe(201);

    const memberRes = await request(app)
      .post('/members')
      .send(createMemberPayload({ email: 'member-overdue-1@example.com' }));
    expect(memberRes.status).toBe(201);

    const memberId = memberRes.body.id;
    const bookId = bookRes.body.id;

    const borrowRes = await request(app)
      .post(`/members/${memberId}/loans`)
      .send({ bookId, copies: 1 });
    expect(borrowRes.status).toBe(201);

    // Not overdue yet (exactly at borrowedAt, dueDate is in the future)
    const overdueRes1 = await request(app).get('/loans/overdue');
    expect(overdueRes1.status).toBe(200);
    expect(overdueRes1.body.items.length).toBe(0);

    const dueDate = new Date(borrowRes.body.dueDate);

    // Move time to just before dueDate
    viAny.setSystemTime(new Date(dueDate.getTime() - 1).toISOString());

    const overdueRes2 = await request(app).get('/loans/overdue');
    expect(overdueRes2.status).toBe(200);
    expect(overdueRes2.body.items.length).toBe(0);

    // Move time to after dueDate
    viAny.setSystemTime(new Date(dueDate.getTime() + 1).toISOString());

    const overdueRes3 = await request(app).get('/loans/overdue');
    expect(overdueRes3.status).toBe(200);
    expect(overdueRes3.body.total).toBe(1);
    expect(overdueRes3.body.items[0].id).toBe(borrowRes.body.id);

    // Returned loans must not be shown as overdue
    const returnRes = await request(app)
      .post(`/members/${memberId}/returns`)
      .send({ bookId, copies: 1 });
    expect(returnRes.status).toBe(200);

    const overdueRes4 = await request(app).get('/loans/overdue');
    expect(overdueRes4.status).toBe(200);
    expect(overdueRes4.body.items.length).toBe(0);

    viAny.useRealTimers();
  });

  it('does not show loans whose dueDate has not passed', async () => {
    const now = new Date('2026-01-01T00:00:00.000Z');

    const viAny = (vi as any);
    viAny.useFakeTimers();
    viAny.setSystemTime(now);

    const bookRes = await request(app)
      .post('/books')
      .send(createBookPayload({ isbn: 'isbn-overdue-2', totalCopies: 2 }));
    expect(bookRes.status).toBe(201);

    const memberRes = await request(app)
      .post('/members')
      .send(createMemberPayload({ email: 'member-overdue-2@example.com' }));
    expect(memberRes.status).toBe(201);

    const memberId = memberRes.body.id;
    const bookId = bookRes.body.id;

    const borrowRes = await request(app)
      .post(`/members/${memberId}/loans`)
      .send({ bookId, copies: 1 });
    expect(borrowRes.status).toBe(201);

    // Set time to borrowedAt + 13 days (dueDate is +14 days)
    viAny.setSystemTime(new Date(new Date(borrowRes.body.borrowedAt).getTime() + 13 * 24 * 60 * 60 * 1000).toISOString());

    const overdueRes = await request(app).get('/loans/overdue');
    expect(overdueRes.status).toBe(200);
    expect(overdueRes.body.items.length).toBe(0);

    viAny.useRealTimers();
  });
});
