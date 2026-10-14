import { Router, Request, Response } from 'express';
import { borrowBook, returnBook, listOverdueLoans } from '../store/loans';
import type { LoanResult, LoanErrorCode } from '../store/loans';
import { findMemberByEmail } from '../store/members';
import { requireRole } from '../auth/middleware';
import type { AuthContext } from '../auth/types';

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

function borrowHandler(req: Request, res: Response): void {
  const auth = res.locals.auth as AuthContext;

  if (auth.role === 'librarian') {
    sendResult(res, borrowBook(req.body), 201);
    return;
  }

  const member = findMemberByEmail(auth.email);
  if (!member) {
    res.status(404).json({
      error: {
        code: 'NOT_FOUND',
        message: `Member with email "${auth.email}" not found.`,
      },
    });
    return;
  }

  sendResult(res, borrowBook(req.body, member.id), 201);
}

function returnHandler(req: Request, res: Response): void {
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

  const auth = res.locals.auth as AuthContext;

  if (auth.role === 'librarian') {
    sendResult(res, returnBook(id), 200);
    return;
  }

  const member = findMemberByEmail(auth.email);
  if (!member) {
    res.status(404).json({
      error: {
        code: 'LOAN_NOT_FOUND',
        message: `Loan with id ${id} not found or already returned.`,
      },
    });
    return;
  }

  sendResult(res, returnBook(id, member.id), 200);
}

router.post('/', borrowHandler);

router.post('/:id/return', returnHandler);

router.get('/overdue', requireRole('librarian'), (_req: Request, res: Response) => {
  res.status(200).json(listOverdueLoans());
});

export default router;
