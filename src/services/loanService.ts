import type { Loan } from '../models/loan';
import * as bookService from './bookService';
import * as memberService from './memberService';
import * as loanRepository from '../repositories/loanRepository';
import { BusinessRuleError, NotFoundError, ValidationError } from '../errors';

const isInteger = (value: unknown): value is number => {
  return typeof value === 'number' && Number.isInteger(value);
};

const isPositiveInteger = (value: unknown): value is number => {
  return isInteger(value) && value > 0;
};

const borrowBook = (memberId: string, bookId: string, copies: number): Loan => {
  const member = memberService.getMemberById(memberId);
  void member;

  const book = bookService.getBookById(bookId);
  void book;

  if (!isPositiveInteger(copies)) {
    throw new ValidationError('copies must be a positive integer');
  }

  const existingActive = loanRepository.findActiveByMemberAndBook(memberId, bookId);
  if (existingActive) {
    throw new BusinessRuleError('active loan already exists for this member and book');
  }

  const updatedBook = bookService.borrowCopies(bookId, copies);
  void updatedBook;

  const borrowedAt = new Date().toISOString();

  const dueDate = new Date(new Date(borrowedAt).getTime() + 14 * 24 * 60 * 60 * 1000).toISOString();

  const created = loanRepository.create({
    memberId,
    bookId,
    copies,
    borrowedAt,
    dueDate,
    returnedAt: undefined,
  });

  return created;
};

const returnBook = (memberId: string, bookId: string, copies: number): Loan => {
  const member = memberService.getMemberById(memberId);
  void member;

  const book = bookService.getBookById(bookId);
  void book;

  if (!isPositiveInteger(copies)) {
    throw new ValidationError('copies must be a positive integer');
  }

  const activeLoan = loanRepository.findActiveByMemberAndBook(memberId, bookId);
  if (!activeLoan) {
    throw new BusinessRuleError('no active loan exists for this member and book');
  }

  const updatedBook = bookService.returnCopies(bookId, copies);
  void updatedBook;

  const returnedAt = new Date().toISOString();

  const updated = loanRepository.update(activeLoan.id, {
    returnedAt,
  });

  if (!updated) {
    throw new NotFoundError('loan not found');
  }

  return updated;
};

const listOverdueLoans = (): { items: Loan[]; total: number } => {
  const now = new Date();

  const all = loanRepository.findAll();

  const overdue = all.filter((loan) => {
    if (loan.returnedAt !== undefined) {
      return false;
    }

    return now.getTime() > new Date(loan.dueDate).getTime();
  });

  return {
    items: overdue,
    total: overdue.length,
  };
};

export {
  borrowBook,
  returnBook,
  listOverdueLoans,
};
