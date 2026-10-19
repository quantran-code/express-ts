import { Router, RequestHandler } from 'express';
import { findBookById } from '../books/store';
import { findMemberById } from '../members/store';
import {
  MAX_ACTIVE_LOANS,
  countActiveLoansByMember,
  createLoan,
  findActiveLoan,
  findLoanById,
  returnLoan,
} from '../loans/store';
import { validateCreateLoan } from '../loans/validation';

export const loansRouter: Router = Router();

/**
 * Borrowing is a precondition gate: every rejection happens before any store
 * mutation, so a failed borrow never leaves availability or the ledger changed.
 */
export const borrowLoanHandler: RequestHandler = (req, res) => {
  const result = validateCreateLoan(req.body);
  if (!result.ok) {
    res.status(400).json({ errors: result.errors });
    return;
  }

  const book = findBookById(result.value.bookId);
  if (!book) {
    res.status(404).json({ error: 'Book not found' });
    return;
  }

  const member = findMemberById(result.value.memberId);
  if (!member) {
    res.status(404).json({ error: 'Member not found' });
    return;
  }

  if (book.availableCopies <= 0) {
    res.status(409).json({ error: 'No copies of this book are available' });
    return;
  }

  if (findActiveLoan(member.id, book.id)) {
    res.status(409).json({ error: 'This member already has this book on loan' });
    return;
  }

  if (countActiveLoansByMember(member.id) >= MAX_ACTIVE_LOANS) {
    res.status(409).json({
      error: `This member already has ${MAX_ACTIVE_LOANS} active loans`,
    });
    return;
  }

  const loan = createLoan({ bookId: book.id, memberId: member.id });
  if (!loan) {
    res.status(404).json({ error: 'Book not found' });
    return;
  }

  res.status(201).json(loan);
};

export const returnLoanHandler: RequestHandler<{ id: string }> = (req, res) => {
  const existing = findLoanById(req.params.id);
  if (!existing) {
    res.status(404).json({ error: 'Loan not found' });
    return;
  }

  if (existing.returnedAt !== null) {
    res.status(409).json({ error: 'Loan has already been returned' });
    return;
  }

  const loan = returnLoan(existing.id);
  if (!loan) {
    res.status(404).json({ error: 'Loan not found' });
    return;
  }

  res.status(200).json(loan);
};

loansRouter.post('/', borrowLoanHandler);
loansRouter.patch('/:id/return', returnLoanHandler);
