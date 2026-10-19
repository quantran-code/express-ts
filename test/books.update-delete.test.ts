import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../src/app';
import type { Book } from '../src/books/types';
import { patchBook as patchStoredBook, resetBooks } from '../src/books/store';
import { librarianAuthHeaders } from './helpers/auth';

const validBook = {
  title: 'Dune',
  author: 'Frank Herbert',
  isbn: '978-0-441-17271-9',
  totalCopies: 3,
};

let authHeader: { Authorization: string };

beforeEach(async () => {
  resetBooks();
  authHeader = await librarianAuthHeaders();
});

async function createTestBook(overrides: Partial<typeof validBook> = {}): Promise<Book> {
  const res = await request(app)
    .post('/books')
    .set(authHeader)
    .send({ ...validBook, ...overrides });

  expect(res.status).toBe(201);
  return res.body as Book;
}

/**
 * Seeds a catalog state with copies on loan. The HTTP routes only ever shift
 * availableCopies by the totalCopies delta, so a fixture where
 * availableCopies < totalCopies has to be produced through the store.
 */
function seedCopiesOnLoan(id: string, availableCopies: number): void {
  const updated = patchStoredBook(id, {}, availableCopies);
  expect(updated).toBeDefined();
  expect(updated?.totalCopies).toBe(5);
  expect(updated?.availableCopies).toBe(availableCopies);
}

describe('PUT /books/:id', () => {
  it('replaces every field of the book', async () => {
    const created = await createTestBook();

    const res = await request(app)
      .put(`/books/${created.id}`)
      .set(authHeader)
      .send({
        title: 'Dune Messiah',
        author: 'Frank Herbert',
        isbn: '978-0-575-07490-6',
        totalCopies: 4,
      });

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(created.id);
    expect(res.body.title).toBe('Dune Messiah');
    expect(res.body.author).toBe('Frank Herbert');
    expect(res.body.isbn).toBe('9780575074906');
    expect(res.body.totalCopies).toBe(4);
    expect(res.body.availableCopies).toBe(4);

    const stored = await request(app).get(`/books/${created.id}`).set(authHeader);
    expect(stored.status).toBe(200);
    expect(stored.body).toEqual(res.body);
  });

  it('rejects a body missing a required field and leaves the book unchanged', async () => {
    const created = await createTestBook();

    const res = await request(app)
      .put(`/books/${created.id}`)
      .set(authHeader)
      .send({
        title: 'Dune Messiah',
        isbn: '978-0-575-07490-6',
        totalCopies: 4,
      });

    expect(res.status).toBe(400);
    expect(res.body.errors.author).toBeDefined();

    const stored = await request(app).get(`/books/${created.id}`).set(authHeader);
    expect(stored.status).toBe(200);
    expect(stored.body).toEqual(created);
  });

  it('keeps the on-loan count when totalCopies grows', async () => {
    const created = await createTestBook({ totalCopies: 5 });
    seedCopiesOnLoan(created.id, 3);

    const res = await request(app)
      .put(`/books/${created.id}`)
      .set(authHeader)
      .send({
        title: 'Dune',
        author: 'Frank Herbert',
        isbn: '978-0-441-17271-9',
        totalCopies: 8,
      });

    expect(res.status).toBe(200);
    expect(res.body.totalCopies).toBe(8);
    expect(res.body.availableCopies).toBe(6);
  });

  it('returns 409 when the new totalCopies would drive availableCopies negative', async () => {
    const created = await createTestBook({ totalCopies: 5 });
    seedCopiesOnLoan(created.id, 3);

    const res = await request(app)
      .put(`/books/${created.id}`)
      .set(authHeader)
      .send({
        title: 'Dune',
        author: 'Frank Herbert',
        isbn: '978-0-441-17271-9',
        totalCopies: 1,
      });

    expect(res.status).toBe(409);
    expect(res.body.error).toBeDefined();

    const stored = await request(app).get(`/books/${created.id}`).set(authHeader);
    expect(stored.status).toBe(200);
    expect(stored.body.totalCopies).toBe(5);
    expect(stored.body.availableCopies).toBe(3);
  });

  it('returns 409 when the isbn belongs to another book', async () => {
    const first = await createTestBook({
      title: 'Dune',
      author: 'Frank Herbert',
      isbn: '0-8044-2957-X',
      totalCopies: 3,
    });
    const second = await createTestBook({
      title: 'Dune Messiah',
      author: 'Frank Herbert',
      isbn: '978-0-441-17271-9',
      totalCopies: 2,
    });

    const res = await request(app)
      .put(`/books/${second.id}`)
      .set(authHeader)
      .send({
        title: 'Dune Messiah',
        author: 'Frank Herbert',
        isbn: '080442957x',
        totalCopies: 2,
      });

    expect(res.status).toBe(409);
    expect(res.body.error).toBeDefined();

    const storedFirst = await request(app).get(`/books/${first.id}`).set(authHeader);
    const storedSecond = await request(app).get(`/books/${second.id}`).set(authHeader);
    expect(storedFirst.body.isbn).toBe('080442957X');
    expect(storedSecond.body.isbn).toBe('9780441172719');
  });

  it('returns 404 for an unknown id', async () => {
    const res = await request(app)
      .put('/books/2b3c4d5e-0000-0000-0000-000000000000')
      .set(authHeader)
      .send(validBook);

    expect(res.status).toBe(404);
    expect(res.body.error).toBeDefined();
  });
});

