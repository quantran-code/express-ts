import { Router, Request, Response } from 'express';
import {
  createBook,
  listBooks,
  getBook,
  updateBook,
  deleteBook,
} from '../store/books';
import type { BookResult, BookErrorCode } from '../store/books';

const router = Router();

const STATUS_BY_CODE: Record<BookErrorCode, number> = {
  INVALID_FIELDS: 400,
  DUPLICATE_ISBN: 409,
  NOT_FOUND: 404,
  INVENTORY_CONFLICT: 422,
};

function parseId(raw: unknown): number | null {
  if (typeof raw !== 'string' || !/^[1-9]\d*$/.test(raw)) {
    return null;
  }
  return Number(raw);
}

function notFoundResponse(res: Response, message: string): void {
  res.status(404).json({ error: { code: 'NOT_FOUND', message } });
}

function sendResult(res: Response, result: BookResult, successStatus: number): void {
  if (result.ok) {
    res.status(successStatus).json(result.book);
    return;
  }

  res.status(STATUS_BY_CODE[result.error.code]).json({ error: result.error });
}

function updateHandler(req: Request, res: Response): void {
  const id = parseId(req.params.id);
  if (id === null) {
    notFoundResponse(res, `Book id "${req.params.id}" is not valid.`);
    return;
  }

  sendResult(res, updateBook(id, req.body), 200);
}

router.post('/', (req: Request, res: Response) => {
  sendResult(res, createBook(req.body), 201);
});

router.get('/', (_req: Request, res: Response) => {
  res.status(200).json(listBooks());
});

router.get('/:id', (req: Request, res: Response) => {
  const id = parseId(req.params.id);
  if (id === null) {
    notFoundResponse(res, `Book id "${req.params.id}" is not valid.`);
    return;
  }

  const book = getBook(id);
  if (!book) {
    notFoundResponse(res, `Book with id ${id} not found.`);
    return;
  }

  res.status(200).json(book);
});

router.put('/:id', updateHandler);
router.patch('/:id', updateHandler);

router.delete('/:id', (req: Request, res: Response) => {
  const id = parseId(req.params.id);
  if (id === null) {
    notFoundResponse(res, `Book id "${req.params.id}" is not valid.`);
    return;
  }

  sendResult(res, deleteBook(id), 200);
});

export default router;
