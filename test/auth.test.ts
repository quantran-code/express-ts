import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../src/app';
import { reset as resetMemberRepository } from '../src/repositories/memberRepository';

describe('Auth', () => {
  beforeEach(() => {
    resetMemberRepository();
  });

  it('register creates a member with role=member', async () => {
    const res = await request(app).post('/auth/register').send({
      name: 'Jane Doe',
      email: 'jane-auth@example.com',
      password: 'password123',
    });

    expect(res.status).toBe(201);
    expect(res.body.name).toBe('Jane Doe');
    expect(res.body.email).toBe('jane-auth@example.com');
    expect(res.body.role).toBe('member');
    expect(res.body).not.toHaveProperty('passwordHash');
  });

  it('register rejects duplicate email with 409', async () => {
    await request(app).post('/auth/register').send({
      name: 'A',
      email: 'dup-auth@example.com',
      password: 'password123',
    });

    const res2 = await request(app).post('/auth/register').send({
      name: 'B',
      email: 'dup-auth@example.com',
      password: 'password123',
    });

    expect(res2.status).toBe(409);
  });

  it('register rejects missing/short password with 400', async () => {
    const res1 = await request(app).post('/auth/register').send({
      name: 'A',
      email: 'missing-pass@example.com',
      password: '',
    });

    expect(res1.status).toBe(400);

    const res2 = await request(app).post('/auth/register').send({
      name: 'A',
      email: 'short-pass@example.com',
      password: 'short',
    });

    expect(res2.status).toBe(400);
  });

  it('login returns token and invalid credentials uses generic message', async () => {
    await request(app).post('/auth/register').send({
      name: 'Jane',
      email: 'login-auth@example.com',
      password: 'password123',
    });

    const badEmailRes = await request(app).post('/auth/login').send({
      email: 'does-not-exist@example.com',
      password: 'password123',
    });
    expect(badEmailRes.status).toBe(400);
    expect(badEmailRes.body.message).toBe('invalid credentials');

    const badPasswordRes = await request(app).post('/auth/login').send({
      email: 'login-auth@example.com',
      password: 'wrong-password',
    });
    expect(badPasswordRes.status).toBe(400);
    expect(badPasswordRes.body.message).toBe('invalid credentials');

    const okRes = await request(app).post('/auth/login').send({
      email: 'login-auth@example.com',
      password: 'password123',
    });
    expect(okRes.status).toBe(200);
    expect(typeof okRes.body.token).toBe('string');
  });
});
