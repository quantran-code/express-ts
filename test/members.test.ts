import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../src/app';
import { reset } from '../src/repositories/memberRepository';

const getAuthHeaders = async () => {
  const adminRes = await request(app)
    .post('/auth/login')
    .send({ email: 'librarian@example.com', password: 'librarian-password' });

  return {
    Authorization: `Bearer ${adminRes.body.token}`,
  };
};

const createMemberPayload = (overrides?: Partial<{ name: string; email: string }>) => {
  return {
    name: 'John Doe',
    email: 'john@example.com',
    ...overrides,
  };
};

describe('Member CRUD', () => {
  let headers: { Authorization: string };

  beforeEach(async () => {
    headers = await getAuthHeaders();
  });

  beforeEach(() => {
    reset();
  });

  it('creates a member', async () => {
    const payload = createMemberPayload({ name: 'Jane Doe', email: 'jane@example.com' });

    const res = await request(app).post('/members').set(headers).send(payload);
    expect(res.status).toBe(201);

    expect(res.body.name).toBe(payload.name);
    expect(res.body.email).toBe(payload.email);
    expect(typeof res.body.id).toBe('string');
  });

  it('rejects missing/invalid fields (400)', async () => {
    const res = await request(app).post('/members').set(headers).send({
      name: '',
      email: 'a',
    });

    expect(res.status).toBe(400);
  });

  it('rejects duplicate email values with 409', async () => {
    const payload = createMemberPayload({ email: 'isbn-dup' });

    const res1 = await request(app).post('/members').set(headers).send(payload);
    expect(res1.status).toBe(201);

    const res2 = await request(app).post('/members').set(headers).send({ ...payload, name: 'Other Name' });
    expect(res2.status).toBe(409);
  });

  it('lists all members', async () => {
    const payload1 = createMemberPayload({ email: 'm-list-1' });
    const payload2 = createMemberPayload({ email: 'm-list-2' });

    const res1 = await request(app).post('/members').set(headers).send(payload1);
    expect(res1.status).toBe(201);

    const res2 = await request(app).post('/members').set(headers).send(payload2);
    expect(res2.status).toBe(201);

    const listRes = await request(app).get('/members').set(headers);
    expect(listRes.status).toBe(200);
    expect(Array.isArray(listRes.body)).toBe(true);
    expect(listRes.body.length).toBe(2);
  });

  it('gets a member by id (200) and returns 404 when missing', async () => {
    const createRes = await request(app).post('/members').set(headers).send(createMemberPayload({ email: 'm-get-1' }));
    expect(createRes.status).toBe(201);

    const id = createRes.body.id;

    const getRes = await request(app).get(`/members/${id}`).set(headers);
    expect(getRes.status).toBe(200);
    expect(getRes.body.id).toBe(id);

    const missingRes = await request(app).get('/members/does-not-exist').set(headers);
    expect(missingRes.status).toBe(404);
  });
});
