import express, { Application, Request, Response } from 'express';
import { booksRouter } from './routes/books';
import { membersRouter } from './routes/members';
import { loansRouter } from './routes/loans';

const app: Application = express();

app.use(express.json());

app.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({ status: 'ok' });
});

app.use('/books', booksRouter);
app.use('/members', membersRouter);
app.use('/loans', loansRouter);

export default app;
