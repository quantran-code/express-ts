import { findBookById } from '../books/store';
import { findMemberById } from '../members/store';
import { listLoans, listOverdueLoans } from '../loans/store';
import type { MostBorrowedBook, OverdueSummaryEntry } from './types';

/**
 * Counts every loan ever created per book — returned loans included — and ranks the books
 * from most to least borrowed, breaking ties by title A→Z. Books that were never borrowed
 * are absent rather than reported with a zero count, and loans whose book record is gone
 * are skipped. No limit and no pagination: the whole ranking is returned.
 */
export function mostBorrowedBooks(): MostBorrowedBook[] {
  const borrowCounts = new Map<string, number>();
  for (const loan of listLoans()) {
    borrowCounts.set(loan.bookId, (borrowCounts.get(loan.bookId) ?? 0) + 1);
  }

  const report: MostBorrowedBook[] = [];
  for (const [bookId, borrowCount] of borrowCounts) {
    const book = findBookById(bookId);
    if (!book) {
      continue;
    }

    report.push({ bookId, title: book.title, borrowCount });
  }

  report.sort(
    (a, b) => b.borrowCount - a.borrowCount || a.title.localeCompare(b.title),
  );

  return report;
}

/**
 * Counts the loans each member currently has overdue and joins the member name, ordered by
 * overdue count descending then member name A→Z. `now` is supplied by the caller so status
 * stays recomputed per request: `listOverdueLoans` already excludes returned loans and uses
 * a strict comparison, so a loan at the exact due instant is not counted. Members with no
 * overdue loan — and members whose record is gone — never appear.
 */
export function overdueSummary(now: number): OverdueSummaryEntry[] {
  const overdueCounts = new Map<string, number>();
  for (const loan of listOverdueLoans(now)) {
    overdueCounts.set(loan.memberId, (overdueCounts.get(loan.memberId) ?? 0) + 1);
  }

  const summary: OverdueSummaryEntry[] = [];
  for (const [memberId, overdueCount] of overdueCounts) {
    const member = findMemberById(memberId);
    if (!member) {
      continue;
    }

    summary.push({ memberId, memberName: member.name, overdueCount });
  }

  summary.sort(
    (a, b) => b.overdueCount - a.overdueCount || a.memberName.localeCompare(b.memberName),
  );

  return summary;
}
