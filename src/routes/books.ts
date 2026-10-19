import { Router, RequestHandler } from 'express';
import { requireLibrarian } from '../auth/middleware';
import {
  createBook,
  deleteBook,
  findBookById,
  findBookByIsbn,
  listBooksByQuery,
  patchBook,
  replaceBook,
  searchBooks,
} from '../books/store';
import {
  nextAvailableCopies,
  normalizeIsbn,
  readSearchTerm,
  validateCatalogQuery,
  validateCreateBook,
  validatePatchBook,
} from '../books/validation';

export const booksRouter: Router = Router();

export const createBookHandler: RequestHandler = (req, res) => {
  const result = validateCreateBook(req.body);
  if (!result.ok) {
    res.status(400).json({ errors: result.errors });
    return;
  }

  const normalizedIsbn = normalizeIsbn(result.value.isbn);
  if (findBookByIsbn(normalizedIsbn)) {
    res.status(409).json({ error: 'A book with this isbn already exists' });
    return;
  }

  const book = createBook({ ...result.value, isbn: normalizedIsbn });
  res.status(201).json(book);
};

export const listBooksHandler: RequestHandler = (req, res) => {
  const searchTerm = readSearchTerm(req.query);
  if (!searchTerm.ok) {
    res.status(400).json({ errors: searchTerm.errors });
    return;
  }

  res.status(200).json(listBooksByQuery(searchTerm.value));
};

export const searchBooksHandler: RequestHandler = (req, res) => {
  const result = validateCatalogQuery(req.query);
  if (!result.ok) {
    res.status(400).json({ errors: result.errors });
    return;
  }

  res.status(200).json(searchBooks(result.value));
};

export const getBookByIdHandler: RequestHandler<{ id: string }> = (req, res) => {
  const book = findBookById(req.params.id);
  if (!book) {
    res.status(404).json({ error: 'Book not found' });
    return;
  }

  res.status(200).json(book);
};

export const replaceBookHandler: RequestHandler<{ id: string }> = (req, res) => {
  const result = validateCreateBook(req.body);
  if (!result.ok) {
    res.status(400).json({ errors: result.errors });
    return;
  }

  const existing = findBookById(req.params.id);
  if (!existing) {
    res.status(404).json({ error: 'Book not found' });
    return;
  }

  const normalizedIsbn = normalizeIsbn(result.value.isbn);
  const conflict = findBookByIsbn(normalizedIsbn);
  if (conflict && conflict.id !== existing.id) {
    res.status(409).json({ error: 'A book with this isbn already exists' });
    return;
  }

  const availableCopies = nextAvailableCopies(existing, result.value.totalCopies);
  if (availableCopies < 0) {
    res.status(409).json({
      error: 'totalCopies cannot be lower than the number of copies on loan',
    });
    return;
  }

  const book = replaceBook(existing.id, { ...result.value, isbn: normalizedIsbn }, availableCopies);
  if (!book) {
    res.status(404).json({ error: 'Book not found' });
    return;
  }

  res.status(200).json(book);
};

export const patchBookHandler: RequestHandler<{ id: string }> = (req, res) => {
  const result = validatePatchBook(req.body);
  if (!result.ok) {
    res.status(400).json({ errors: result.errors });
    return;
  }

  const existing = findBookById(req.params.id);
  if (!existing) {
    res.status(404).json({ error: 'Book not found' });
    return;
  }

  const patch = { ...result.value };
  if (patch.isbn !== undefined) {
    const normalizedIsbn = normalizeIsbn(patch.isbn);
    const conflict = findBookByIsbn(normalizedIsbn);
    if (conflict && conflict.id !== existing.id) {
      res.status(409).json({ error: 'A book with this isbn already exists' });
      return;
    }
    patch.isbn = normalizedIsbn;
  }

  const nextTotalCopies =
    patch.totalCopies !== undefined ? patch.totalCopies : existing.totalCopies;
  const availableCopies = nextAvailableCopies(existing, nextTotalCopies);
  if (availableCopies < 0) {
    res.status(409).json({
      error: 'totalCopies cannot be lower than the number of copies on loan',
    });
    return;
  }

  const book = patchBook(existing.id, patch, availableCopies);
  if (!book) {
    res.status(404).json({ error: 'Book not found' });
    return;
  }

  res.status(200).json(book);
};

export const deleteBookHandler: RequestHandler<{ id: string }> = (req, res) => {
  const existing = findBookById(req.params.id);
  if (!existing) {
    res.status(404).json({ error: 'Book not found' });
    return;
  }

  if (existing.availableCopies < existing.totalCopies) {
    res.status(409).json({ error: 'Book cannot be deleted while copies are on loan' });
    return;
  }

  deleteBook(existing.id);
  res.status(204).send();
};

booksRouter.post('/', requireLibrarian, createBookHandler);
booksRouter.get('/', listBooksHandler);
booksRouter.get('/search', searchBooksHandler);
booksRouter.get('/:id', getBookByIdHandler);
booksRouter.put('/:id', requireLibrarian, replaceBookHandler);
booksRouter.patch('/:id', requireLibrarian, patchBookHandler);
booksRouter.delete('/:id', requireLibrarian, deleteBookHandler);
