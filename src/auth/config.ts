export const JWT_SECRET = process.env.JWT_SECRET ?? 'dev-secret-change-me';
export const JWT_EXPIRES_IN = '1h' as const;

export const MIN_PASSWORD_LENGTH = 8;

export const SEEDED_LIBRARIAN_EMAIL = 'librarian@library.test';
export const SEEDED_LIBRARIAN_PASSWORD = 'librarian-password';
export const SEEDED_LIBRARIAN_NAME = 'Seed Librarian';
