import type { Request, Response } from 'express';
import express from 'express';
import { ConflictError, ValidationError } from '../errors';
import { login, register } from '../services/authService';

const authRouter = express.Router();

const mapError = (err: unknown, res: Response) => {
  if (err instanceof ValidationError || err instanceof ConflictError) {
    return res.status(err.statusCode).json({ error: err.name, message: err.message });
  }

  return res.status(500).json({ error: 'InternalServerError', message: 'Unexpected error' });
};

authRouter.post('/register', (req: Request, res: Response) => {
  try {
    const { name, email, password } = req.body ?? {};

    const created = register({
      name,
      email,
      password,
    });

    res.status(201).json(created);
  } catch (err) {
    return mapError(err, res);
  }
});

authRouter.post('/login', (req: Request, res: Response) => {
  try {
    const { email, password } = req.body ?? {};

    const { token } = login({
      email,
      password,
    });

    res.status(200).json({ token });
  } catch (err) {
    return mapError(err, res);
  }
});

export { authRouter };
