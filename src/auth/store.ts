import { randomUUID } from 'crypto';
import type { CreateUserInput, PublicUser, StoredUser } from './types';
import { hashPassword } from './password';
import { normalizeEmail } from '../members/validation';

/**
 * The seeded librarian account, so the app always has at least one librarian that can
 * log in and create further accounts. Every value may be overridden by the environment.
 */
export const SEEDED_LIBRARIAN_EMAIL = process.env.LIBRARIAN_SEED_EMAIL ?? 'librarian@library.test';
export const SEEDED_LIBRARIAN_PASSWORD =
  process.env.LIBRARIAN_SEED_PASSWORD ?? 'librarian-password';
export const SEEDED_LIBRARIAN_NAME = process.env.LIBRARIAN_SEED_NAME ?? 'Head Librarian';

/**
 * Module-level in-memory account store. Process memory only: no database, no migrations.
 */
const users = new Map<string, StoredUser>();

function clone(user: StoredUser): StoredUser {
  return { ...user };
}

export function createUser(input: CreateUserInput): StoredUser {
  const user: StoredUser = {
    id: randomUUID(),
    name: input.name,
    email: normalizeEmail(input.email),
    passwordHash: input.passwordHash,
    role: input.role,
    memberId: input.memberId,
    createdAt: new Date().toISOString(),
  };

  users.set(user.id, user);
  return clone(user);
}

export function findUserByEmail(normalizedEmail: string): StoredUser | undefined {
  const email = normalizeEmail(normalizedEmail);
  for (const user of users.values()) {
    if (user.email === email) {
      return clone(user);
    }
  }
  return undefined;
}

export function findUserById(id: string): StoredUser | undefined {
  const user = users.get(id);
  return user ? clone(user) : undefined;
}

/**
 * Strips the credential-shaped field. This is the only account shape ever serialized
 * into a response body.
 */
export function toPublicUser(user: StoredUser): PublicUser {
  const { passwordHash: _passwordHash, ...publicUser } = user;
  return publicUser;
}

/**
 * Creates the seeded librarian when no account with that email exists yet. Idempotent,
 * so running it at module load and again after a reset still yields exactly one account.
 */
export function seedLibrarian(): void {
  if (findUserByEmail(SEEDED_LIBRARIAN_EMAIL)) {
    return;
  }

  createUser({
    name: SEEDED_LIBRARIAN_NAME,
    email: SEEDED_LIBRARIAN_EMAIL,
    passwordHash: hashPassword(SEEDED_LIBRARIAN_PASSWORD),
    role: 'librarian',
    memberId: null,
  });
}

/**
 * Empties the store and re-seeds the librarian, so a suite that resets stores in
 * beforeEach still has a librarian it can log in as.
 */
export function resetUsers(): void {
  users.clear();
  seedLibrarian();
}

/**
 * Seeded at module load, not from the server entrypoint: tests import src/app.ts
 * directly and never run src/server.ts, and they still need the seeded librarian.
 */
seedLibrarian();
