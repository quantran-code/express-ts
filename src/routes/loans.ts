import { Router, Request, Response } from 'express';
import { borrowBook, returnBook, listOverdueLoans } from '../store/loans';
import type { LoanResult, LoanErrorCode } from '../store/loans';

const router = Router();

const STATUS_BY_CODE: Record<LoanErrorCode, number> = {
  INVALID_FIELDS: 400,
  NOT_FOUND: 404,
  NO_COPIES: 422,
  DUPLICATE_LOAN: 422,
  LOAN_LIMIT_REACHED: 422,
  LOAN_NOT_FOUND: 404,
};

function parseId(raw: unknown): number | null {
  if (typeof raw !== 'string' || !/^[1-9]\d*$/.test(raw)) {
    return null;
  }
  return Number(raw);
}

function sendResult(res: Response, result: LoanResult, successStatus: number): void {
  if (result.ok) {
    res.status(successStatus).json(result.loan);
    return;
  }

  res.status(STATUS_BY_CODE[result.error.code]).json({ error: result.error });
}

router.post('/', (req: Request, res: Response) => {
  sendResult(res, borrowBook(req.body), 201);
});

router.post('/:id/return', (req: Request, res: Response) => {
  const id = parseId(req.params.id);
  if (id === null) {
    res.status(404).json({
      error: {
        code: 'LOAN_NOT_FOUND',
        message: `Loan id "${req.params.id}" is not valid.`,
      },
    });
    return;
  }

  sendResult(res, returnBook(id), 200);
});

router.get('/overdue', (_req: Request, res: Response) => {
  res.status(200).json(listOverdueLoans());
});

export default router;
