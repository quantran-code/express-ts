/**
 * One row of the most-borrowed-books report: every book that has ever been borrowed,
 * with the total number of loans created for it (returned or not).
 */
export interface MostBorrowedBook {
  bookId: string;
  title: string;
  borrowCount: number;
}

/**
 * One row of the overdue summary: how many loans a member currently has past their due
 * date. Members with no overdue loan never appear.
 */
export interface OverdueSummaryEntry {
  memberId: string;
  memberName: string;
  overdueCount: number;
}
