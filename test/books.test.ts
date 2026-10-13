import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../src/app';
import { resetBookStore, getBook } from '../src/store/books';

const validBook = {
  title: 'The Pragmatic Programmer',
  author: 'Andrew Hunt',
  isbn: '978-0135957059',
  totalCopies: 4,
};

function postBook(payload: Record<string, unknown> = validBook) {
  return request(app).post('/books').send(payload);
}

function expectError(
  res: { status: number; body: unknown },
  status: number,
  code: string,
): void {
  expect(res.status).toBe(status);
  expect(res.body).toEqual({ error: { code, message: expect.any(String) } });
}

function expectValidCopies(book: { totalCopies: number; availableCopies: number }): void {
  expect(book.availableCopies).toBeGreaterThanOrEqual(0);
  expect(book.availableCopies).toBeLessThanOrEqual(book.totalCopies);
}

describe('Book API', () => {
  beforeEach(() => {
    resetBookStore();
  });

  describe('POST /books', () => {
    it('creates a book with an auto-increment id and availableCopies set to totalCopies', async () => {
      const res = await postBook();

      expect(res.status).toBe(201);
      expect(res.body).toEqual({
        ...validBook,
        id: 1,
        availableCopies: validBook.totalCopies,
      });
      expect(res.body.availableCopies).toBe(res.body.totalCopies);
      expectValidCopies(res.body);
    });

    it('assigns incrementing integer ids', async () => {
      const first = await postBook();
      const second = await postBook({ ...validBook, isbn: '978-0201633610' });

      expect(first.status).toBe(201);
      expect(second.status).toBe(201);
      expect(first.body.id).toBe(1);
      expect(second.body.id).toBe(2);
      expectValidCopies(second.body);
    });

    it('rejects books missing a required field', async () => {
      const withoutTitle = {
        author: validBook.author,
        isbn: validBook.isbn,
        totalCopies: validBook.totalCopies,
      };
      const withoutAuthor = {
        title: validBook.title,
        isbn: validBook.isbn,
        totalCopies: validBook.totalCopies,
      };
      const withoutIsbn = {
        title: validBook.title,
        author: validBook.author,
        totalCopies: validBook.totalCopies,
      };
      const withoutTotalCopies = {
        title: validBook.title,
        author: validBook.author,
        isbn: validBook.isbn,
      };

      for (const payload of [withoutTitle, withoutAuthor, withoutIsbn, withoutTotalCopies]) {
        const res = await postBook(payload);
        expectError(res, 400, 'INVALID_FIELDS');
      }
    });

    it('rejects a totalCopies that is not an integer greater than 0', async () => {
      for (const totalCopies of [0, -2, 1.5, '3', null]) {
        const res = await postBook({ ...validBook, totalCopies });
        expectError(res, 400, 'INVALID_FIELDS');
      }
    });

    it('rejects a duplicate ISBN', async () => {
      const first = await postBook();
      const second = await postBook();

      expect(first.status).toBe(201);
      expectError(second, 409, 'DUPLICATE_ISBN');
    });

    it('rejects a payload that sets availableCopies directly', async () => {
      const res = await postBook({ ...validBook, availableCopies: 1 });
      expectError(res, 400, 'INVALID_FIELDS');
    });

    it('rejects a payload containing an unknown field', async () => {
      const res = await postBook({ ...validBook, genre: 'Software' });
      expectError(res, 400, 'INVALID_FIELDS');
    });
  });

  describe('GET /books', () => {
    it('returns an empty array when the catalog is empty', async () => {
      const res = await request(app).get('/books');

      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });

    it('returns all books in insertion order', async () => {
      const first = await postBook();
      const second = await postBook({
        ...validBook,
        title: 'Refactoring',
        isbn: '978-0134757599',
      });

      const res = await request(app).get('/books');

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(2);
      expect(res.body[0].id).toBe(first.body.id);
      expect(res.body[1].id).toBe(second.body.id);
      for (const book of res.body) {
        expectValidCopies(book);
      }
    });
  });

  describe('GET /books/:id', () => {
    it('returns the book for a known id', async () => {
      const created = await postBook();
      const res = await request(app).get(`/books/${created.body.id}`);

      expect(res.status).toBe(200);
      expect(res.body).toEqual(created.body);
      expectValidCopies(res.body);
    });

    it('returns 404 for an unknown id', async () => {
      const res = await request(app).get('/books/999');
      expectError(res, 404, 'NOT_FOUND');
    });

    it('returns 404 for a non-numeric id', async () => {
      for (const id of ['abc', '1.5', '-1', '0']) {
        const res = await request(app).get(`/books/${id}`);
        expectError(res, 404, 'NOT_FOUND');
      }
    });
  });

  describe('PUT /books/:id and PATCH /books/:id', () => {
    it('updates a title via PUT and leaves other fields unchanged', async () => {
      const created = await postBook();
      const res = await request(app)
        .put(`/books/${created.body.id}`)
        .send({ title: 'Updated Title' });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ...created.body, title: 'Updated Title' });
      expectValidCopies(res.body);
    });

    it('applies a partial patch via PATCH', async () => {
      const created = await postBook();
      const res = await request(app)
        .patch(`/books/${created.body.id}`)
        .send({ author: 'New Author' });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ...created.body, author: 'New Author' });
      expectValidCopies(res.body);
    });

    it('rejects updating to an ISBN that belongs to another book', async () => {
      const first = await postBook();
      const second = await postBook({ ...validBook, isbn: '978-0134757599' });

      const res = await request(app)
        .put(`/books/${second.body.id}`)
        .send({ isbn: validBook.isbn });

      expect(first.status).toBe(201);
      expectError(res, 409, 'DUPLICATE_ISBN');
    });

    it('recomputes availableCopies when totalCopies changes', async () => {
      const created = await postBook({ ...validBook, totalCopies: 5 });
      const stored = getBook(created.body.id);
      expect(stored).toBeDefined();

      // Borrowing is out of scope, so simulate copies on loan directly.
      stored!.availableCopies = 3;

      const res = await request(app)
        .put(`/books/${created.body.id}`)
        .send({ totalCopies: 7 });

      expect(res.status).toBe(200);
      expect(res.body.totalCopies).toBe(7);
      // 7 - (5 - 3) = 5
      expect(res.body.availableCopies).toBe(5);
      expectValidCopies(res.body);
    });

    it('rejects reducing totalCopies below the number of copies on loan', async () => {
      const created = await postBook({ ...validBook, totalCopies: 5 });
      const stored = getBook(created.body.id);
      expect(stored).toBeDefined();

      // Three copies are on loan.
      stored!.availableCopies = 2;

      const res = await request(app)
        .put(`/books/${created.body.id}`)
        .send({ totalCopies: 1 });

      expectError(res, 422, 'INVENTORY_CONFLICT');
    });

    it('rejects a patch that sets availableCopies directly', async () => {
      const created = await postBook();
      const res = await request(app)
        .patch(`/books/${created.body.id}`)
        .send({ availableCopies: 0 });

      expectError(res, 400, 'INVALID_FIELDS');
    });

    it('rejects an empty patch', async () => {
      const created = await postBook();
      const res = await request(app)
        .patch(`/books/${created.body.id}`)
        .send({});

      expectError(res, 400, 'INVALID_FIELDS');
    });

    it('returns 404 for an unknown id', async () => {
      const res = await request(app).put('/books/999').send({ title: 'Nope' });
      expectError(res, 404, 'NOT_FOUND');
    });

    it('returns 404 for a non-numeric id', async () => {
      const res = await request(app).put('/books/abc').send({ title: 'Nope' });
      expectError(res, 404, 'NOT_FOUND');
    });
  });

  describe('DELETE /books/:id', () => {
    it('deletes a book when no copies are on loan', async () => {
      const created = await postBook();
      const res = await request(app).delete(`/books/${created.body.id}`);

      expect(res.status).toBe(200);
      expect(res.body).toEqual(created.body);
      expectValidCopies(res.body);

      const after = await request(app).get(`/books/${created.body.id}`);
      expect(after.status).toBe(404);
    });

    it('refuses to delete a book while copies are on loan', async () => {
      const created = await postBook({ ...validBook, totalCopies: 3 });
      const stored = getBook(created.body.id);
      expect(stored).toBeDefined();

      // One copy is on loan.
      stored!.availableCopies = 2;

      const res = await request(app).delete(`/books/${created.body.id}`);
      expectError(res, 422, 'INVENTORY_CONFLICT');

      const after = await request(app).get(`/books/${created.body.id}`);
      expect(after.status).toBe(200);
    });

    it('returns 404 for an unknown id', async () => {
      const res = await request(app).delete('/books/999');
      expectError(res, 404, 'NOT_FOUND');
    });

    it('returns 404 for a non-numeric id', async () => {
      const res = await request(app).delete('/books/abc');
      expectError(res, 404, 'NOT_FOUND');
    });
  });
});
