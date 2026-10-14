import { listBooks } from './books';
import { listMembers } from './members';
import { listAllLoans, listOverdueLoans } from './loans';

export interface MostBorrowedBookEntry {
  bookId: number;
  title: string;
  author: string;
  borrowCount: number;
}

export interface OverdueSummaryEntry {
  memberId: number;
  name: string;
  email: string;
  overdueLoans: number;
}

export function listMostBorrowedBooks(): MostBorrowedBookEntry[] {
  const borrowCounts = new Map<number, number>();

  for (const loan of listAllLoans()) {
    borrowCounts.set(loan.bookId, (borrowCounts.get(loan.bookId) ?? 0) + 1);
  }

  return listBooks()
    .map((book) => ({
      bookId: book.id,
      title: book.title,
      author: book.author,
      borrowCount: borrowCounts.get(book.id) ?? 0,
    }))
    .filter((entry) => entry.borrowCount > 0)
    .sort((a, b) => b.borrowCount - a.borrowCount || a.bookId - b.bookId);
}

export function listOverdueSummary(): OverdueSummaryEntry[] {
  const overdueCounts = new Map<number, number>();

  for (const loan of listOverdueLoans()) {
    overdueCounts.set(loan.memberId, (overdueCounts.get(loan.memberId) ?? 0) + 1);
  }

  return listMembers()
    .map((member) => ({
      memberId: member.id,
      name: member.name,
      email: member.email,
      overdueLoans: overdueCounts.get(member.id) ?? 0,
    }))
    .filter((entry) => entry.overdueLoans > 0)
    .sort((a, b) => a.memberId - b.memberId);
}
