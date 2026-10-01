import type { Request, Response } from 'express';
import express from 'express';
import { requireRole } from '../middleware/auth';
import { getMostBorrowed, getOverdueSummary } from '../services/reportService';
import { BusinessRuleError, ConflictError, NotFoundError, ValidationError } from '../errors';

const reportsRouter = express.Router();

const mapError = (err: unknown, res: Response) => {
  if (err instanceof ValidationError || err instanceof ConflictError || err instanceof BusinessRuleError || err instanceof NotFoundError) {
    return res.status(err.statusCode).json({ error: err.name, message: err.message });
  }

  return res.status(500).json({ error: 'InternalServerError', message: 'Unexpected error' });
};

reportsRouter.get('/most-borrowed', requireRole('librarian'), (_req: Request, res: Response) => {
  try {
    const report = getMostBorrowed();
    res.status(200).json(report);
  } catch (err) {
    return mapError(err, res);
  }
});

reportsRouter.get('/overdue-summary', requireRole('librarian'), (_req: Request, res: Response) => {
  try {
    const report = getOverdueSummary();
    res.status(200).json(report);
  } catch (err) {
    return mapError(err, res);
  }
});

export { reportsRouter };
