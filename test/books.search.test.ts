import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../src/app';
import type { Book } from '../src/books/types';
import { resetBooks } from '../src/books/store';

const validBook = {
  title: 'Dune',
  author: 'Frank Herbert',
  isbn: '978-0-441-1727-1',
  totalCopies: 1,
};

/**
 * The catalog rejects duplicate ISBNs, so every TEST book gets its own isbn.
 */
let isbnSuffix = 0;

beforeEach(() => {
  resetBooks();
});

async function createTestBook(overrides: Partial<typeof validBook> = {}): Promise<Book> {
  isbnSuffix += 1;

  const res = await request(app)
    .post('/books')
    .send({
      ...validBook,
      isbn: `978-0-441-1727-${isbnSuffix}`,
      ...overrides,
    });

  expect(res.status).toBe(201);
  return res.body as Book;
}

describe('GET /books?q=', () => {
  it('matches a title case-insensitively on a partial term', async () => {
    const dune = await createTestBook({ title: 'Dune', author: 'Frank Herbert' });
    await createTestBook({ title: 'Neuromancer', author: 'William Gibson' });

    const res = await request(app).get('/books?q=duN');

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].id).toBe(dune.id);
    expect(res.body[0].title).toBe('Dune');
  });

  it('matches on author even when the term is not in the title', async () => {
    const dune = await createTestBook({ title: 'Dune', author: 'Frank Herbert' });
    await createTestBook({ title: 'Neuromancer', author: 'William Gibson' });

    const res = await request(app).get('/books?q=herbert');

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].id).toBe(dune.id);
    expect(res.body[0].author).toBe('Frank Herbert');
    expect(res.body[0].title.toLowerCase()).not.toContain('herbert');
  });

  it('matches a partial substring of a title', async () => {
    const dune = await createTestBook({ title: 'Dune', author: 'Frank Herbert' });

    const res = await request(app).get('/books?q=une');

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].id).toBe(dune.id);
  });

  it('returns an empty array when nothing matches', async () => {
    await createTestBook();

    const res = await request(app).get('/books?q=zzzz');

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toEqual([]);
  });

  it('returns every book as a bare array when q is absent', async () => {
    await createTestBook({ title: 'Dune', author: 'Frank Herbert' });
    await createTestBook({ title: 'Neuromancer', author: 'William Gibson' });

    const res = await request(app).get('/books');

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toHaveLength(2);
    const titles = res.body.map((book: Book) => book.title).sort();
    expect(titles).toEqual(['Dune', 'Neuromancer']);
  });

  it('rejects a repeated q parameter', async () => {
    await createTestBook();

    const res = await request(app).get('/books?q=dune&q=herbert');

    expect(res.status).toBe(400);
    expect(res.body.errors.q).toBeDefined();
    expect(res.body.error).toBeUndefined();
  });
});

