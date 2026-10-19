export interface Loan {
  id: string;
  bookId: string;
  memberId: string;
  borrowedAt: string;
  returnedAt: string | null;
}

export interface CreateLoanInput {
  bookId: string;
  memberId: string;
}

export type { FieldErrors, ValidationResult } from '../books/types';
