export interface Loan {
  id: string;
  bookId: string;
  memberId: string;
  borrowedAt: string;
  dueDate: string;
  returnedAt: string | null;
}

export interface CreateLoanInput {
  bookId: string;
  memberId: string;
}

/**
 * An overdue loan joined with the book title and member name so a librarian can follow up
 * without extra lookups. `dueDate` is always in the past for these entries.
 */
export interface OverdueLoan {
  id: string;
  bookId: string;
  memberId: string;
  borrowedAt: string;
  returnedAt: string | null;
  dueDate: string;
  bookTitle: string;
  memberName: string;
}

export type { FieldErrors, ValidationResult } from '../books/types';
