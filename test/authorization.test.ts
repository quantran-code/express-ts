import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../src/app';
import { resetBookStore } from '../src/store/books';
import { resetMemberStore } from '../src/store/members';
import { resetLoanStore, countActiveLoansForMember } from '../src/store/loans';
import { resetUserStore } from '../src/store/users';
import { loginAsSeededLibrarian } from './helpers/auth';

const validBook = {
  title: 'The Pragmatic Programmer',
  author: 'Andrew Hunt',
  isbn: '978-0135957059',
  totalCopies: 4,
};

const aliceUser = {
  name: 'Alice Johnson',
  email: 'alice@example.com',
  password: 'password123',
};

const bobUser = {
  name: 'Bob Smith',
  email: 'bob@example.com',
  password: 'password123',
};

let librarianToken = '';
let aliceToken = '';
let bobToken = '';
let aliceMember: { id: number; name: string; email: string };
let bobMember: { id: number; name: string; email: string };

function get(url: string, token: string) {
  return request(app).get(url).set('Authorization', `Bearer ${token}`);
}

function post(url: string, token: string, payload?: Record<string, unknown>) {
  const req = request(app).post(url).set('Authorization', `Bearer ${token}`);
  return payload === undefined ? req : req.send(payload);
}

function put(url: string, token: string, payload: Record<string, unknown>) {
  return request(app).put(url).set('Authorization', `Bearer ${token}`).send(payload);
}

function patch(url: string, token: string, payload: Record<string, unknown>) {
  return request(app).patch(url).set('Authorization', `Bearer ${token}`).send(payload);
}

function del(url: string, token: string) {
  return request(app).delete(url).set('Authorization', `Bearer ${token}`);
}

function postRegister(payload: Record<string, unknown>) {
  return request(app).post('/auth/register').send(payload);
}

function postLogin(email: string, password: string) {
  return request(app).post('/auth/login').send({ email, password });
}

function expectError(
  res: { status: number; body: unknown },
  status: number,
  code: string,
): void {
  expect(res.status).toBe(status);
  expect(res.body).toEqual({ error: { code, message: expect.any(String) } });
}

