import type { FieldErrors, LoginInput, RegisterInput, ValidationResult } from './types';
import { normalizeEmail } from '../members/validation';

/**
 * Minimum password length for a new account. Exported so tests and the error message
 * agree on the rule.
 */
export const MIN_PASSWORD_LENGTH = 8;

/**
 * Shape-only email check: something before the `@`, a dot-suffixed domain,
 * and no whitespace anywhere in the value. No MX or RFC-completeness checks.
 */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validateNameField(
  body: Record<string, unknown>,
  errors: FieldErrors,
): string | undefined {
  const value = body['name'];
  if (typeof value !== 'string' || value.trim() === '') {
    errors.name = 'name is required and must be a non-empty string';
    return undefined;
  }
  return value.trim();
}

function validateEmailField(
  body: Record<string, unknown>,
  errors: FieldErrors,
): string | undefined {
  const value = body['email'];
  if (typeof value !== 'string' || value.trim() === '') {
    errors.email = 'email is required and must be a non-empty string';
    return undefined;
  }

  const normalized = normalizeEmail(value);
  if (!EMAIL_PATTERN.test(normalized)) {
    errors.email = 'email must be a valid email address';
    return undefined;
  }
  return normalized;
}

/**
 * Validates a registration payload. The role is optional: when it is absent the account
 * is a member by default. Whether the caller is allowed to ask for `librarian` is a
 * permission question decided by the route layer, not here.
 */
export function validateRegister(body: unknown): ValidationResult<RegisterInput> {
  if (!isRecord(body)) {
    return { ok: false, errors: { body: 'request body must be a JSON object' } };
  }

  const errors: FieldErrors = {};
  const name = validateNameField(body, errors);
  const email = validateEmailField(body, errors);

  const rawPassword = body['password'];
  let password: string | undefined;
  if (typeof rawPassword !== 'string' || rawPassword === '') {
    errors.password = 'password is required and must be a non-empty string';
  } else if (rawPassword.length < MIN_PASSWORD_LENGTH) {
    errors.password = `password must be at least ${MIN_PASSWORD_LENGTH} characters long`;
  } else {
    password = rawPassword;
  }

  let role: RegisterInput['role'];
  if ('role' in body && body['role'] !== undefined) {
    const rawRole = body['role'];
    if (rawRole !== 'librarian' && rawRole !== 'member') {
      errors.role = "role must be either 'librarian' or 'member'";
    } else {
      role = rawRole;
    }
  }

  if (name === undefined || email === undefined || password === undefined) {
    return { ok: false, errors };
  }

  if (Object.keys(errors).length > 0) {
    return { ok: false, errors };
  }

  const value: RegisterInput = { name, email, password };
  if (role !== undefined) {
    value.role = role;
  }

  return { ok: true, value };
}

/**
 * Validates a login payload. Presence only: a short or wrong password must fail as bad
 * credentials at the route layer, not as a 400 here.
 */
export function validateLogin(body: unknown): ValidationResult<LoginInput> {
  if (!isRecord(body)) {
    return { ok: false, errors: { body: 'request body must be a JSON object' } };
  }

  const errors: FieldErrors = {};

  const rawEmail = body['email'];
  let email: string | undefined;
  if (typeof rawEmail !== 'string' || rawEmail.trim() === '') {
    errors.email = 'email is required and must be a non-empty string';
  } else {
    email = normalizeEmail(rawEmail);
  }

  const rawPassword = body['password'];
  let password: string | undefined;
  if (typeof rawPassword !== 'string' || rawPassword === '') {
    errors.password = 'password is required and must be a non-empty string';
  } else {
    password = rawPassword;
  }

  if (email === undefined || password === undefined) {
    return { ok: false, errors };
  }

  return { ok: true, value: { email, password } };
}
