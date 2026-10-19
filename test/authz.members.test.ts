import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../src/app';
import { resetUsers } from '../src/auth/store';
import type { Book } from '../src/books/types';
import { resetBooks } from '../src/books/store';
import type { Loan } from '../src/loans/types';
import { resetLoans } from '../src/loans/store';
import type { Member } from '../src/members/types';
import { resetMembers } from '../src/members/store';
import { librarianAuthHeaders, memberAuthHeaders } from './helpers/auth';

const SELF_EMAIL = 'self@example.com';
const SELF_PASSWORD = 'self-password';
const OTHER_MEMBER = { name: 'Other Person', email: 'other@example.com' };
const UNKNOWN_MEMBER_ID = '2b3c4d5e-0000-0000-0000-000000000000';

/**
 * The catalog rejects duplicate ISBNs, so every TEST book gets its own isbn.
 */
let isbnSuffix = 0;

let librarian: { Authorization: string };

beforeEach(async () => {
  resetUsers();
  resetMembers();
  resetBooks();
  resetLoans();
  librarian = await librarianAuthHeaders();
});

async function createMemberAsLibrarian(name: string, email: string): Promise<Member> {
  const res = await request(app).post('/members').set(librarian).send({ name, email });

  expect(res.status).toBe(201);
  return res.body as Member;
}

/**
 * The caller's own member record, read through GET /members: a member only ever sees
 * themselves there, so this doubles as the "own profile" check and supplies the id every
 * own-record request needs without decoding the token.
 */
async function ownMember(auth: { Authorization: string }): Promise<Member> {
  const res = await request(app).get('/members').set(auth);

  expect(res.status).toBe(200);
  expect(res.body).toHaveLength(1);
  return res.body[0] as Member;
}

async function createBookAsLibrarian(title = 'Dune'): Promise<Book> {
  isbnSuffix += 1;

  const res = await request(app).post('/books').set(librarian).send({
    title,
    author: 'Frank Herbert',
    isbn: `978-0-441-1727-${isbnSuffix}`,
    totalCopies: 2,
  });

  expect(res.status).toBe(201);
  return res.body as Book;
}

async function borrowAsLibrarian(memberId: string, bookId: string): Promise<Loan> {
  const res = await request(app).post('/loans').set(librarian).send({ bookId, memberId });

  expect(res.status).toBe(201);
  return res.body as Loan;
}

