import type {
  Book,
  BookSearchQuery,
  CreateBookInput,
  FieldErrors,
  PatchBookInput,
  ValidationResult,
} from './types';

/**
 * Pagination defaults for the catalog search endpoint: page 1 with 10 results per page.
 */
export const DEFAULT_PAGE = 1;
export const DEFAULT_PAGE_SIZE = 10;

/**
 * Hard upper bound on pageSize. Larger values are rejected rather than clamped, so the
 * caller is told its request was not honoured.
 */
export const MAX_PAGE_SIZE = 100;

/**
 * Normalises an ISBN for storage and uniqueness comparison:
 * hyphens and whitespace are stripped, then the value is uppercased.
 * No ISBN checksum validation is performed.
 */
export function normalizeIsbn(raw: string): string {
  return raw.replace(/[-\s]/g, '').toUpperCase();
}

/**
 * Case-insensitive substring match of a search term against a book's title OR author.
 * An absent or blank term matches every book, so an unfiltered listing is unchanged.
 */
export function matchesBookSearch(
  book: Pick<Book, 'title' | 'author'>,
  q: string | undefined,
): boolean {
  if (q === undefined) {
    return true;
  }

  const term = q.trim().toLowerCase();
  if (term === '') {
    return true;
  }

  return book.title.toLowerCase().includes(term) || book.author.toLowerCase().includes(term);
}

/**
 * Reads the optional `q` search term from a query object. An absent or blank term
 * yields `undefined` (meaning "no filter"); a repeated or otherwise non-string value
 * is rejected rather than silently ignored.
 */
export function readSearchTerm(
  query: Record<string, unknown>,
): ValidationResult<string | undefined> {
  const value = query['q'];
  if (value === undefined) {
    return { ok: true, value: undefined };
  }

  if (typeof value !== 'string') {
    return { ok: false, errors: { q: 'q must be a single string search term' } };
  }

  const term = value.trim();
  return { ok: true, value: term === '' ? undefined : term };
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
 * Parses a single query-string value into an integer. Anything that is not a string
 * (a repeated parameter arrives as an array) or does not parse to an integer yields
 * `undefined`, which the caller reports as a validation error.
 */
function parseIntegerQueryParam(value: unknown): number | undefined {
  if (typeof value !== 'string' || value.trim() === '') {
    return undefined;
  }

  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : undefined;
}

/**
 * Validates the catalog search query (`q`, `page`, `pageSize`). Absent page and pageSize
 * fall back to the documented defaults; present values must be integers and pageSize must
 * not exceed MAX_PAGE_SIZE. Page and pageSize errors are collected together so the caller
 * learns about both in one response.
 */
export function validateCatalogQuery(query: unknown): ValidationResult<BookSearchQuery> {
  const source = isRecord(query) ? query : {};
  const errors: FieldErrors = {};

  const searchTerm = readSearchTerm(source);
  if (!searchTerm.ok) {
    Object.assign(errors, searchTerm.errors);
  }

  let page = DEFAULT_PAGE;
  if (source['page'] !== undefined) {
    const parsed = parseIntegerQueryParam(source['page']);
    if (parsed === undefined || parsed < 1) {
      errors.page = 'page is required and must be an integer greater than or equal to 1';
    } else {
      page = parsed;
    }
  }

  let pageSize = DEFAULT_PAGE_SIZE;
  if (source['pageSize'] !== undefined) {
    const parsed = parseIntegerQueryParam(source['pageSize']);
    if (parsed === undefined || parsed < 1 || parsed > MAX_PAGE_SIZE) {
      errors.pageSize = `pageSize is required and must be an integer between 1 and ${MAX_PAGE_SIZE}`;
    } else {
      pageSize = parsed;
    }
  }

  if (Object.keys(errors).length > 0) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    value: { q: searchTerm.ok ? searchTerm.value : undefined, page, pageSize },
  };
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
