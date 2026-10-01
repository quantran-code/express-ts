import type { Book } from '../models/book';
import * as bookRepository from '../repositories/bookRepository';
import { BusinessRuleError, ConflictError, NotFoundError, ValidationError } from '../errors';

type CreateBookInput = {
  title: string;
  author: string;
  isbn: string;
  totalCopies: number;
};

type UpdateBookInput = {
  title?: string;
  author?: string;
  totalCopies?: number;
};

const isNonEmptyString = (value: unknown): value is string => {
  return typeof value === 'string' && value.trim().length > 0;
};

const isInteger = (value: unknown): value is number => {
  return typeof value === 'number' && Number.isInteger(value);
};

const createBook = (input: CreateBookInput): Book => {
  if (!isNonEmptyString(input.title)) {
    throw new ValidationError('title is required');
  }

  if (!isNonEmptyString(input.author)) {
    throw new ValidationError('author is required');
  }

  if (!isNonEmptyString(input.isbn)) {
    throw new ValidationError('isbn is required');
  }

  if (!isInteger(input.totalCopies)) {
    throw new ValidationError('totalCopies must be an integer');
  }

  if (input.totalCopies <= 0) {
    throw new ValidationError('totalCopies must be greater than 0');
  }

  if (bookRepository.existsByIsbn(input.isbn)) {
    throw new ConflictError('isbn already exists');
  }

  const created = bookRepository.create({
    title: input.title,
    author: input.author,
    isbn: input.isbn,
    totalCopies: input.totalCopies,
    availableCopies: input.totalCopies,
    loanedCopies: 0,
  });

  return created;
};

const listBooks = (): Book[] => {
  return bookRepository.findAll();
};

const getBookById = (id: string): Book => {
  const found = bookRepository.findById(id);
  if (!found) {
    throw new NotFoundError('book not found');
  }

  return found;
};

const updateBook = (id: string, input: UpdateBookInput): Book => {
  const existing = bookRepository.findById(id);
  if (!existing) {
    throw new NotFoundError('book not found');
  }

  const nextTitle = input.title !== undefined ? input.title : existing.title;
  const nextAuthor = input.author !== undefined ? input.author : existing.author;
  const nextTotalCopies = input.totalCopies !== undefined ? input.totalCopies : existing.totalCopies;

  if (input.title !== undefined && !isNonEmptyString(input.title)) {
    throw new ValidationError('title must be a non-empty string');
  }

  if (input.author !== undefined && !isNonEmptyString(input.author)) {
    throw new ValidationError('author must be a non-empty string');
  }

  if (input.totalCopies !== undefined) {
    if (!isInteger(input.totalCopies)) {
      throw new ValidationError('totalCopies must be an integer');
    }

    if (input.totalCopies <= 0) {
      throw new ValidationError('totalCopies must be greater than 0');
    }
  }

  const loanedCopies = existing.loanedCopies;
  const recomputedAvailableCopies = nextTotalCopies - loanedCopies;

  if (recomputedAvailableCopies < 0) {
    throw new BusinessRuleError('availableCopies cannot be negative');
  }

  const updated = bookRepository.update(id, {
    title: nextTitle,
    author: nextAuthor,
    totalCopies: nextTotalCopies,
    availableCopies: recomputedAvailableCopies,
    loanedCopies,
  });

  // update() returns undefined only if the book disappeared between reads.
  if (!updated) {
    throw new NotFoundError('book not found');
  }

  return updated;
};

const deleteBook = (id: string): void => {
  const existing = bookRepository.findById(id);
  if (!existing) {
    throw new NotFoundError('book not found');
  }

  if (existing.loanedCopies > 0) {
    throw new BusinessRuleError('cannot delete a book with copies on loan');
  }

  bookRepository.remove(id);
};

const setLoanedCopies = (id: string, loanedCopies: number): Book => {
  const existing = bookRepository.findById(id);
  if (!existing) {
    throw new NotFoundError('book not found');
  }

  if (!isInteger(loanedCopies)) {
    throw new ValidationError('loanedCopies must be an integer');
  }

  if (loanedCopies < 0) {
    throw new ValidationError('loanedCopies must be greater than or equal to 0');
  }

  if (loanedCopies > existing.totalCopies) {
    throw new BusinessRuleError('loanedCopies cannot exceed totalCopies');
  }

  const availableCopies = existing.totalCopies - loanedCopies;

  const updated = bookRepository.update(id, {
    loanedCopies,
    availableCopies,
  });

  if (!updated) {
    throw new NotFoundError('book not found');
  }

  return updated;
};

const borrowCopies = (bookId: string, copies: number): Book => {
  const existing = bookRepository.findById(bookId);
  if (!existing) {
    throw new NotFoundError('book not found');
  }

  if (!isInteger(copies)) {
    throw new ValidationError('copies must be an integer');
  }

  if (copies <= 0) {
    throw new ValidationError('copies must be a positive integer');
  }

  if (copies > existing.availableCopies) {
    throw new BusinessRuleError('not enough available copies');
  }

  const availableCopies = existing.availableCopies - copies;
  const loanedCopies = existing.loanedCopies + copies;

  const updated = bookRepository.update(bookId, {
    availableCopies,
    loanedCopies,
  });

  if (!updated) {
    throw new NotFoundError('book not found');
  }

  return updated;
};

const returnCopies = (bookId: string, copies: number): Book => {
  const existing = bookRepository.findById(bookId);
  if (!existing) {
    throw new NotFoundError('book not found');
  }

  if (!isInteger(copies)) {
    throw new ValidationError('copies must be an integer');
  }

  if (copies <= 0) {
    throw new ValidationError('copies must be a positive integer');
  }

  if (copies > existing.loanedCopies) {
    throw new BusinessRuleError('not enough loaned copies');
  }

  const availableCopies = existing.availableCopies + copies;
  const loanedCopies = existing.loanedCopies - copies;

  const updated = bookRepository.update(bookId, {
    availableCopies,
    loanedCopies,
  });

  if (!updated) {
    throw new NotFoundError('book not found');
  }

  return updated;
};

export {
  createBook,
  listBooks,
  getBookById,
  updateBook,
  deleteBook,
  setLoanedCopies,
  borrowCopies,
  returnCopies,
};
