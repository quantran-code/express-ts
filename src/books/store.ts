import { randomUUID } from 'crypto';
import type { Book, CreateBookInput, PatchBookInput } from './types';
import { normalizeIsbn } from './validation';

/**
 * Module-level in-memory catalog. Process memory only: no database, no migrations.
 */
const books = new Map<string, Book>();

function clone(book: Book): Book {
  return { ...book };
}

export function createBook(input: CreateBookInput): Book {
  const book: Book = {
    id: randomUUID(),
    title: input.title,
    author: input.author,
    isbn: normalizeIsbn(input.isbn),
    totalCopies: input.totalCopies,
    availableCopies: input.totalCopies,
  };

  books.set(book.id, book);
  return clone(book);
}

export function listBooks(): Book[] {
  return Array.from(books.values(), clone);
}

export function findBookById(id: string): Book | undefined {
  const book = books.get(id);
  return book ? clone(book) : undefined;
}

export function findBookByIsbn(normalizedIsbn: string): Book | undefined {
  const isbn = normalizeIsbn(normalizedIsbn);
  for (const book of books.values()) {
    if (book.isbn === isbn) {
      return clone(book);
    }
  }
  return undefined;
}

export function replaceBook(
  id: string,
  input: CreateBookInput,
  availableCopies: number,
): Book | undefined {
  const existing = books.get(id);
  if (!existing) {
    return undefined;
  }

  const updated: Book = {
    id,
    title: input.title,
    author: input.author,
    isbn: normalizeIsbn(input.isbn),
    totalCopies: input.totalCopies,
    availableCopies,
  };

  books.set(id, updated);
  return clone(updated);
}

export function patchBook(
  id: string,
  patch: PatchBookInput,
  availableCopies: number,
): Book | undefined {
  const existing = books.get(id);
  if (!existing) {
    return undefined;
  }

  const updated: Book = {
    id,
    title: patch.title !== undefined ? patch.title : existing.title,
    author: patch.author !== undefined ? patch.author : existing.author,
    isbn: patch.isbn !== undefined ? normalizeIsbn(patch.isbn) : existing.isbn,
    totalCopies: patch.totalCopies !== undefined ? patch.totalCopies : existing.totalCopies,
    availableCopies,
  };

  books.set(id, updated);
  return clone(updated);
}

export function deleteBook(id: string): boolean {
  return books.delete(id);
}

export function resetBooks(): void {
  books.clear();
}