describe('Role-based authorization', () => {
  beforeEach(async () => {
    resetBookStore();
    resetMemberStore();
    resetLoanStore();
    resetUserStore();

    librarianToken = await loginAsSeededLibrarian();

    const aliceRegistration = await postRegister({
      name: aliceUser.name,
      email: aliceUser.email,
      password: aliceUser.password,
    });
    expect(aliceRegistration.status).toBe(201);

    const bobRegistration = await postRegister({
      name: bobUser.name,
      email: bobUser.email,
      password: bobUser.password,
    });
    expect(bobRegistration.status).toBe(201);

    const aliceMemberRes = await post('/members', librarianToken, {
      name: aliceUser.name,
      email: aliceUser.email,
    });
    expect(aliceMemberRes.status).toBe(201);
    aliceMember = aliceMemberRes.body;

    const bobMemberRes = await post('/members', librarianToken, {
      name: bobUser.name,
      email: bobUser.email,
    });
    expect(bobMemberRes.status).toBe(201);
    bobMember = bobMemberRes.body;

    const aliceLogin = await postLogin(aliceUser.email, aliceUser.password);
    expect(aliceLogin.status).toBe(200);
    aliceToken = aliceLogin.body.token as string;

    const bobLogin = await postLogin(bobUser.email, bobUser.password);
    expect(bobLogin.status).toBe(200);
    bobToken = bobLogin.body.token as string;
  });

  describe('member self-service on members', () => {
    it('lets a member view their own profile but not another member\'s', async () => {
      const own = await get(`/members/${aliceMember.id}`, aliceToken);
      expect(own.status).toBe(200);
      expect(own.body).toEqual(aliceMember);

      const other = await get(`/members/${bobMember.id}`, aliceToken);
      expectError(other, 404, 'NOT_FOUND');
    });

    it('lets a member view their own loans but not another member\'s', async () => {
      const own = await get(`/members/${aliceMember.id}/loans`, aliceToken);
      expect(own.status).toBe(200);
      expect(own.body).toEqual([]);

      const other = await get(`/members/${bobMember.id}/loans`, aliceToken);
      expectError(other, 404, 'NOT_FOUND');
    });
  });

  describe('member-scoped loans', () => {
    it('ignores a different memberId supplied by a member when borrowing', async () => {
      const book = await post('/books', librarianToken, validBook);
      expect(book.status).toBe(201);

      const res = await post('/loans', aliceToken, {
        bookId: book.body.id,
        memberId: bobMember.id,
      });

      expect(res.status).toBe(201);
      expect(res.body.memberId).toBe(aliceMember.id);
      expect(countActiveLoansForMember(aliceMember.id)).toBe(1);
      expect(countActiveLoansForMember(bobMember.id)).toBe(0);
    });

    it('uses the caller identity even when memberId is missing', async () => {
      const book = await post('/books', librarianToken, validBook);
      expect(book.status).toBe(201);

      const res = await post('/loans', aliceToken, { bookId: book.body.id });

      expect(res.status).toBe(201);
      expect(res.body.memberId).toBe(aliceMember.id);
      expect(countActiveLoansForMember(aliceMember.id)).toBe(1);
    });

    it('lets a member return their own loan', async () => {
      const book = await post('/books', librarianToken, validBook);
      expect(book.status).toBe(201);

      const borrow = await post('/loans', aliceToken, {
        bookId: book.body.id,
        memberId: bobMember.id,
      });
      expect(borrow.status).toBe(201);
      expect(borrow.body.memberId).toBe(aliceMember.id);

      const res = await post(`/loans/${borrow.body.id}/return`, aliceToken);
      expect(res.status).toBe(200);
      expect(res.body.returnedAt).toEqual(expect.any(String));
      expect(countActiveLoansForMember(aliceMember.id)).toBe(0);
    });

    it('returns LOAN_NOT_FOUND when a member tries to return another member\'s loan', async () => {
      const book = await post('/books', librarianToken, validBook);
      expect(book.status).toBe(201);

      const borrow = await post('/loans', librarianToken, {
        bookId: book.body.id,
        memberId: bobMember.id,
      });
      expect(borrow.status).toBe(201);

      const res = await post(`/loans/${borrow.body.id}/return`, aliceToken);
      expectError(res, 404, 'LOAN_NOT_FOUND');
      expect(countActiveLoansForMember(bobMember.id)).toBe(1);

      const librarianReturn = await post(`/loans/${borrow.body.id}/return`, librarianToken);
      expect(librarianReturn.status).toBe(200);
      expect(librarianReturn.body.memberId).toBe(bobMember.id);
    });

    it('lets a librarian borrow and return on behalf of any member explicitly', async () => {
      const book = await post('/books', librarianToken, validBook);
      expect(book.status).toBe(201);

      const borrow = await post('/loans', librarianToken, {
        bookId: book.body.id,
        memberId: bobMember.id,
      });
      expect(borrow.status).toBe(201);
      expect(borrow.body.memberId).toBe(bobMember.id);

      const res = await post(`/loans/${borrow.body.id}/return`, librarianToken);
      expect(res.status).toBe(200);
      expect(res.body.memberId).toBe(bobMember.id);
      expect(res.body.returnedAt).toEqual(expect.any(String));
    });
  });

  describe('member restrictions on books and members', () => {
    it('forbids a member from creating, updating, or deleting books', async () => {
      const createRes = await post('/books', aliceToken, validBook);
      expectError(createRes, 403, 'FORBIDDEN');

      const created = await post('/books', librarianToken, validBook);
      expect(created.status).toBe(201);
      const bookId = created.body.id as number;

      const updateRes = await put(`/books/${bookId}`, aliceToken, { title: 'Hacked Title' });
      expectError(updateRes, 403, 'FORBIDDEN');

      const patchRes = await patch(`/books/${bookId}`, aliceToken, { author: 'Hacked Author' });
      expectError(patchRes, 403, 'FORBIDDEN');

      const deleteRes = await del(`/books/${bookId}`, aliceToken);
      expectError(deleteRes, 403, 'FORBIDDEN');
    });

    it('forbids a member from listing, creating, updating, or deleting members', async () => {
      const listRes = await get('/members', aliceToken);
      expectError(listRes, 403, 'FORBIDDEN');

      const createRes = await post('/members', aliceToken, {
        name: 'Attempted Member',
        email: 'attempted@example.com',
      });
      expectError(createRes, 403, 'FORBIDDEN');

      const updateOwn = await put(`/members/${aliceMember.id}`, aliceToken, {
        name: 'Hacked Name',
      });
      expectError(updateOwn, 403, 'FORBIDDEN');

      const patchOther = await patch(`/members/${bobMember.id}`, aliceToken, {
        name: 'Hacked Name',
      });
      expectError(patchOther, 403, 'FORBIDDEN');

      const deleteOwn = await del(`/members/${aliceMember.id}`, aliceToken);
      expectError(deleteOwn, 403, 'FORBIDDEN');

      const deleteOther = await del(`/members/${bobMember.id}`, aliceToken);
      expectError(deleteOther, 403, 'FORBIDDEN');
    });

    it('keeps book list, search, and get-by-id available to a member', async () => {
      const created = await post('/books', librarianToken, validBook);
      expect(created.status).toBe(201);

      const listRes = await get('/books', aliceToken);
      expect(listRes.status).toBe(200);
      expect(listRes.body).toEqual([created.body]);

      const searchRes = await get('/books?q=PROGR', aliceToken);
      expect(searchRes.status).toBe(200);
      expect(searchRes.body).toEqual({
        data: [created.body],
        total: 1,
        page: 1,
        pageSize: 10,
      });

      const getRes = await get(`/books/${created.body.id}`, aliceToken);
      expect(getRes.status).toBe(200);
      expect(getRes.body).toEqual(created.body);
    });
  });

  describe('member restrictions on reports and overdue', () => {
    it('forbids a member from the overdue list and both reports', async () => {
      const overdue = await get('/loans/overdue', aliceToken);
      expectError(overdue, 403, 'FORBIDDEN');

      const mostBorrowed = await get('/reports/most-borrowed-books', aliceToken);
      expectError(mostBorrowed, 403, 'FORBIDDEN');

      const overdueSummary = await get('/reports/overdue-summary', aliceToken);
      expectError(overdueSummary, 403, 'FORBIDDEN');
    });
  });
});
