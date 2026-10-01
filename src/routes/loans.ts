import type { Request, Response } from 'express';
import express from 'express';
import { requireRole } from '../middleware/auth';
import { listOverdueLoans } from '../services/loanService';

const loansRouter = express.Router();

const loansMap = (_err: unknown, res: Response) => {
  return res.status(500).json({ error: 'InternalServerError', message: 'Unexpected error' });
};

loansRouter.get('/overdue', requireRole('librarian'), (_req: Request, res: Response) => {
  try {
    const overdue = listOverdueLoans();
    res.status(200).json(overdue);
  } catch (err) {
    return loansMap(err, res);
  }
});

export { loansRouter };
