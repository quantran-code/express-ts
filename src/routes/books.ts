import { Router, Request, Response } from 'express';
import {
  createBook,
  listBooks,
  searchBooks,
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

function parsePositiveInteger(raw: unknown): number | null {
  if (typeof raw !== 'string' || !/^[1-9]\d*$/.test(raw)) {
    return null;
  }
  return Number(raw);
}

function invalidFieldsResponse(res: Response, message: string): void {
  res.status(400).json({ error: { code: 'INVALID_FIELDS', message } });
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

router.get('/', (req: Request, res: Response) => {
  const hasSearchOrPagination =
    'q' in req.query || 'page' in req.query || 'pageSize' in req.query;

  if (!hasSearchOrPagination) {
    res.status(200).json(listBooks());
    return;
  }

  const { q } = req.query;

  let query: string | undefined;
  if (q !== undefined) {
    if (typeof q !== 'string') {
      invalidFieldsResponse(res, 'q must be a string.');
      return;
    }
    query = q;
  }

  let page = 1;
  if (req.query.page !== undefined) {
    const parsed = parsePositiveInteger(req.query.page);
    if (parsed === null) {
      invalidFieldsResponse(res, 'page must be an integer greater than 0.');
      return;
    }
    page = parsed;
  }

  let pageSize = 10;
  if (req.query.pageSize !== undefined) {
    const parsed = parsePositiveInteger(req.query.pageSize);
    if (parsed === null) {
      invalidFieldsResponse(res, 'pageSize must be an integer greater than 0.');
      return;
    }
    if (parsed > 100) {
      invalidFieldsResponse(res, 'pageSize must not exceed 100.');
      return;
    }
    pageSize = parsed;
  }

  res.status(200).json(searchBooks({ q: query, page, pageSize }));
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
