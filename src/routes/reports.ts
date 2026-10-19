import { Router, RequestHandler } from 'express';
import { requireLibrarian } from '../auth/middleware';
import { mostBorrowedBooks, overdueSummary } from '../reports/reports';

export const reportsRouter: Router = Router();

export const mostBorrowedReportHandler: RequestHandler = (_req, res) => {
  res.status(200).json(mostBorrowedBooks());
};

/**
 * The clock is read on each request, exactly like the overdue list, so a loan joins this
 * summary the moment its dueDate passes with no write in between.
 */
export const overdueSummaryReportHandler: RequestHandler = (_req, res) => {
  const now = Date.now();
  res.status(200).json(overdueSummary(now));
};

reportsRouter.get('/most-borrowed', requireLibrarian, mostBorrowedReportHandler);
reportsRouter.get('/overdue-summary', requireLibrarian, overdueSummaryReportHandler);