describe('PATCH /books/:id', () => {
  it('updates only the supplied field', async () => {
    const created = await createTestBook();

    const res = await request(app)
      .patch(`/books/${created.id}`)
      .set(authHeader)
      .send({ title: 'New title' });

    expect(res.status).toBe(200);
    expect(res.body.title).toBe('New title');
    expect(res.body.author).toBe(created.author);
    expect(res.body.isbn).toBe(created.isbn);
    expect(res.body.totalCopies).toBe(created.totalCopies);
    expect(res.body.availableCopies).toBe(created.availableCopies);
  });

  it('accepts an empty patch and changes nothing', async () => {
    const created = await createTestBook();

    const res = await request(app).patch(`/books/${created.id}`).set(authHeader).send({});

    expect(res.status).toBe(200);
    expect(res.body).toEqual(created);
  });

  it('keeps the on-loan count when totalCopies grows', async () => {
    const created = await createTestBook({ totalCopies: 5 });
    seedCopiesOnLoan(created.id, 3);

    const res = await request(app)
      .patch(`/books/${created.id}`)
      .set(authHeader)
      .send({ totalCopies: 8 });

    expect(res.status).toBe(200);
    expect(res.body.totalCopies).toBe(8);
    expect(res.body.availableCopies).toBe(6);
  });

  it('returns 409 when the new totalCopies would drive availableCopies negative', async () => {
    const created = await createTestBook({ totalCopies: 5 });
    seedCopiesOnLoan(created.id, 3);

    const res = await request(app)
      .patch(`/books/${created.id}`)
      .set(authHeader)
      .send({ totalCopies: 1 });

    expect(res.status).toBe(409);
    expect(res.body.error).toBeDefined();

    const stored = await request(app).get(`/books/${created.id}`).set(authHeader);
    expect(stored.status).toBe(200);
    expect(stored.body.totalCopies).toBe(5);
    expect(stored.body.availableCopies).toBe(3);
  });

  it('rejects an invalid field and leaves the book unchanged', async () => {
    const created = await createTestBook();

    const res = await request(app)
      .patch(`/books/${created.id}`)
      .set(authHeader)
      .send({ totalCopies: 0 });

    expect(res.status).toBe(400);
    expect(res.body.errors.totalCopies).toBeDefined();

    const stored = await request(app).get(`/books/${created.id}`).set(authHeader);
    expect(stored.body).toEqual(created);
  });

  it('returns 409 when the isbn belongs to another book and leaves both unchanged', async () => {
    const first = await createTestBook({
      title: 'Dune',
      author: 'Frank Herbert',
      isbn: '0-8044-2957-X',
      totalCopies: 3,
    });
    const second = await createTestBook({
      title: 'Dune Messiah',
      author: 'Frank Herbert',
      isbn: '978-0-441-17271-9',
      totalCopies: 2,
    });

    const res = await request(app)
      .patch(`/books/${second.id}`)
      .set(authHeader)
      .send({ isbn: '080442957x' });

    expect(res.status).toBe(409);
    expect(res.body.error).toBeDefined();

    const storedFirst = await request(app).get(`/books/${first.id}`).set(authHeader);
    const storedSecond = await request(app).get(`/books/${second.id}`).set(authHeader);
    expect(storedFirst.body.isbn).toBe('080442957X');
    expect(storedSecond.body.isbn).toBe('9780441172719');
  });

  it('allows the book to keep its own isbn', async () => {
    const created = await createTestBook();

    const res = await request(app)
      .patch(`/books/${created.id}`)
      .set(authHeader)
      .send({ title: 'Dune (Deluxe)', isbn: '978-0-441-17271-9' });

    expect(res.status).toBe(200);
    expect(res.body.title).toBe('Dune (Deluxe)');
    expect(res.body.isbn).toBe('9780441172719');
  });

  it('ignores availableCopies supplied in the body', async () => {
    const created = await createTestBook({ totalCopies: 5 });
    seedCopiesOnLoan(created.id, 3);

    const res = await request(app)
      .patch(`/books/${created.id}`)
      .set(authHeader)
      .send({ availableCopies: 5 });

    expect(res.status).toBe(200);
    expect(res.body.totalCopies).toBe(5);
    expect(res.body.availableCopies).toBe(3);
  });

  it('returns 404 for an unknown id', async () => {
    const res = await request(app)
      .patch('/books/2b3c4d5e-0000-0000-0000-000000000000')
      .set(authHeader)
      .send({ title: 'New title' });

    expect(res.status).toBe(404);
    expect(res.body.error).toBeDefined();
  });
});