describe('AC1: member-scoped member endpoints', () => {
  it('AC1: a member can read their own profile', async () => {
    const member = await memberAuthHeaders(SELF_EMAIL, SELF_PASSWORD);
    const self = await ownMember(member);

    const res = await request(app).get(`/members/${self.id}`).set(member);

    expect(res.status).toBe(200);
    expect(res.body).toEqual(self);
    expect(res.body.email).toBe(SELF_EMAIL);
  });

  it('AC1: a member can read their own loan history', async () => {
    const member = await memberAuthHeaders(SELF_EMAIL, SELF_PASSWORD);
    const self = await ownMember(member);
    const book = await createBookAsLibrarian();

    const borrowed = await request(app).post('/loans').set(member).send({ bookId: book.id });
    expect(borrowed.status).toBe(201);

    const res = await request(app).get(`/members/${self.id}/loans`).set(member);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].id).toBe(borrowed.body.id);
    expect(res.body[0].memberId).toBe(self.id);
  });

  it('AC1: a member is refused another member profile with 403', async () => {
    const member = await memberAuthHeaders(SELF_EMAIL, SELF_PASSWORD);
    await ownMember(member);
    const other = await createMemberAsLibrarian(OTHER_MEMBER.name, OTHER_MEMBER.email);

    const res = await request(app).get(`/members/${other.id}`).set(member);

    expect(res.status).toBe(403);
    expect(res.body.error).toBeDefined();

    const stored = await request(app).get(`/members/${other.id}`).set(librarian);
    expect(stored.status).toBe(200);
    expect(stored.body).toEqual(other);
  });

  it('AC1: a member is refused another member loan history with 403 and the loans stay', async () => {
    const member = await memberAuthHeaders(SELF_EMAIL, SELF_PASSWORD);
    await ownMember(member);
    const other = await createMemberAsLibrarian(OTHER_MEMBER.name, OTHER_MEMBER.email);
    const book = await createBookAsLibrarian();
    const loan = await borrowAsLibrarian(other.id, book.id);

    const res = await request(app).get(`/members/${other.id}/loans`).set(member);

    expect(res.status).toBe(403);
    expect(res.body.error).toBeDefined();

    const stored = await request(app).get(`/members/${other.id}/loans`).set(librarian);
    expect(stored.status).toBe(200);
    expect(stored.body).toHaveLength(1);
    expect(stored.body[0].id).toBe(loan.id);
  });

  it('AC1: a member is refused PUT, PATCH and DELETE on another member and it stays unchanged', async () => {
    const member = await memberAuthHeaders(SELF_EMAIL, SELF_PASSWORD);
    await ownMember(member);
    const other = await createMemberAsLibrarian(OTHER_MEMBER.name, OTHER_MEMBER.email);

    const put = await request(app)
      .put(`/members/${other.id}`)
      .set(member)
      .send({ name: 'Hijacked', email: 'hijacked@example.com' });
    expect(put.status).toBe(403);
    expect(put.body.error).toBeDefined();

    const patch = await request(app)
      .patch(`/members/${other.id}`)
      .set(member)
      .send({ name: 'Hijacked' });
    expect(patch.status).toBe(403);
    expect(patch.body.error).toBeDefined();

    const deleted = await request(app).delete(`/members/${other.id}`).set(member);
    expect(deleted.status).toBe(403);
    expect(deleted.body.error).toBeDefined();

    const stored = await request(app).get(`/members/${other.id}`).set(librarian);
    expect(stored.status).toBe(200);
    expect(stored.body).toEqual(other);
  });

  it('AC1: a cross-member attempt is 403 even for an id that does not exist', async () => {
    const member = await memberAuthHeaders(SELF_EMAIL, SELF_PASSWORD);
    await ownMember(member);

    const profile = await request(app).get(`/members/${UNKNOWN_MEMBER_ID}`).set(member);
    expect(profile.status).toBe(403);
    expect(profile.body.error).toBeDefined();

    const loans = await request(app).get(`/members/${UNKNOWN_MEMBER_ID}/loans`).set(member);
    expect(loans.status).toBe(403);

    const patch = await request(app)
      .patch(`/members/${UNKNOWN_MEMBER_ID}`)
      .set(member)
      .send({ name: 'Hijacked' });
    expect(patch.status).toBe(403);

    const deleted = await request(app).delete(`/members/${UNKNOWN_MEMBER_ID}`).set(member);
    expect(deleted.status).toBe(403);
  });

  it('AC1: a member may still PATCH and DELETE their own record', async () => {
    const member = await memberAuthHeaders(SELF_EMAIL, SELF_PASSWORD);
    const self = await ownMember(member);

    const patched = await request(app)
      .patch(`/members/${self.id}`)
      .set(member)
      .send({ name: 'Renamed Member' });
    expect(patched.status).toBe(200);
    expect(patched.body.id).toBe(self.id);
    expect(patched.body.name).toBe('Renamed Member');
    expect(patched.body.email).toBe(SELF_EMAIL);

    const deleted = await request(app).delete(`/members/${self.id}`).set(member);
    expect(deleted.status).toBe(204);

    const stored = await request(app).get(`/members/${self.id}`).set(librarian);
    expect(stored.status).toBe(404);
  });

  it('AC1: a member may still replace their own record', async () => {
    const member = await memberAuthHeaders(SELF_EMAIL, SELF_PASSWORD);
    const self = await ownMember(member);

    const res = await request(app)
      .put(`/members/${self.id}`)
      .set(member)
      .send({ name: 'Replaced Member', email: SELF_EMAIL });

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(self.id);
    expect(res.body.name).toBe('Replaced Member');
  });

  it('AC1: GET /members returns only the caller own record to a member', async () => {
    const member = await memberAuthHeaders(SELF_EMAIL, SELF_PASSWORD);
    const self = await ownMember(member);
    await createMemberAsLibrarian(OTHER_MEMBER.name, OTHER_MEMBER.email);

    const asMember = await request(app).get('/members').set(member);
    expect(asMember.status).toBe(200);
    expect(asMember.body).toHaveLength(1);
    expect(asMember.body[0].id).toBe(self.id);

    const asLibrarian = await request(app).get('/members').set(librarian);
    expect(asLibrarian.status).toBe(200);
    expect(asLibrarian.body).toHaveLength(2);
  });

  it('AC1: a member cannot create members', async () => {
    const member = await memberAuthHeaders(SELF_EMAIL, SELF_PASSWORD);
    await ownMember(member);

    const res = await request(app)
      .post('/members')
      .set(member)
      .send({ name: 'Sneaky Member', email: 'sneaky@example.com' });

    expect(res.status).toBe(403);
    expect(res.body.error).toBeDefined();

    const asLibrarian = await request(app).get('/members').set(librarian);
    expect(asLibrarian.body).toHaveLength(1);
  });
});
