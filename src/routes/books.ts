import type { Request, Response } from 'express';
import express from 'express';
import { requireRole } from '../middleware/auth';
import { BusinessRuleError, ConflictError, NotFoundError, ValidationError } from '../errors';
import { createBook, deleteBook, getBookById, listBooks, setLoanedCopies, updateBook } from '../services/bookService';

const getIdParam = (id: string | string[]): string => {
  return Array.isArray(id) ? id[0] : id;
};

const booksRouter = express.Router();

const mapError = (err: unknown, res: Response) => {
  if (err instanceof ValidationError || err instanceof ConflictError || err instanceof BusinessRuleError || err instanceof NotFoundError) {
    return res.status(err.statusCode).json({ error: err.name, message: err.message });
  }

  return res.status(500).json({ error: 'InternalServerError', message: 'Unexpected error' });
};

booksRouter.post('/', requireRole('librarian'), (req: Request, res: Response) => {
  try {
    const { title, author, isbn, totalCopies } = req.body ?? {};

    const created = createBook({
      title,
      author,
      isbn,
      totalCopies,
    });

    res.status(201).json(created);
  } catch (err) {
    return mapError(err, res);
  }
});

booksRouter.get('/', (_req: Request, res: Response) => {
  try {
    const books = listBooks();
    res.status(200).json(books);
  } catch (err) {
    return mapError(err, res);
  }
});

booksRouter.get('/:id', (req: Request, res: Response) => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const book = getBookById(id);
    res.status(200).json(book);
  } catch (err) {
    return mapError(err, res);
  }
});

booksRouter.put('/:id', requireRole('librarian'), (req: Request, res: Response) => {
  try {
    const { title, author, totalCopies, availableCopies } = req.body ?? {};
    void availableCopies;

    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

    const updated = updateBook(id, {
      title,
      author,
      totalCopies,
    });

    res.status(200).json(updated);
  } catch (err) {
    return mapError(err, res);
  }
});

booksRouter.delete('/:id', requireRole('librarian'), (req: Request, res: Response) => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    deleteBook(id);
    res.status(204).send();
  } catch (err) {
    return mapError(err, res);
  }
});

// test-only hook
booksRouter.patch('/:id/loaned-copies', requireRole('librarian'), (req: Request, res: Response) => {
  try {
    const { loanedCopies } = req.body ?? {};

    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const updated = setLoanedCopies(id, loanedCopies);
    res.status(200).json(updated);
  } catch (err) {
    return mapError(err, res);
  }
});

export { booksRouter };
