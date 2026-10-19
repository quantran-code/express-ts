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
 * Validates a borrow payload. Both ids must be non-empty strings; whether the
 * referenced book and member exist is checked by the route layer.
 */
export function validateCreateLoan(body: unknown): ValidationResult<CreateLoanInput> {
  if (!isRecord(body)) {
    return { ok: false, errors: { body: 'request body must be a JSON object' } };
  }

  const errors: FieldErrors = {};
  const bookId = validateIdField(body, 'bookId', errors);
  const memberId = validateIdField(body, 'memberId', errors);

  if (bookId === undefined || memberId === undefined) {
    return { ok: false, errors };
  }

  return { ok: true, value: { bookId, memberId } };
}
