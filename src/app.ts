import express, { Application, Request, Response } from 'express';
import { booksRouter } from './routes/books';
import { membersRouter } from './routes/members';
import { authRouter } from './routes/auth';
import { requireAuth } from './middleware/auth';
import bcrypt from 'bcrypt';
import * as memberRepository from './repositories/memberRepository';
import { reportsRouter } from './routes/reports';
import { loansRouter } from './routes/loans';

const app: Application = express();

app.use(express.json());

app.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({ status: 'ok' });
});

const seedLibrarian = () => {
  const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? 'librarian@example.com';
  const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? 'librarian-password';
  const ADMIN_NAME = process.env.ADMIN_NAME ?? 'Librarian';

  const existing = memberRepository.findByEmail(ADMIN_EMAIL);
  if (existing) return;

  const passwordHash = bcrypt.hashSync(ADMIN_PASSWORD, 10);
  memberRepository.create({
    name: ADMIN_NAME,
    email: ADMIN_EMAIL,
    role: 'librarian',
    passwordHash,
  });
};

seedLibrarian();

app.use('/auth', authRouter);

app.use(requireAuth);

app.use('/books', booksRouter);
app.use('/members', membersRouter);
app.use('/reports', reportsRouter);
app.use('/loans', loansRouter);

export default app;
