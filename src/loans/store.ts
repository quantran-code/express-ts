import { randomUUID } from 'crypto';
import type { CreateLoanInput, Loan } from './types';
import { findBookById, patchBook } from '../books/store';

/**
 * A member may hold at most this many unreturned loans at a time.
 */
export const MAX_ACTIVE_LOANS = 3;

/**
 * Module-level in-memory loan ledger. Process memory only: no database, no migrations.
 */
const loans = new Map<string, Loan>();

function clone(loan: Loan): Loan {
  return { ...loan };
}

function isActive(loan: Loan): boolean {
  return loan.returnedAt === null;
}

/**
 * Records a loan against the referenced book and takes one copy out of circulation.
 * The caller (route layer) is responsible for the borrow preconditions; the store only
 * guarantees that what it is told to do stays consistent. Unknown book ids are refused.
 */
export function createLoan(input: CreateLoanInput): Loan | undefined {
  const book = findBookById(input.bookId);
  if (!book) {
    return undefined;
  }

  const loan: Loan = {
    id: randomUUID(),
    bookId: input.bookId,
    memberId: input.memberId,
    borrowedAt: new Date().toISOString(),
    returnedAt: null,
  };

  loans.set(loan.id, loan);
  patchBook(book.id, {}, book.availableCopies - 1);
  return clone(loan);
}

export function listLoans(): Loan[] {
  return Array.from(loans.values(), clone);
}

export function findLoanById(id: string): Loan | undefined {
  const loan = loans.get(id);
  return loan ? clone(loan) : undefined;
}

export function findActiveLoan(memberId: string, bookId: string): Loan | undefined {
  for (const loan of loans.values()) {
    if (loan.memberId === memberId && loan.bookId === bookId && isActive(loan)) {
      return clone(loan);
    }
  }
  return undefined;
}

export function listActiveLoansByMember(memberId: string): Loan[] {
  const active: Loan[] = [];
  for (const loan of loans.values()) {
    if (loan.memberId === memberId && isActive(loan)) {
      active.push(clone(loan));
    }
  }
  return active;
}

export function countActiveLoansByMember(memberId: string): number {
  let count = 0;
  for (const loan of loans.values()) {
    if (loan.memberId === memberId && isActive(loan)) {
      count += 1;
    }
  }
  return count;
}

/**
 * Marks a loan returned and puts its copy back into circulation. The availability
 * increase is clamped to totalCopies so the invariant holds even when totalCopies
 * was lowered after the book was borrowed.
 */
export function returnLoan(loanId: string): Loan | undefined {
  const existing = loans.get(loanId);
  if (!existing) {
    return undefined;
  }

  const returned: Loan = {
    ...existing,
    returnedAt: new Date().toISOString(),
  };
  loans.set(loanId, returned);

  const book = findBookById(returned.bookId);
  if (book) {
    const availableCopies = Math.min(book.availableCopies + 1, book.totalCopies);
    patchBook(book.id, {}, availableCopies);
  }

  return clone(returned);
}

export function resetLoans(): void {
  loans.clear();
}
