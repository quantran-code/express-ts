export interface Loan {
  id: string;
  memberId: string;
  bookId: string;
  copies: number;
  borrowedAt: string;
  returnedAt?: string;
}
