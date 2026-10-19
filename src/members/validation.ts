import type {
  CreateMemberInput,
  FieldErrors,
  PatchMemberInput,
  ValidationResult,
} from './types';

/**
 * Normalises an email for storage and uniqueness comparison:
 * surrounding whitespace is trimmed, then the value is lowercased.
 */
export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Shape-only email check: something before the `@`, a dot-suffixed domain,
 * and no whitespace anywhere in the value. No MX or RFC-completeness checks.
 */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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
 * Validates a full create/replace payload. The stored email is always the
 * normalised (trimmed and lowercased) value.
 */
export function validateCreateMember(body: unknown): ValidationResult<CreateMemberInput> {
  if (!isRecord(body)) {
    return { ok: false, errors: { body: 'request body must be a JSON object' } };
  }

  const errors: FieldErrors = {};
  const name = validateNameField(body, errors);
  const email = validateEmailField(body, errors);

  if (name === undefined || email === undefined) {
    return { ok: false, errors };
  }

  return { ok: true, value: { name, email } };
}

/**
 * Validates a partial payload: only the fields actually present are validated, so an
 * empty object is valid.
 */
export function validatePatchMember(body: unknown): ValidationResult<PatchMemberInput> {
  if (!isRecord(body)) {
    return { ok: false, errors: { body: 'request body must be a JSON object' } };
  }

  const errors: FieldErrors = {};
  const patch: PatchMemberInput = {};

  if ('name' in body) {
    const name = validateNameField(body, errors);
    if (name !== undefined) patch.name = name;
  }

  if ('email' in body) {
    const email = validateEmailField(body, errors);
    if (email !== undefined) patch.email = email;
  }

  if (Object.keys(errors).length > 0) {
    return { ok: false, errors };
  }

  return { ok: true, value: patch };
}
