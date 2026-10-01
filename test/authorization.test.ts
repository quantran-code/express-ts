import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../src/app';
import { reset as resetBookRepository } from '../src/repositories/bookRepository';
import { reset as resetMemberRepository } from '../src/repositories/memberRepository';
import { reset as resetLoanRepository } from '../src/repositories/loanRepository';

type Headers = { Authorization: string };

const getAuthHeaders = async (email: string, password: string): Promise<Headers> => {
  const adminRes = await request(app)
    .post('/auth/login')
    .send({ email, password });

  return {
    Authorization: `Bearer ${adminRes.body.token}`,
  };
};

describe('Authorization', () => {
  beforeEach(() => {
    resetBookRepository();
    resetMemberRepository();
    resetLoanRepository();
  });

  it('unauthenticated requests to protected endpoints return 401', async () => {
    const resBooks = await request(app).get('/books');
    expect(resBooks.status).toBe(401);

    const resReports = await request(app).get('/reports/most-borrowed');
    expect(resReports.status).toBe(401);

    const resOverdue = await request(app).get('/loans/overdue');
    expect(resOverdue.status).toBe(401);
  });

  it('member cannot access reports/overdue', async () => {
    await request(app).post('/auth/register').send({
      name: 'Member',
      email: 'member-auth-1@example.com',
      password: 'password123',
    });

    const headers = await getAuthHeaders('member-auth-1@example.com', 'password123');

    const most = await request(app).get('/reports/most-borrowed').set(headers);
    expect(most.status).toBe(403);

    const overdueSummary = await request(app).get('/reports/overdue-summary').set(headers);
    expect(overdueSummary.status).toBe(403);

    const overdueLoans = await request(app).get('/loans/overdue').set(headers);
    expect(overdueLoans.status).toBe(403);
  });

  it('member cannot access another member profile and cannot borrow/return for someone else', async () => {
    const m1Res = await request(app).post('/auth/register').send({
      name: 'Member 1',
      email: 'member-auth-3a@example.com',
      password: 'password123',
    });
    expect(m1Res.status).toBe(201);

    const m2Res = await request(app).post('/auth/register').send({
      name: 'Member 2',
      email: 'member-auth-3b@example.com',
      password: 'password123',
    });
    expect(m2Res.status).toBe(201);

    const headersM1 = await getAuthHeaders('member-auth-3a@example.com', 'password123');

    // cross-member GET /members/:id should be 403
    const crossProfile = await request(app)
      .get(`/members/${m2Res.body.id}`)
      .set(headersM1);
    expect(crossProfile.status).toBe(403);

    // borrow/return identity: member must use their own id, mismatched URL gives 403
    const librarianHeaders = await getAuthHeaders('librarian@example.com', 'librarian-password');
    const bookRes = await request(app)
      .post('/books')
      .set(librarianHeaders)
      .send({ title: 'Some Book', author: 'Some Author', isbn: 'isbn-iden', totalCopies: 2 });
    expect(bookRes.status).toBe(201);

    const borrowMismatch = await request(app)
      .post(`/members/${m2Res.body.id}/loans`)
      .set(headersM1)
      .send({ bookId: bookRes.body.id, copies: 1 });
    expect(borrowMismatch.status).toBe(403);

    const returnMismatch = await request(app)
      .post(`/members/${m2Res.body.id}/returns`)
      .set(headersM1)
      .send({ bookId: bookRes.body.id, copies: 1 });
    expect(returnMismatch.status).toBe(403);
  });
});
