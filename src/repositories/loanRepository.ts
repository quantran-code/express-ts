import type { Loan } from '../models/loan';


type LoanInput = Omit<Loan, 'id'>;

const loans = new Map<string, Loan>();

let nextId = 1;

const generateId = (): string => {
  return String(nextId++);
};

const create = (data: Omit<Loan, 'id'>): Loan => {
  const id = generateId();

  const loan: LoanInput = {
    memberId: data.memberId,
    bookId: data.bookId,
    copies: data.copies,
    borrowedAt: data.borrowedAt,
    dueDate: data.dueDate,
    returnedAt: data.returnedAt,
  };

  const stored: Loan = { id, ...loan };
  loans.set(id, stored);
  return stored;
};

const findAll = (): Loan[] => {
  return Array.from(loans.values());
};

const findById = (id: string): Loan | undefined => {
  return loans.get(id);
};

const findActiveByMemberAndBook = (memberId: string, bookId: string): Loan | undefined => {
  for (const loan of loans.values()) {
    if (loan.memberId === memberId && loan.bookId === bookId && loan.returnedAt === undefined) {
      return loan;
    }
  }

  return undefined;
};

const update = (id: string, patch: Partial<Loan>): Loan | undefined => {
  const existing = loans.get(id);
  if (!existing) return undefined;

  const updated: Loan = {
    ...existing,
    ...patch,
  };

  loans.set(id, updated);
  return updated;
};

const reset = (): void => {
  loans.clear();
  nextId = 1;
};

export {
  create,
  findAll,
  findById,
  findActiveByMemberAndBook,
  update,
  reset,
};
