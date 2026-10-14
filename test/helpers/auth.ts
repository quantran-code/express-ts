import request from 'supertest';
import app from '../../src/app';
import {
  SEEDED_LIBRARIAN_EMAIL,
  SEEDED_LIBRARIAN_PASSWORD,
} from '../../src/auth/config';

export async function loginAsSeededLibrarian(): Promise<string> {
  const res = await request(app).post('/auth/login').send({
    email: SEEDED_LIBRARIAN_EMAIL,
    password: SEEDED_LIBRARIAN_PASSWORD,
  });

  if (res.status !== 200) {
    throw new Error(
      `Failed to log in as seeded librarian: ${res.status} ${JSON.stringify(res.body)}`,
    );
  }

  return res.body.token as string;
}
