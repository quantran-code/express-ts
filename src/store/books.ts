export interface Book {
  id: number;
  title: string;
  author: string;
  isbn: string;
  totalCopies: number;
  availableCopies: number;
}

export type BookInput = {
  title: string;
  author: string;
  isbn: string;
  totalCopies: number;
};

export type BookPatch = Partial<BookInput>;

export type BookErrorCode =
  | 'INVALID_FIELDS'
  | 'DUPLICATE_ISBN'
  | 'NOT_FOUND'
  | 'INVENTORY_CONFLICT';

export interface BookError {
  code: BookErrorCode;
  message: string;
}

export type BookResult =
  | { ok: true; book: Book }
  | { ok: false; error: BookError };

const UPDATABLE_KEYS = ['title', 'author', 'isbn', 'totalCopies'];

let books: Book[] = [];
let nextId = 1;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

function invalidFields(message: string): BookResult {
  return { ok: false, error: { code: 'INVALID_FIELDS', message } };
}

function rejectDisallowedKeys(record: Record<string, unknown>): BookResult | null {
  if ('availableCopies' in record) {
    return invalidFields('availableCopies is system-managed and cannot be set directly.');
  }

  const unknownKeys = Object.keys(record).filter((key) => !UPDATABLE_KEYS.includes(key));
  if (unknownKeys.length > 0) {
    return invalidFields(`Unknown field(s): ${unknownKeys.join(', ')}.`);
  }

  return null;
}

export function createBook(input: unknown): BookResult {
  if (!isRecord(input)) {
    return invalidFields('Book data must be an object.');
  }

  const disallowed = rejectDisallowedKeys(input);
  if (disallowed) {
    return disallowed;
  }

  const { title, author, isbn, totalCopies } = input;

  if (!isNonEmptyString(title)) {
    return invalidFields('title is required and must be a non-empty string.');
  }
  if (!isNonEmptyString(author)) {
    return invalidFields('author is required and must be a non-empty string.');
  }
  if (!isNonEmptyString(isbn)) {
    return invalidFields('isbn is required and must be a non-empty string.');
  }
  if (!isPositiveInteger(totalCopies)) {
    return invalidFields('totalCopies is required and must be an integer greater than 0.');
  }

  if (books.some((book) => book.isbn === isbn)) {
    return {
      ok: false,
      error: {
        code: 'DUPLICATE_ISBN',
        message: `A book with ISBN "${isbn}" already exists.`,
      },
    };
  }

  const book: Book = {
    id: nextId,
    title,
    author,
    isbn,
    totalCopies,
    availableCopies: totalCopies,
  };

  nextId += 1;
  books.push(book);

  return { ok: true, book };
}

export interface BookSearchOptions {
  q?: string;
  page: number;
  pageSize: number;
}

export interface BookSearchPage {
  data: Book[];
  total: number;
  page: number;
  pageSize: number;
}

export function listBooks(): Book[] {
  return [...books];
}

export function searchBooks(options: BookSearchOptions): BookSearchPage {
  const query = options.q?.trim().toLowerCase();

  const matches = query
    ? books.filter(
        (book) =>
          book.title.toLowerCase().includes(query) ||
          book.author.toLowerCase().includes(query),
      )
    : [...books];

  const total = matches.length;
  const start = (options.page - 1) * options.pageSize;
  const data = matches.slice(start, start + options.pageSize);

  return {
    data,
    total,
    page: options.page,
    pageSize: options.pageSize,
  };
}

export function getBook(id: number): Book | undefined {
  return books.find((book) => book.id === id);
}

export function updateBook(id: number, patch: unknown): BookResult {
  const index = books.findIndex((book) => book.id === id);
  if (index === -1) {
    return { ok: false, error: { code: 'NOT_FOUND', message: `Book with id ${id} not found.` } };
  }

  if (!isRecord(patch)) {
    return invalidFields('Update data must be an object.');
  }

  const disallowed = rejectDisallowedKeys(patch);
  if (disallowed) {
    return disallowed;
  }

  if (Object.keys(patch).length === 0) {
    return invalidFields('No updatable fields provided.');
  }

  const existing = books[index];

  if ('title' in patch && !isNonEmptyString(patch.title)) {
    return invalidFields('title must be a non-empty string.');
  }
  if ('author' in patch && !isNonEmptyString(patch.author)) {
    return invalidFields('author must be a non-empty string.');
  }
  if ('isbn' in patch && !isNonEmptyString(patch.isbn)) {
    return invalidFields('isbn must be a non-empty string.');
  }
  if ('totalCopies' in patch && !isPositiveInteger(patch.totalCopies)) {
    return invalidFields('totalCopies must be an integer greater than 0.');
  }

  if ('isbn' in patch) {
    const isbn = patch.isbn as string;
    if (books.some((book) => book.id !== id && book.isbn === isbn)) {
      return {
        ok: false,
        error: {
          code: 'DUPLICATE_ISBN',
          message: `A book with ISBN "${isbn}" already exists.`,
        },
      };
    }
  }

  let totalCopies = existing.totalCopies;
  let availableCopies = existing.availableCopies;

  if ('totalCopies' in patch) {
    const newTotalCopies = patch.totalCopies as number;
    const copiesOnLoan = existing.totalCopies - existing.availableCopies;
    const newAvailableCopies = newTotalCopies - copiesOnLoan;

    if (newAvailableCopies < 0) {
      return {
        ok: false,
        error: {
          code: 'INVENTORY_CONFLICT',
          message: 'Cannot reduce totalCopies below the number of copies currently on loan.',
        },
      };
    }

    totalCopies = newTotalCopies;
    availableCopies = newAvailableCopies;
  }

  const updated: Book = {
    id: existing.id,
    title: 'title' in patch ? (patch.title as string) : existing.title,
    author: 'author' in patch ? (patch.author as string) : existing.author,
    isbn: 'isbn' in patch ? (patch.isbn as string) : existing.isbn,
    totalCopies,
    availableCopies,
  };

  books[index] = updated;

  return { ok: true, book: updated };
}

export function deleteBook(id: number): BookResult {
  const index = books.findIndex((book) => book.id === id);
  if (index === -1) {
    return { ok: false, error: { code: 'NOT_FOUND', message: `Book with id ${id} not found.` } };
  }

  const book = books[index];

  if (book.availableCopies < book.totalCopies) {
    return {
      ok: false,
      error: {
        code: 'INVENTORY_CONFLICT',
        message: 'Cannot delete a book while copies are on loan.',
      },
    };
  }

  books.splice(index, 1);
  return { ok: true, book };
}

export function resetBookStore(): void {
  books = [];
  nextId = 1;
}
