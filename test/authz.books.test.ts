import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../src/app';
import { resetUsers } from '../src/auth/store';
import type { Book } from '../src/books/types';
import { resetBooks } from '../src/books/store';
import { resetLoans } from '../src/loans/store';
import { resetMembers } from '../src/members/store';
import { librarianAuthHeaders, memberAuthHeaders } from './helpers/auth';

const validBook = {
  title: 'Dune',
  author: 'Frank Herbert',
  isbn: '978-0-441-17271-9',
  totalCopies: 3,
};

const UNKNOWN_BOOK_ID = '2b3c4d5e-0000-0000-0000-000000000000';

/**
 * The catalog rejects duplicate ISBNs, so every TEST book gets its own isbn.
 */
let isbnSuffix = 0;

let librarian: { Authorization: string };

beforeEach(async () => {
  resetUsers();
  resetBooks();
  resetMembers();
  resetLoans();
  librarian = await librarianAuthHeaders();
});

async function createBookAsLibrarian(overrides: Partial<typeof validBook> = {}): Promise<Book> {
  isbnSuffix += 1;

  const res = await request(app)
    .post('/books')
    .set(librarian)
    .send({ ...validBook, isbn: `978-0-441-1727-${isbnSuffix}`, ...overrides });

  expect(res.status).toBe(201);
  return res.body as Book;
}

describe('AC4: catalog write restriction', () => {
  it('AC4: a member cannot create a book and the catalog is unchanged', async () => {
    const member = await memberAuthHeaders();

    const res = await request(app).post('/books').set(member).send(validBook);

    expect(res.status).toBe(403);
    expect(res.body.error).toBeDefined();

    const catalog = await request(app).get('/books').set(librarian);
    expect(catalog.status).toBe(200);
    expect(catalog.body).toEqual([]);
  });

  it('AC4: a member cannot replace, patch or delete a book and it stays unchanged', async () => {
    const member = await memberAuthHeaders();
    const created = await createBookAsLibrarian();

    const replaced = await request(app)
      .put(`/books/${created.id}`)
      .set(member)
      .send({
        title: 'Hijacked',
        author: 'Someone Else',
        isbn: '978-0-575-07490-6',
        totalCopies: 1,
      });
    expect(replaced.status).toBe(403);
    expect(replaced.body.error).toBeDefined();

    const patched = await request(app)
      .patch(`/books/${created.id}`)
      .set(member)
      .send({ title: 'Hijacked' });
    expect(patched.status).toBe(403);
    expect(patched.body.error).toBeDefined();

    const deleted = await request(app).delete(`/books/${created.id}`).set(member);
    expect(deleted.status).toBe(403);
    expect(deleted.body.error).toBeDefined();

    const stored = await request(app).get(`/books/${created.id}`).set(librarian);
    expect(stored.status).toBe(200);
    expect(stored.body).toEqual(created);
  });

  it('AC4: a member is refused every write route even for an id that does not exist', async () => {
    const member = await memberAuthHeaders();

    const put = await request(app).put(`/books/${UNKNOWN_BOOK_ID}`).set(member).send(validBook);
    expect(put.status).toBe(403);

    const patch = await request(app)
      .patch(`/books/${UNKNOWN_BOOK_ID}`)
      .set(member)
      .send({ title: 'Hijacked' });
    expect(patch.status).toBe(403);

    const deleted = await request(app).delete(`/books/${UNKNOWN_BOOK_ID}`).set(member);
    expect(deleted.status).toBe(403);
  });

  it('AC4: a member keeps read access to the catalog', async () => {
    const member = await memberAuthHeaders();
    const first = await createBookAsLibrarian({ title: 'Dune' });
    const second = await createBookAsLibrarian({ title: 'Neuromancer' });

    const list = await request(app).get('/books').set(member);
    const librarianList = await request(app).get('/books').set(librarian);
    expect(list.status).toBe(200);
    expect(list.body).toHaveLength(2);
    expect(list.body).toEqual(librarianList.body);

    const search = await request(app).get('/books/search?q=dune').set(member);
    const librarianSearch = await request(app).get('/books/search?q=dune').set(librarian);
    expect(search.status).toBe(200);
    expect(search.body).toEqual(librarianSearch.body);
    expect(search.body.total).toBe(1);
    expect(search.body.items[0].id).toBe(first.id);

    const byId = await request(app).get(`/books/${second.id}`).set(member);
    const librarianById = await request(app).get(`/books/${second.id}`).set(librarian);
    expect(byId.status).toBe(200);
    expect(byId.body).toEqual(librarianById.body);
    expect(byId.body.id).toBe(second.id);
  });

  it('AC4: the librarian write path is unchanged', async () => {
    const created = await createBookAsLibrarian();
    expect(created.availableCopies).toBe(created.totalCopies);

    const replaced = await request(app)
      .put(`/books/${created.id}`)
      .set(librarian)
      .send({
        title: 'Dune Messiah',
        author: 'Frank Herbert',
        isbn: '978-0-575-07490-6',
        totalCopies: 4,
      });
    expect(replaced.status).toBe(200);
    expect(replaced.body.title).toBe('Dune Messiah');

    const patched = await request(app)
      .patch(`/books/${created.id}`)
      .set(librarian)
      .send({ title: 'Dune Messiah (Deluxe)' });
    expect(patched.status).toBe(200);
    expect(patched.body.title).toBe('Dune Messiah (Deluxe)');

    const deleted = await request(app).delete(`/books/${created.id}`).set(librarian);
    expect(deleted.status).toBe(204);

    const gone = await request(app).get(`/books/${created.id}`).set(librarian);
    expect(gone.status).toBe(404);
  });
});
