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

describe('Loan dueDate', () => {
  beforeEach(() => {
    resetBookRepository();
    resetMemberRepository();
    resetLoanRepository();
  });

  it('sets dueDate to borrowedAt + 14 days', async () => {
    const now = new Date('2026-01-01T00:00:00.000Z');

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const viAny = (vi as any);
    viAny.useFakeTimers();
    viAny.setSystemTime(now);

    const bookRes = await request(app)
      .post('/books')
      .send(createBookPayload({ isbn: 'isbn-loan-duedate-1', totalCopies: 2 }));
    expect(bookRes.status).toBe(201);

    const memberRes = await request(app).post('/members').send(createMemberPayload({ email: 'member-loan-duedate-1@example.com' }));
    expect(memberRes.status).toBe(201);

    const memberId = memberRes.body.id;
    const bookId = bookRes.body.id;

    const borrowRes = await request(app)
      .post(`/members/${memberId}/loans`)
      .send({ bookId, copies: 1 });
    expect(borrowRes.status).toBe(201);

    expect(borrowRes.body.borrowedAt).toBeTypeOf('string');
    expect(borrowRes.body.dueDate).toBeTypeOf('string');

    const expectedDueDate = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000).toISOString();
    expect(borrowRes.body.dueDate).toBe(expectedDueDate);

    viAny.useRealTimers();
  });
});