describe('GET /books/search', () => {
  it('returns the paginated body with the documented defaults', async () => {
    const book = await createTestBook();

    const res = await request(app).get('/books/search');

    expect(res.status).toBe(200);
    expect(Object.keys(res.body).sort()).toEqual(['items', 'page', 'pageSize', 'total']);
    expect(res.body.page).toBe(1);
    expect(res.body.pageSize).toBe(10);
    expect(res.body.total).toBe(1);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].id).toBe(book.id);
  });

  it('reports the total match count independently of the page size', async () => {
    await createTestBook({ title: 'Dune', author: 'Frank Herbert' });
    await createTestBook({ title: 'Dune Messiah', author: 'Frank Herbert' });
    await createTestBook({ title: 'Children of Dune', author: 'Frank Herbert' });
    await createTestBook({ title: 'Neuromancer', author: 'William Gibson' });

    const res = await request(app).get('/books/search?q=dune&pageSize=2');

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(3);
    expect(res.body.items).toHaveLength(2);
    expect(res.body.page).toBe(1);
    expect(res.body.pageSize).toBe(2);
  });

  it('slices from (page - 1) * pageSize', async () => {
    for (const title of ['Book One', 'Book Two', 'Book Three', 'Book Four', 'Book Five']) {
      await createTestBook({ title, author: 'Paging Author' });
    }

    const res = await request(app).get('/books/search?page=2&pageSize=2');

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(5);
    expect(res.body.page).toBe(2);
    expect(res.body.pageSize).toBe(2);
    expect(res.body.items.map((book: Book) => book.title)).toEqual(['Book Three', 'Book Four']);
  });

  it('accepts the maximum page size of 100', async () => {
    await createTestBook();

    const res = await request(app).get('/books/search?pageSize=100');

    expect(res.status).toBe(200);
    expect(res.body.pageSize).toBe(100);
    expect(res.body.items).toHaveLength(1);
  });

  it('returns an empty page with the real total past the last page', async () => {
    await createTestBook({ title: 'Dune', author: 'Frank Herbert' });
    await createTestBook({ title: 'Dune Messiah', author: 'Frank Herbert' });

    const res = await request(app).get('/books/search?page=99');

    expect(res.status).toBe(200);
    expect(res.body.items).toEqual([]);
    expect(res.body.total).toBe(2);
    expect(res.body.page).toBe(99);
    expect(res.body.pageSize).toBe(10);
  });

  it('returns a well-formed paginated body when nothing matches', async () => {
    await createTestBook();

    const res = await request(app).get('/books/search?q=zzzz');

    expect(res.status).toBe(200);
    expect(res.body.items).toEqual([]);
    expect(res.body.total).toBe(0);
    expect(res.body.page).toBe(1);
    expect(res.body.pageSize).toBe(10);
  });

  it('combines the search term with pagination', async () => {
    await createTestBook({ title: 'Dune', author: 'Frank Herbert' });
    await createTestBook({ title: 'Dune Messiah', author: 'Frank Herbert' });
    await createTestBook({ title: 'Children of Dune', author: 'Frank Herbert' });
    await createTestBook({ title: 'Neuromancer', author: 'William Gibson' });

    const res = await request(app).get('/books/search?q=dune&page=2&pageSize=2');

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(3);
    expect(res.body.page).toBe(2);
    expect(res.body.pageSize).toBe(2);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].title).toBe('Children of Dune');
  });

  it('is reachable as its own route while GET /books/:id still resolves a real id', async () => {
    const book = await createTestBook({ title: 'Dune', author: 'Frank Herbert' });

    const search = await request(app).get('/books/search');
    expect(search.status).toBe(200);
    expect(search.body.items).toBeDefined();
    expect(search.body.error).toBeUndefined();

    const byId = await request(app).get(`/books/${book.id}`);
    expect(byId.status).toBe(200);
    expect(byId.body.id).toBe(book.id);
  });
});

describe('GET /books/search pagination validation', () => {
  it('rejects an invalid page', async () => {
    await createTestBook();

    for (const page of ['0', '-1', '1.5', 'abc']) {
      const res = await request(app).get(`/books/search?page=${page}`);

      expect(res.status).toBe(400);
      expect(res.body.errors.page).toBeDefined();
      expect(res.body.errors.pageSize).toBeUndefined();
      expect(res.body.items).toBeUndefined();
      expect(res.body.total).toBeUndefined();
    }
  });

  it('rejects an invalid pageSize', async () => {
    await createTestBook();

    for (const pageSize of ['0', '101', '2.5', 'abc']) {
      const res = await request(app).get(`/books/search?pageSize=${pageSize}`);

      expect(res.status).toBe(400);
      expect(res.body.errors.pageSize).toBeDefined();
      expect(res.body.errors.page).toBeUndefined();
      expect(res.body.items).toBeUndefined();
      expect(res.body.total).toBeUndefined();
    }
  });

  it('reports page and pageSize errors together', async () => {
    const res = await request(app).get('/books/search?page=0&pageSize=101');

    expect(res.status).toBe(400);
    expect(res.body.errors.page).toBeDefined();
    expect(res.body.errors.pageSize).toBeDefined();
    expect(res.body.items).toBeUndefined();
    expect(res.body.total).toBeUndefined();
  });
});
