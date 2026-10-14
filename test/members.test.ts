import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../src/app';
import { resetBookStore } from '../src/store/books';
import { resetMemberStore } from '../src/store/members';
import { resetLoanStore } from '../src/store/loans';

const validMember = {
  name: 'Alice Johnson',
  email: 'alice@example.com',
};

const validBook = {
  title: 'The Pragmatic Programmer',
  author: 'Andrew Hunt',
  isbn: '978-0135957059',
  totalCopies: 4,
};

function postMember(payload: Record<string, unknown> = validMember) {
  return request(app).post('/members').send(payload);
}

function postBook(payload: Record<string, unknown> = validBook) {
  return request(app).post('/books').send(payload);
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

describe('Member API', () => {
  beforeEach(() => {
    resetBookStore();
    resetMemberStore();
    resetLoanStore();
  });

  describe('POST /members', () => {
    it('creates a member with an auto-increment id', async () => {
      const res = await postMember();

      expect(res.status).toBe(201);
      expect(res.body).toEqual({ ...validMember, id: 1 });
    });

    it('assigns incrementing integer ids', async () => {
      const first = await postMember();
      const second = await postMember({ ...validMember, email: 'bob@example.com' });

      expect(first.status).toBe(201);
      expect(second.status).toBe(201);
      expect(first.body.id).toBe(1);
      expect(second.body.id).toBe(2);
    });

    it('rejects members missing a required field', async () => {
      const withoutName = { email: validMember.email };
      const withoutEmail = { name: validMember.name };

      for (const payload of [withoutName, withoutEmail]) {
        const res = await postMember(payload);
        expectError(res, 400, 'INVALID_FIELDS');
      }
    });

    it('rejects a name that is not a non-empty string', async () => {
      for (const name of ['', '   ', 42, null]) {
        const res = await postMember({ ...validMember, name });
        expectError(res, 400, 'INVALID_FIELDS');
      }
    });

    it('rejects an invalid email', async () => {
      for (const email of ['', '   ', 'no-at-sign.com', 'missing-tld@example', 'alice bob@example.com']) {
        const res = await postMember({ ...validMember, email });
        expectError(res, 400, 'INVALID_FIELDS');
      }
    });

    it('rejects a duplicate email case-insensitively on the trimmed value', async () => {
      const first = await postMember();
      const second = await postMember({ ...validMember, email: '  Alice@Example.com  ' });

      expect(first.status).toBe(201);
      expectError(second, 409, 'DUPLICATE_EMAIL');
    });

    it('rejects a payload containing an unknown field', async () => {
      const res = await postMember({ ...validMember, id: 1 });
      expectError(res, 400, 'INVALID_FIELDS');
    });
  });

  describe('GET /members', () => {
    it('returns an empty array when there are no members', async () => {
      const res = await request(app).get('/members');

      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });

    it('returns all members in insertion order', async () => {
      const first = await postMember();
      const second = await postMember({ name: 'Bob Smith', email: 'bob@example.com' });

      const res = await request(app).get('/members');

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(2);
      expect(res.body[0].id).toBe(first.body.id);
      expect(res.body[1].id).toBe(second.body.id);
    });
  });

  describe('GET /members/:id', () => {
    it('returns the member for a known id', async () => {
      const created = await postMember();
      const res = await request(app).get(`/members/${created.body.id}`);

      expect(res.status).toBe(200);
      expect(res.body).toEqual(created.body);
    });

    it('returns 404 for an unknown id', async () => {
      const res = await request(app).get('/members/999');
      expectError(res, 404, 'NOT_FOUND');
    });

    it('returns 404 for a non-numeric id', async () => {
      for (const id of ['abc', '1.5', '-1', '0']) {
        const res = await request(app).get(`/members/${id}`);
        expectError(res, 404, 'NOT_FOUND');
      }
    });
  });

  describe('PUT /members/:id and PATCH /members/:id', () => {
    it('updates a name via PUT and leaves the email unchanged', async () => {
      const created = await postMember();
      const res = await request(app)
        .put(`/members/${created.body.id}`)
        .send({ name: 'Updated Name' });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ...created.body, name: 'Updated Name' });
    });

    it('applies a partial patch via PATCH', async () => {
      const created = await postMember();
      const res = await request(app)
        .patch(`/members/${created.body.id}`)
        .send({ email: 'new@example.com' });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ...created.body, email: 'new@example.com' });
    });

    it('rejects updating to an email that belongs to another member', async () => {
      const first = await postMember();
      const second = await postMember({ name: 'Bob Smith', email: 'bob@example.com' });

      const res = await request(app)
        .put(`/members/${second.body.id}`)
        .send({ email: validMember.email });

      expect(first.status).toBe(201);
      expectError(res, 409, 'DUPLICATE_EMAIL');
    });

    it('allows updating to the same email with different case and whitespace', async () => {
      const created = await postMember();
      const res = await request(app)
        .patch(`/members/${created.body.id}`)
        .send({ email: '  Alice@Example.com  ' });

      expect(res.status).toBe(200);
      expect(res.body.email).toBe('Alice@Example.com');
    });

    it('rejects an empty patch', async () => {
      const created = await postMember();
      const res = await request(app)
        .patch(`/members/${created.body.id}`)
        .send({});

      expectError(res, 400, 'INVALID_FIELDS');
    });

    it('rejects a patch containing an unknown field', async () => {
      const created = await postMember();
      const res = await request(app)
        .patch(`/members/${created.body.id}`)
        .send({ id: 99 });

      expectError(res, 400, 'INVALID_FIELDS');
    });

    it('returns 404 for an unknown id', async () => {
      const res = await request(app).put('/members/999').send({ name: 'Nope' });
      expectError(res, 404, 'NOT_FOUND');
    });

    it('returns 404 for a non-numeric id', async () => {
      const res = await request(app).put('/members/abc').send({ name: 'Nope' });
      expectError(res, 404, 'NOT_FOUND');
    });
  });

  describe('DELETE /members/:id', () => {
    it('deletes a member when they have no active loans', async () => {
      const created = await postMember();
      const res = await request(app).delete(`/members/${created.body.id}`);

      expect(res.status).toBe(200);
      expect(res.body).toEqual(created.body);

      const after = await request(app).get(`/members/${created.body.id}`);
      expect(after.status).toBe(404);
    });

    it('rejects deleting a member while they have an active loan', async () => {
      const member = await postMember();
      const book = await postBook();

      const loan = await postLoan({ bookId: book.body.id, memberId: member.body.id });
      expect(loan.status).toBe(201);

      const res = await request(app).delete(`/members/${member.body.id}`);
      expectError(res, 422, 'MEMBER_HAS_ACTIVE_LOANS');

      const after = await request(app).get(`/members/${member.body.id}`);
      expect(after.status).toBe(200);
      expect(after.body).toEqual(member.body);
    });

    it('deletes a member once their loans have all been returned', async () => {
      const member = await postMember();
      const book = await postBook();

      const loan = await postLoan({ bookId: book.body.id, memberId: member.body.id });
      expect(loan.status).toBe(201);

      const returned = await request(app).post(`/loans/${loan.body.id}/return`);
      expect(returned.status).toBe(200);

      const res = await request(app).delete(`/members/${member.body.id}`);
      expect(res.status).toBe(200);
      expect(res.body).toEqual(member.body);

      const after = await request(app).get(`/members/${member.body.id}`);
      expect(after.status).toBe(404);
    });

    it('returns 404 for an unknown id', async () => {
      const res = await request(app).delete('/members/999');
      expectError(res, 404, 'NOT_FOUND');
    });

    it('returns 404 for a non-numeric id', async () => {
      const res = await request(app).delete('/members/abc');
      expectError(res, 404, 'NOT_FOUND');
    });
  });

  describe('GET /members/:id/loans', () => {
    it('returns an empty array when the member has no loans', async () => {
      const created = await postMember();

      const res = await request(app).get(`/members/${created.body.id}/loans`);

      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });

    it('returns only the active loans for the requested member', async () => {
      const member = await postMember();
      const otherMember = await postMember({ name: 'Bob Smith', email: 'bob@example.com' });
      const firstBook = await postBook();
      const secondBook = await postBook({ ...validBook, isbn: '978-0134757599' });
      const thirdBook = await postBook({ ...validBook, isbn: '978-0201633610' });

      const first = await postLoan({ bookId: firstBook.body.id, memberId: member.body.id });
      const second = await postLoan({ bookId: secondBook.body.id, memberId: member.body.id });
      const other = await postLoan({ bookId: thirdBook.body.id, memberId: otherMember.body.id });

      expect(first.status).toBe(201);
      expect(second.status).toBe(201);
      expect(other.status).toBe(201);

      const res = await request(app).get(`/members/${member.body.id}/loans`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(2);
      for (const loan of res.body) {
        expect(loan.memberId).toBe(member.body.id);
        expect(loan.returnedAt).toBeNull();
      }
      expect(res.body.map((loan: { bookId: number }) => loan.bookId)).toEqual([
        firstBook.body.id,
        secondBook.body.id,
      ]);
    });

    it('excludes loans that have been returned', async () => {
      const member = await postMember();
      const firstBook = await postBook();
      const secondBook = await postBook({ ...validBook, isbn: '978-0134757599' });

      const first = await postLoan({ bookId: firstBook.body.id, memberId: member.body.id });
      const second = await postLoan({ bookId: secondBook.body.id, memberId: member.body.id });
      expect(first.status).toBe(201);
      expect(second.status).toBe(201);

      const returned = await request(app).post(`/loans/${first.body.id}/return`);
      expect(returned.status).toBe(200);

      const res = await request(app).get(`/members/${member.body.id}/loans`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].bookId).toBe(secondBook.body.id);
      expect(res.body[0].returnedAt).toBeNull();
    });

    it('returns 404 for an unknown member id', async () => {
      const res = await request(app).get('/members/999/loans');
      expectError(res, 404, 'NOT_FOUND');
    });

    it('returns 404 for a non-numeric member id', async () => {
      for (const id of ['abc', '1.5', '-1', '0']) {
        const res = await request(app).get(`/members/${id}/loans`);
        expectError(res, 404, 'NOT_FOUND');
      }
    });
  });
});
