import type {
  Book,
  CreateBookInput,
  FieldErrors,
  PatchBookInput,
  ValidationResult,
} from './types';

/**
 * Normalises an ISBN for storage and uniqueness comparison:
 * hyphens and whitespace are stripped, then the value is uppercased.
 * No ISBN checksum validation is performed.
 */
export function normalizeIsbn(raw: string): string {
  return raw.replace(/[-\s]/g, '').toUpperCase();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validateTextField(
  body: Record<string, unknown>,
  field: 'title' | 'author',
  errors: FieldErrors,
): string | undefined {
  const value = body[field];
  if (typeof value !== 'string' || value.trim() === '') {
    errors[field] = `${field} is required and must be a non-empty string`;
    return undefined;
  }
  return value.trim();
}

function validateIsbnField(
  body: Record<string, unknown>,
  errors: FieldErrors,
): string | undefined {
  const value = body['isbn'];
  if (typeof value !== 'string') {
    errors.isbn = 'isbn is required and must be a non-empty string';
    return undefined;
  }
  const normalized = normalizeIsbn(value);
  if (normalized === '') {
    errors.isbn = 'isbn is required and must be a non-empty string';
    return undefined;
  }
  return normalized;
}

function validateTotalCopiesField(
  value: unknown,
  errors: FieldErrors,
): number | undefined {
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
    errors.totalCopies = 'totalCopies is required and must be an integer greater than 0';
    return undefined;
  }
  return value;
}

/**
 * Validates a full create/replace payload. Any `availableCopies` supplied by the
 * caller is ignored: the value is system-managed and never taken from input.
 */
export function validateCreateBook(body: unknown): ValidationResult<CreateBookInput> {
  if (!isRecord(body)) {
    return { ok: false, errors: { body: 'request body must be a JSON object' } };
  }

  const errors: FieldErrors = {};
  const title = validateTextField(body, 'title', errors);
  const author = validateTextField(body, 'author', errors);
  const isbn = validateIsbnField(body, errors);
  const totalCopies = validateTotalCopiesField(body['totalCopies'], errors);

  if (title === undefined || author === undefined || isbn === undefined || totalCopies === undefined) {
    return { ok: false, errors };
  }

  return { ok: true, value: { title, author, isbn, totalCopies } };
}

/**
 * Validates a partial payload: only the fields actually present are validated, so an
 * empty object is valid. Any `availableCopies` supplied by the caller is ignored.
 */
export function validatePatchBook(body: unknown): ValidationResult<PatchBookInput> {
  if (!isRecord(body)) {
    return { ok: false, errors: { body: 'request body must be a JSON object' } };
  }

  const errors: FieldErrors = {};
  const patch: PatchBookInput = {};

  if ('title' in body) {
    const title = validateTextField(body, 'title', errors);
    if (title !== undefined) patch.title = title;
  }

  if ('author' in body) {
    const author = validateTextField(body, 'author', errors);
    if (author !== undefined) patch.author = author;
  }

  if ('isbn' in body) {
    const isbn = validateIsbnField(body, errors);
    if (isbn !== undefined) patch.isbn = isbn;
  }

  if ('totalCopies' in body) {
    const totalCopies = validateTotalCopiesField(body['totalCopies'], errors);
    if (totalCopies !== undefined) patch.totalCopies = totalCopies;
  }

  if (Object.keys(errors).length > 0) {
    return { ok: false, errors };
  }

  return { ok: true, value: patch };
}

/**
 * Computes the available copies after a totalCopies change, keeping the number of
 * copies currently on loan constant. The result may be negative, in which case the
 * caller must reject the update (the on-loan copies would exceed the new total).
 */
export function nextAvailableCopies(
  book: Pick<Book, 'totalCopies' | 'availableCopies'>,
  nextTotalCopies: number,
): number {
  return book.availableCopies + (nextTotalCopies - book.totalCopies);
}
