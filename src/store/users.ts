import bcrypt from 'bcrypt';
import {
  MIN_PASSWORD_LENGTH,
  SEEDED_LIBRARIAN_EMAIL,
  SEEDED_LIBRARIAN_NAME,
  SEEDED_LIBRARIAN_PASSWORD,
} from '../auth/config';

export type Role = 'member' | 'librarian';

export interface User {
  id: number;
  name: string;
  email: string;
  passwordHash: string;
  role: Role;
}

export interface PublicUser {
  id: number;
  name: string;
  email: string;
  role: Role;
}

export type UserErrorCode =
  | 'INVALID_FIELDS'
  | 'DUPLICATE_EMAIL'
  | 'INVALID_CREDENTIALS';

export interface UserError {
  code: UserErrorCode;
  message: string;
}

export type RegisterResult =
  | { ok: true; user: PublicUser }
  | { ok: false; error: UserError };

export type LoginResult =
  | { ok: true; user: User }
  | { ok: false; error: UserError };

const INPUT_KEYS = ['name', 'email', 'password'];

let users: User[] = [];
let nextId = 1;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isValidEmail(value: unknown): value is string {
  return typeof value === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function invalidFields(message: string): RegisterResult {
  return { ok: false, error: { code: 'INVALID_FIELDS', message } };
}

function invalidCredentials(): LoginResult {
  return {
    ok: false,
    error: { code: 'INVALID_CREDENTIALS', message: 'Invalid credentials.' },
  };
}

function rejectDisallowedKeys(record: Record<string, unknown>): RegisterResult | null {
  const unknownKeys = Object.keys(record).filter((key) => !INPUT_KEYS.includes(key));
  if (unknownKeys.length > 0) {
    return invalidFields(`Unknown field(s): ${unknownKeys.join(', ')}.`);
  }

  return null;
}

function toPublicUser(user: User): PublicUser {
  return { id: user.id, name: user.name, email: user.email, role: user.role };
}

export function seedUsers(): void {
  const alreadySeeded = users.some(
    (user) => normalizeEmail(user.email) === normalizeEmail(SEEDED_LIBRARIAN_EMAIL),
  );
  if (alreadySeeded) {
    return;
  }

  users.push({
    id: nextId,
    name: SEEDED_LIBRARIAN_NAME,
    email: SEEDED_LIBRARIAN_EMAIL,
    passwordHash: bcrypt.hashSync(SEEDED_LIBRARIAN_PASSWORD, 10),
    role: 'librarian',
  });
  nextId += 1;
}

export async function registerUser(input: unknown, role: Role): Promise<RegisterResult> {
  if (!isRecord(input)) {
    return invalidFields('User data must be an object.');
  }

  const disallowed = rejectDisallowedKeys(input);
  if (disallowed) {
    return disallowed;
  }

  const { name, email, password } = input;

  if (!isNonEmptyString(name)) {
    return invalidFields('name is required and must be a non-empty string.');
  }
  if (!isValidEmail(email)) {
    return invalidFields('email is required and must be a valid email address.');
  }
  if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
    return invalidFields(`password is required and must be at least ${MIN_PASSWORD_LENGTH} characters.`);
  }

  const trimmedEmail = email.trim();

  if (users.some((user) => normalizeEmail(user.email) === normalizeEmail(trimmedEmail))) {
    return {
      ok: false,
      error: {
        code: 'DUPLICATE_EMAIL',
        message: `A user with email "${trimmedEmail}" already exists.`,
      },
    };
  }

  const passwordHash = await bcrypt.hash(password, 10);

  const user: User = {
    id: nextId,
    name,
    email: trimmedEmail,
    passwordHash,
    role,
  };

  nextId += 1;
  users.push(user);

  return { ok: true, user: toPublicUser(user) };
}

export async function verifyCredentials(email: string, password: string): Promise<LoginResult> {
  const user = findUserByEmail(email);
  if (!user) {
    return invalidCredentials();
  }

  const passwordMatches = await bcrypt.compare(password, user.passwordHash);
  if (!passwordMatches) {
    return invalidCredentials();
  }

  return { ok: true, user };
}

export function findUserById(id: number): User | undefined {
  return users.find((user) => user.id === id);
}

export function findUserByEmail(email: string): User | undefined {
  const normalized = normalizeEmail(email);
  return users.find((user) => normalizeEmail(user.email) === normalized);
}

export function resetUserStore(): void {
  users = [];
  nextId = 1;
  seedUsers();
}

seedUsers();
