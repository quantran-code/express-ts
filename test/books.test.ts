import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../src/app';
import { reset } from '../src/repositories/bookRepository';

const createBookPayload = (overrides?: Partial<{ title: string; author: string; isbn: string; totalCopies: number }>) => {
  return {
    title: 'Clean Code',
    author: 'Robert C. Martin',
    isbn: 'isbn-1',
    totalCopies: 3,
    ...overrides,
  };
};

describe('Book CRUD', () => {
  beforeEach(() => {
    reset();
  });

  it('creates a book and sets availableCopies=totalCopies and loanedCopies=0', async () => {
    const payload = createBookPayload({ isbn: 'isbn-create-1', totalCopies: 5 });

    const res = await request(app).post('/books').send(payload);
    expect(res.status).toBe(201);

    expect(res.body.title).toBe(payload.title);
    expect(res.body.author).toBe(payload.author);
    expect(res.body.isbn).toBe(payload.isbn);
    expect(res.body.totalCopies).toBe(payload.totalCopies);
    expect(res.body.availableCopies).toBe(payload.totalCopies);
    expect(res.body.loanedCopies).toBe(0);

    expect(typeof res.body.id).toBe('string');
  });

  it('rejects missing/invalid fields (400)', async () => {
    const res = await request(app).post('/books').send({
      title: '',
      author: 'a',
      isbn: 'isbn-bad',
      totalCopies: 1,
    });

    expect(res.status).toBe(400);
  });

  it('rejects duplicate isbn values with 409', async () => {
    const payload = createBookPayload({ isbn: 'isbn-dup' });

    const res1 = await request(app).post('/books').send(payload);
    expect(res1.status).toBe(201);

    const res2 = await request(app).post('/books').send({ ...payload, title: 'Other Title' });
    expect(res2.status).toBe(409);
  });

  it('lists all books', async () => {
    const payload1 = createBookPayload({ isbn: 'isbn-list-1', totalCopies: 2 });
    const payload2 = createBookPayload({ isbn: 'isbn-list-2', totalCopies: 4 });

    const res1 = await request(app).post('/books').send(payload1);
    expect(res1.status).toBe(201);

    const res2 = await request(app).post('/books').send(payload2);
    expect(res2.status).toBe(201);

    const listRes = await request(app).get('/books');
    expect(listRes.status).toBe(200);
    expect(Array.isArray(listRes.body.items)).toBe(true);
    expect(listRes.body.items.length).toBe(2);
  });

  it('gets a book by id (200) and returns 404 when missing', async () => {
    const createRes = await request(app).post('/books').send(createBookPayload({ isbn: 'isbn-get-1' }));
    expect(createRes.status).toBe(201);

    const id = createRes.body.id;

    const getRes = await request(app).get(`/books/${id}`);
    expect(getRes.status).toBe(200);
    expect(getRes.body.id).toBe(id);

    const missingRes = await request(app).get('/books/does-not-exist');
    expect(missingRes.status).toBe(404);
  });

  it('updates title, author, and totalCopies; recomputes availableCopies', async () => {
    const createRes = await request(app).post('/books').send(createBookPayload({ isbn: 'isbn-update-1', totalCopies: 3 }));
    expect(createRes.status).toBe(201);

    const id = createRes.body.id;

    // simulate 1 loaned copy so availableCopies != totalCopies
    const loanedRes = await request(app)
      .patch(`/books/${id}/loaned-copies`)
      .send({ loanedCopies: 1 });
    expect(loanedRes.status).toBe(200);

    const updateRes = await request(app)
      .put(`/books/${id}`)
      .send({ title: 'Updated Title', author: 'Updated Author', totalCopies: 6, availableCopies: 123 });

    expect(updateRes.status).toBe(200);
    expect(updateRes.body.title).toBe('Updated Title');
    expect(updateRes.body.author).toBe('Updated Author');
    expect(updateRes.body.totalCopies).toBe(6);
    expect(updateRes.body.availableCopies).toBe(5);
    expect(updateRes.body.loanedCopies).toBe(1);
  });

  it('ignores client-sent availableCopies during update', async () => {
    const createRes = await request(app).post('/books').send(createBookPayload({ isbn: 'isbn-update-available-ignore', totalCopies: 2 }));
    expect(createRes.status).toBe(201);

    const id = createRes.body.id;

    const updateRes = await request(app).put(`/books/${id}`).send({ totalCopies: 3, availableCopies: 0 });
    expect(updateRes.status).toBe(200);
    expect(updateRes.body.availableCopies).toBe(3);
  });

  it('rejects updates that would make availableCopies negative (422)', async () => {
    const createRes = await request(app).post('/books').send(createBookPayload({ isbn: 'isbn-negative', totalCopies: 2 }));
    expect(createRes.status).toBe(201);

    const id = createRes.body.id;

    const loanedRes = await request(app).patch(`/books/${id}/loaned-copies`).send({ loanedCopies: 2 });
    expect(loanedRes.status).toBe(200);

    const updateRes = await request(app).put(`/books/${id}`).send({ totalCopies: 1 });
    expect(updateRes.status).toBe(422);
  });

  it('deletes a book when no copies are on loan (204)', async () => {
    const createRes = await request(app).post('/books').send(createBookPayload({ isbn: 'isbn-delete-ok' }));
    expect(createRes.status).toBe(201);

    const id = createRes.body.id;

    const deleteRes = await request(app).delete(`/books/${id}`);
    expect(deleteRes.status).toBe(204);

    const getRes = await request(app).get(`/books/${id}`);
    expect(getRes.status).toBe(404);
  });

  it('rejects delete when any copies are on loan (422)', async () => {
    const createRes = await request(app).post('/books').send(createBookPayload({ isbn: 'isbn-delete-loan-block' }));
    expect(createRes.status).toBe(201);

    const id = createRes.body.id;

    const loanedRes = await request(app).patch(`/books/${id}/loaned-copies`).send({ loanedCopies: 1 });
    expect(loanedRes.status).toBe(200);

    const deleteRes = await request(app).delete(`/books/${id}`);
    expect(deleteRes.status).toBe(422);
  });
});