describe('DELETE /books/:id', () => {
  it('deletes a book with no copies on loan', async () => {
    const created = await createTestBook();

    const res = await request(app).delete(`/books/${created.id}`).set(authHeader);

    expect(res.status).toBe(204);

    const stored = await request(app).get(`/books/${created.id}`).set(authHeader);
    expect(stored.status).toBe(404);
  });

  it('returns 409 when copies are on loan', async () => {
    const created = await createTestBook({ totalCopies: 5 });
    seedCopiesOnLoan(created.id, 3);

    const res = await request(app).delete(`/books/${created.id}`).set(authHeader);

    expect(res.status).toBe(409);
    expect(res.body.error).toBeDefined();

    const stored = await request(app).get(`/books/${created.id}`).set(authHeader);
    expect(stored.status).toBe(200);
    expect(stored.body.totalCopies).toBe(5);
    expect(stored.body.availableCopies).toBe(3);
  });

  it('returns 404 for an unknown id', async () => {
    const res = await request(app)
      .delete('/books/2b3c4d5e-0000-0000-0000-000000000000')
      .set(authHeader);

    expect(res.status).toBe(404);
    expect(res.body.error).toBeDefined();
  });
});

describe('route smoke', () => {
  it('answers every catalog route with its documented status code', async () => {
    const created = await request(app).post('/books').set(authHeader).send(validBook);
    expect(created.status).toBe(201);

    const list = await request(app).get('/books').set(authHeader);
    expect(list.status).toBe(200);
    expect(list.body).toHaveLength(1);

    const byId = await request(app).get(`/books/${created.body.id}`).set(authHeader);
    expect(byId.status).toBe(200);
    expect(byId.body.id).toBe(created.body.id);

    const replaced = await request(app)
      .put(`/books/${created.body.id}`)
      .set(authHeader)
      .send({
        title: 'Dune Messiah',
        author: 'Frank Herbert',
        isbn: '978-0-575-07490-6',
        totalCopies: 4,
      });
    expect(replaced.status).toBe(200);

    const patched = await request(app)
      .patch(`/books/${created.body.id}`)
      .set(authHeader)
      .send({ author: 'F. Herbert' });
    expect(patched.status).toBe(200);
    expect(patched.body.author).toBe('F. Herbert');

    const deleted = await request(app).delete(`/books/${created.body.id}`).set(authHeader);
    expect(deleted.status).toBe(204);

    const gone = await request(app).get(`/books/${created.body.id}`).set(authHeader);
    expect(gone.status).toBe(404);
  });
});
