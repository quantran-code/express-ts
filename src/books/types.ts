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

/**
 * Parsed query for the paginated catalog listing: an optional search term plus the
 * page (1-based) and page size already validated against the allowed bounds.
 */
export interface BookSearchQuery {
  q?: string;
  page: number;
  pageSize: number;
}

/**
 * A single page of catalog search results, with `total` counting every match in the
 * catalog rather than just the returned page.
 */
export interface PaginatedBooks {
  items: Book[];
  total: number;
  page: number;
  pageSize: number;
}

export type UpdateBookInput = CreateBookInput;

export type PatchBookInput = Partial<CreateBookInput>;

export type FieldErrors = Record<string, string>;

export type ValidationResult<T> = { ok: true; value: T } | { ok: false; errors: FieldErrors };
