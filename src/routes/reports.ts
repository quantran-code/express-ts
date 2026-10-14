import { Router, Request, Response } from 'express';
import { requireRole } from '../auth/middleware';
import { listMostBorrowedBooks, listOverdueSummary } from '../store/reports';

const router = Router();

router.get('/most-borrowed-books', requireRole('librarian'), (_req: Request, res: Response) => {
  res.status(200).json(listMostBorrowedBooks());
});

router.get('/overdue-summary', requireRole('librarian'), (_req: Request, res: Response) => {
  res.status(200).json(listOverdueSummary());
});

export default router;
