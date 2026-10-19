import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../src/app';
import { listBooks, resetBooks } from '../src/books/store';
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

describe('POST /books', () => {
  it('creates a book and sets availableCopies from totalCopies', async () => {
    const res = await request(app).post('/books').set(authHeader).send(validBook);

    expect(res.status).toBe(201);
    expect(res.body.title).toBe('Dune');
    expect(res.body.author).toBe('Frank Herbert');
    expect(res.body.isbn).toBe('9780441172719');
    expect(res.body.totalCopies).toBe(3);
    expect(res.body.availableCopies).toBe(3);
    expect(typeof res.body.id).toBe('string');
    expect(res.body.id.length).toBeGreaterThan(0);
    expect(listBooks()).toHaveLength(1);
  });

  it('rejects a body without title', async () => {
    const res = await request(app)
      .post('/books')
      .set(authHeader)
      .send({ author: 'Frank Herbert', isbn: '978-0-441-17271-9', totalCopies: 3 });

    expect(res.status).toBe(400);
    expect(res.body.errors.title).toBeDefined();
    expect(listBooks()).toHaveLength(0);
  });

  it('rejects a body without author', async () => {
    const res = await request(app)
      .post('/books')
      .set(authHeader)
      .send({ title: 'Dune', isbn: '978-0-441-17271-9', totalCopies: 3 });

    expect(res.status).toBe(400);
    expect(res.body.errors.author).toBeDefined();
    expect(listBooks()).toHaveLength(0);
  });

  it('rejects a body without isbn', async () => {
    const res = await request(app)
      .post('/books')
      .set(authHeader)
      .send({ title: 'Dune', author: 'Frank Herbert', totalCopies: 3 });

    expect(res.status).toBe(400);
    expect(res.body.errors.isbn).toBeDefined();
    expect(listBooks()).toHaveLength(0);
  });

  it('rejects totalCopies of 0', async () => {
    const res = await request(app)
      .post('/books')
      .set(authHeader)
      .send({ ...validBook, totalCopies: 0 });

    expect(res.status).toBe(400);
    expect(res.body.errors.totalCopies).toBeDefined();
    expect(listBooks()).toHaveLength(0);
  });

  it('rejects totalCopies of -1', async () => {
    const res = await request(app)
      .post('/books')
      .set(authHeader)
      .send({ ...validBook, totalCopies: -1 });

    expect(res.status).toBe(400);
    expect(res.body.errors.totalCopies).toBeDefined();
    expect(listBooks()).toHaveLength(0);
  });

  it('rejects a non-integer totalCopies', async () => {
    const res = await request(app)
      .post('/books')
      .set(authHeader)
      .send({ ...validBook, totalCopies: 2.5 });

    expect(res.status).toBe(400);
    expect(res.body.errors.totalCopies).toBeDefined();
    expect(listBooks()).toHaveLength(0);
  });

  it('rejects totalCopies that is not a number', async () => {
    const res = await request(app)
      .post('/books')
      .set(authHeader)
      .send({ ...validBook, totalCopies: 'three' });

    expect(res.status).toBe(400);
    expect(res.body.errors.totalCopies).toBeDefined();
    expect(listBooks()).toHaveLength(0);
  });

  it('rejects a duplicate isbn that differs only by hyphens and case', async () => {
    const first = await request(app)
      .post('/books')
      .set(authHeader)
      .send({ title: 'Dune', author: 'Frank Herbert', isbn: '0-8044-2957-X', totalCopies: 3 });
    expect(first.status).toBe(201);

    const second = await request(app)
      .post('/books')
      .set(authHeader)
      .send({ title: 'Dune Messiah', author: 'Frank Herbert', isbn: '080442957x', totalCopies: 2 });
    expect(second.status).toBe(409);
    expect(second.body.error).toBeDefined();

    const list = await request(app).get('/books').set(authHeader);
    expect(list.status).toBe(200);
    expect(list.body).toHaveLength(1);
    expect(list.body[0].isbn).toBe('080442957X');
  });

  it('ignores availableCopies supplied in the body', async () => {
    const res = await request(app)
      .post('/books')
      .set(authHeader)
      .send({ ...validBook, availableCopies: 0 });

    expect(res.status).toBe(201);
    expect(res.body.totalCopies).toBe(3);
    expect(res.body.availableCopies).toBe(3);
    expect(listBooks()[0].availableCopies).toBe(3);
  });
});

describe('GET /books', () => {
  it('returns an empty array when the catalog is empty', async () => {
    const res = await request(app).get('/books').set(authHeader);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toEqual([]);
  });

  it('returns every created book', async () => {
    await request(app).post('/books').set(authHeader).send(validBook);
    await request(app).post('/books').set(authHeader).send({
      title: 'Neuromancer',
      author: 'William Gibson',
      isbn: '978-0-441-56956-4',
      totalCopies: 2,
    });

    const res = await request(app).get('/books').set(authHeader);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    const titles = res.body.map((book: { title: string }) => book.title).sort();
    expect(titles).toEqual(['Dune', 'Neuromancer']);
  });
});

describe('GET /books/:id', () => {
  it('returns the matching book', async () => {
    const created = await request(app).post('/books').set(authHeader).send(validBook);
    expect(created.status).toBe(201);

    const res = await request(app).get(`/books/${created.body.id}`).set(authHeader);

    expect(res.status).toBe(200);
    expect(res.body).toEqual(created.body);
  });

  it('returns 404 for an id that does not exist', async () => {
    const res = await request(app)
      .get('/books/2b3c4d5e-0000-0000-0000-000000000000')
      .set(authHeader);

    expect(res.status).toBe(404);
    expect(res.body.error).toBeDefined();
  });
});
