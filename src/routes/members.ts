import type { Request, Response } from 'express';
import express from 'express';
import { BusinessRuleError, ConflictError, NotFoundError, ValidationError } from '../errors';
import { borrowBook, returnBook } from '../services/loanService';
import { createMember, getMemberById, listMembers } from '../services/memberService';

const membersRouter = express.Router();

const mapError = (err: unknown, res: Response) => {
  if (err instanceof ValidationError || err instanceof ConflictError || err instanceof BusinessRuleError || err instanceof NotFoundError) {
    return res.status(err.statusCode).json({ error: err.name, message: err.message });
  }

  return res.status(500).json({ error: 'InternalServerError', message: 'Unexpected error' });
};

membersRouter.post('/', (req: Request, res: Response) => {
  try {
    const { name, email } = req.body ?? {};

    const created = createMember({
      name,
      email,
    });

    res.status(201).json(created);
  } catch (err) {
    return mapError(err, res);
  }
});

membersRouter.get('/', (_req: Request, res: Response) => {
  try {
    const members = listMembers();
    res.status(200).json(members);
  } catch (err) {
    return mapError(err, res);
  }
});

membersRouter.get('/:id', (req: Request, res: Response) => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const member = getMemberById(id);
    res.status(200).json(member);
  } catch (err) {
    return mapError(err, res);
  }
});

// test-only hook
membersRouter.post('/:memberId/loans', (req: Request, res: Response) => {
  try {
    const { bookId, copies } = req.body ?? {};

    const memberId = Array.isArray(req.params.memberId) ? req.params.memberId[0] : req.params.memberId;
    const created = borrowBook(memberId, bookId, copies);

    res.status(201).json(created);
  } catch (err) {
    return mapError(err, res);
  }
});

// test-only hook
membersRouter.post('/:memberId/returns', (req: Request, res: Response) => {
  try {
    const { bookId, copies } = req.body ?? {};

    const memberId = Array.isArray(req.params.memberId) ? req.params.memberId[0] : req.params.memberId;
    const updated = returnBook(memberId, bookId, copies);

    res.status(200).json(updated);
  } catch (err) {
    return mapError(err, res);
  }
});

export { membersRouter };
