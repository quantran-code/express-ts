import type { Book } from '../models/book';


type BookInput = Omit<Book, 'id'>;

const books = new Map<string, Book>();

let nextId = 1;

const generateId = (): string => {
  return String(nextId++);
};

const create = (data: Omit<Book, 'id' | 'availableCopies' | 'loanedCopies'> & { availableCopies: number; loanedCopies: number }): Book => {
  const id = generateId();

  const book: BookInput = {
    title: data.title,
    author: data.author,
    isbn: data.isbn,
    totalCopies: data.totalCopies,
    availableCopies: data.availableCopies,
    loanedCopies: data.loanedCopies,
  };

  const stored: Book = { id, ...book };
  books.set(id, stored);
  return stored;
};

const findAll = (): Book[] => {
  return Array.from(books.values());
};

const findById = (id: string): Book | undefined => {
  return books.get(id);
};

const update = (id: string, patch: Partial<Book>): Book | undefined => {
  const existing = books.get(id);
  if (!existing) return undefined;

  const updated: Book = {
    ...existing,
    ...patch,
  };

  books.set(id, updated);
  return updated;
};

const remove = (id: string): boolean => {
  return books.delete(id);
};

const existsByIsbn = (isbn: string, excludeId?: string): boolean => {
  for (const book of books.values()) {
    if (book.isbn === isbn && (!excludeId || book.id !== excludeId)) {
      return true;
    }
  }

  return false;
};

const reset = (): void => {
  books.clear();
  nextId = 1;
};

export {
  create,
  findAll,
  findById,
  update,
  remove,
  existsByIsbn,
  reset,
};
