export interface Book {
  id: string;
  title: string;
  author: string;
  isbn: string;
  totalCopies: number;
  availableCopies: number;
}

export interface CreateBookInput {
  title: string;
  author: string;
  isbn: string;
  totalCopies: number;
}

export type UpdateBookInput = CreateBookInput;

export type PatchBookInput = Partial<CreateBookInput>;

export type FieldErrors = Record<string, string>;

export type ValidationResult<T> = { ok: true; value: T } | { ok: false; errors: FieldErrors };
