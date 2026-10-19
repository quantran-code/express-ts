import express, { Application, Request, Response } from 'express';
import { authenticateToken } from './auth/middleware';
import { authRouter } from './routes/auth';
import { booksRouter } from './routes/books';
import { membersRouter } from './routes/members';
import { loansRouter } from './routes/loans';

const app: Application = express();

app.use(express.json());

app.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({ status: 'ok' });
});

app.use('/auth', authRouter);

app.use('/books', authenticateToken, booksRouter);
app.use('/members', authenticateToken, membersRouter);
app.use('/loans', authenticateToken, loansRouter);

export default app;
