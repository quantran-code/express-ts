import express, { Application, Request, Response } from 'express';
import { booksRouter } from './routes/books';

const app: Application = express();

app.use(express.json());

app.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({ status: 'ok' });
});

app.use('/books', booksRouter);

export default app;
