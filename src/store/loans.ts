import { getBook } from './books';
import { getMember } from './members';

export interface Loan {
  id: number;
  bookId: number;
  memberId: number;
  borrowedAt: string;
  returnedAt: string | null;
}

export type LoanInput = {
  bookId: number;
  memberId: number;
};

export type LoanErrorCode =
  | 'INVALID_FIELDS'
  | 'NOT_FOUND'
  | 'NO_COPIES'
  | 'DUPLICATE_LOAN'
  | 'LOAN_LIMIT_REACHED'
  | 'LOAN_NOT_FOUND';

export interface LoanError {
  code: LoanErrorCode;
  message: string;
}

export type LoanResult =
  | { ok: true; loan: Loan }
  | { ok: false; error: LoanError };

const INPUT_KEYS = ['bookId', 'memberId'];
const MAX_ACTIVE_LOANS = 3;

let loans: Loan[] = [];
let nextId = 1;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

function invalidFields(message: string): LoanResult {
  return { ok: false, error: { code: 'INVALID_FIELDS', message } };
}

function rejectDisallowedKeys(record: Record<string, unknown>): LoanResult | null {
  const unknownKeys = Object.keys(record).filter((key) => !INPUT_KEYS.includes(key));
  if (unknownKeys.length > 0) {
    return invalidFields(`Unknown field(s): ${unknownKeys.join(', ')}.`);
  }

  return null;
}

export function countActiveLoansForMember(memberId: number): number {
  return loans.filter((loan) => loan.memberId === memberId && loan.returnedAt === null).length;
}

export function hasActiveLoansForMember(memberId: number): boolean {
  return countActiveLoansForMember(memberId) > 0;
}

export function borrowBook(input: unknown): LoanResult {
  if (!isRecord(input)) {
    return invalidFields('Loan data must be an object.');
  }

  const disallowed = rejectDisallowedKeys(input);
  if (disallowed) {
    return disallowed;
  }

  const { bookId, memberId } = input;

  if (!isPositiveInteger(bookId)) {
    return invalidFields('bookId is required and must be an integer greater than 0.');
  }
  if (!isPositiveInteger(memberId)) {
    return invalidFields('memberId is required and must be an integer greater than 0.');
  }

  const book = getBook(bookId);
  if (!book) {
    return { ok: false, error: { code: 'NOT_FOUND', message: `Book with id ${bookId} not found.` } };
  }

  const member = getMember(memberId);
  if (!member) {
    return { ok: false, error: { code: 'NOT_FOUND', message: `Member with id ${memberId} not found.` } };
  }

  if (loans.some((loan) => loan.bookId === bookId && loan.memberId === memberId && loan.returnedAt === null)) {
    return {
      ok: false,
      error: {
        code: 'DUPLICATE_LOAN',
        message: `Member ${memberId} already has an active loan for book ${bookId}.`,
      },
    };
  }

  if (countActiveLoansForMember(memberId) >= MAX_ACTIVE_LOANS) {
    return {
      ok: false,
      error: {
        code: 'LOAN_LIMIT_REACHED',
        message: `Member ${memberId} already has ${MAX_ACTIVE_LOANS} active loans.`,
      },
    };
  }

  if (book.availableCopies <= 0) {
    return {
      ok: false,
      error: {
        code: 'NO_COPIES',
        message: `Book with id ${bookId} has no available copies.`,
      },
    };
  }

  const loan: Loan = {
    id: nextId,
    bookId,
    memberId,
    borrowedAt: new Date().toISOString(),
    returnedAt: null,
  };

  nextId += 1;
  loans.push(loan);
  book.availableCopies -= 1;

  return { ok: true, loan };
}

export function returnBook(id: number): LoanResult {
  const loan = loans.find((candidate) => candidate.id === id);
  if (!loan || loan.returnedAt !== null) {
    return {
      ok: false,
      error: {
        code: 'LOAN_NOT_FOUND',
        message: `Loan with id ${id} not found or already returned.`,
      },
    };
  }

  loan.returnedAt = new Date().toISOString();

  const book = getBook(loan.bookId);
  if (book) {
    book.availableCopies += 1;
  }

  return { ok: true, loan };
}

export function listActiveLoansForMember(memberId: number): Loan[] {
  return loans.filter((loan) => loan.memberId === memberId && loan.returnedAt === null);
}

export function resetLoanStore(): void {
  loans = [];
  nextId = 1;
}
