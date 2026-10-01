import type { Request, Response } from 'express';
import express from 'express';
import { BusinessRuleError, NotFoundError, ValidationError } from '../errors';
import { listOverdueLoans } from '../services/loanService';

const loansRouter = express.Router();

const mapError = (err: unknown, res: Response) => {
  if (err instanceof ValidationError || err instanceof BusinessRuleError || err instanceof NotFoundError) {
    return res.status(err.statusCode).json({ error: err.name, message: err.message });
  }

  return res.status(500).json({ error: 'InternalServerError', message: 'Unexpected error' });
};

// test-only hook / catalog endpoint
loansRouter.get('/overdue', (_req: Request, res: Response) => {
  try {
    const { items, total } = listOverdueLoans();
    res.status(200).json({ items, total });
  } catch (err) {
    return mapError(err, res);
  }
});

export { loansRouter };
