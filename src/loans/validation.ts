import type { CreateLoanInput, FieldErrors, ValidationResult } from './types';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validateIdField(
  body: Record<string, unknown>,
  field: 'bookId' | 'memberId',
  errors: FieldErrors,
): string | undefined {
  const value = body[field];
  if (typeof value !== 'string' || value.trim() === '') {
    errors[field] = `${field} is required and must be a non-empty string`;
    return undefined;
  }
  return value.trim();
}

/**
 * Validates a borrow payload. `bookId` must be a non-empty string. `memberId` is optional
 * at the shape level — a member caller's identity comes from the token — but a supplied
 * value must still be a non-empty string. Whether it is *required* is a permission
 * question decided by the route layer, which knows the caller's role.
 */
export function validateCreateLoan(body: unknown): ValidationResult<CreateLoanInput> {
  if (!isRecord(body)) {
    return { ok: false, errors: { body: 'request body must be a JSON object' } };
  }

  const errors: FieldErrors = {};
  const bookId = validateIdField(body, 'bookId', errors);

  const hasMemberId = body['memberId'] !== undefined;
  const memberId = hasMemberId ? validateIdField(body, 'memberId', errors) : undefined;

  if (bookId === undefined || (hasMemberId && memberId === undefined)) {
    return { ok: false, errors };
  }

  return { ok: true, value: { bookId, memberId } };
}
