import express, { Application, Request, Response } from 'express';
import authRouter from './routes/auth';
import booksRouter from './routes/books';
import membersRouter from './routes/members';
import loansRouter from './routes/loans';
import { requireAuth } from './auth/middleware';

const app: Application = express();

app.use(express.json());

app.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({ status: 'ok' });
});

app.use('/auth', authRouter);
app.use('/books', requireAuth, booksRouter);
app.use('/members', requireAuth, membersRouter);
app.use('/loans', requireAuth, loansRouter);

export default app;
