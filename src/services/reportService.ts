import type { Book } from '../models/book';
import type { Loan } from '../models/loan';
import * as bookRepository from '../repositories/bookRepository';
import * as loanRepository from '../repositories/loanRepository';
import { listOverdueLoans } from './loanService';

const getMostBorrowed = (): { bookId: string; title: string; borrowCount: number }[] => {
  const loans = loanRepository.findAll();

  const counts = new Map<string, number>();
  for (const loan of loans) {
    const prev = counts.get(loan.bookId) ?? 0;
    counts.set(loan.bookId, prev + loan.copies);
  }

  const results: { bookId: string; title: string; borrowCount: number }[] = [];
  for (const [bookId, borrowCount] of counts.entries()) {
    const book = bookRepository.findById(bookId);
    if (!book) continue;

    results.push({
      bookId,
      title: book.title,
      borrowCount,
    });
  }

  results.sort((a, b) => b.borrowCount - a.borrowCount);
  return results;
};

const getOverdueSummary = (): { memberId: string; overdueCount: number }[] => {
  const overdueLoans: Loan[] = listOverdueLoans();

  const counts = new Map<string, number>();
  for (const loan of overdueLoans) {
    const prev = counts.get(loan.memberId) ?? 0;
    counts.set(loan.memberId, prev + loan.copies);
  }

  const results: { memberId: string; overdueCount: number }[] = [];
  for (const [memberId, overdueCount] of counts.entries()) {
    results.push({ memberId, overdueCount });
  }

  results.sort((a, b) => b.overdueCount - a.overdueCount);
  return results;
};

export {
  getMostBorrowed,
  getOverdueSummary,
};
