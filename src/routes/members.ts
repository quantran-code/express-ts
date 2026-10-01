import type { Request, Response } from 'express';
import express from 'express';
import { borrowBook, returnBook } from '../services/loanService';
import { createMember, deleteMember, getMemberById, listMembers, updateMember } from '../services/memberService';

import { BusinessRuleError, ConflictError, NotFoundError, ValidationError } from '../errors';

import { requireRole } from '../middleware/auth';

const membersRouter = express.Router();

const mapError = (err: unknown, res: Response) => {
  if (err instanceof ValidationError || err instanceof ConflictError || err instanceof BusinessRuleError || err instanceof NotFoundError) {
    return res.status(err.statusCode).json({ error: err.name, message: err.message });
  }

  return res.status(500).json({ error: 'InternalServerError', message: 'Unexpected error' });
};

membersRouter.post('/', requireRole('librarian') as any, (req: Request, res: Response) => {
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

membersRouter.get('/', requireRole('librarian') as any, (_req: Request, res: Response) => {
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

    if (req.user?.role === 'member' && req.user.id !== id) {
      res.status(403).json({ error: 'Forbidden', message: 'Insufficient role' });
      return;
    }

    const member = getMemberById(id);
    res.status(200).json(member);
  } catch (err) {
    return mapError(err, res);
  }
});

membersRouter.put('/:id', requireRole('librarian') as any, (req: Request, res: Response) => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const { name, email } = req.body ?? {};

    const updated = updateMember(id, { name, email });
    res.status(200).json(updated);
  } catch (err) {
    return mapError(err, res);
  }
});

membersRouter.delete('/:id', requireRole('librarian') as any, (req: Request, res: Response) => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

    deleteMember(id);
    res.status(204).send();
  } catch (err) {
    return mapError(err, res);
  }
});

// member self-service update/delete
membersRouter.put('/:id', (req: any, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized', message: 'Missing or invalid token' });
      return;
    }

    if (req.user.role === 'member' && req.user.id !== (Array.isArray(req.params.id) ? req.params.id[0] : req.params.id)) {
      res.status(403).json({ error: 'Forbidden', message: 'Insufficient role' });
      return;
    }

    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const { name, email } = req.body ?? {};

    const updated = updateMember(id, { name, email });
    res.status(200).json(updated);
  } catch (err) {
    return mapError(err, res);
  }
});

membersRouter.delete('/:id', (req: any, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized', message: 'Missing or invalid token' });
      return;
    }

    if (req.user.role === 'member' && req.user.id !== (Array.isArray(req.params.id) ? req.params.id[0] : req.params.id)) {
      res.status(403).json({ error: 'Forbidden', message: 'Insufficient role' });
      return;
    }

    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

    deleteMember(id);
    res.status(204).send();
  } catch (err) {
    return mapError(err, res);
  }
});

// test-only hook
membersRouter.post('/:memberId/loans', (req: any, res: Response) => {
  try {
    const { bookId, copies } = req.body ?? {};

    const memberIdFromUrl = Array.isArray(req.params.memberId) ? req.params.memberId[0] : req.params.memberId;
    const memberId = req.user?.role === 'librarian' ? memberIdFromUrl : req.user?.id;

    if (!memberId) {
      res.status(401).json({ error: 'Unauthorized', message: 'Missing or invalid token' });
      return;
    }

    if (req.user?.role === 'member' && memberIdFromUrl !== memberId) {
      res.status(403).json({ error: 'Forbidden', message: 'Insufficient role' });
      return;
    }

    const created = borrowBook(memberId, bookId, copies);

    res.status(201).json(created);
  } catch (err) {
    return mapError(err, res);
  }
});

// test-only hook
membersRouter.post('/:memberId/returns', (req: any, res: Response) => {
  try {
    const { bookId, copies } = req.body ?? {};

    const memberIdFromUrl = Array.isArray(req.params.memberId) ? req.params.memberId[0] : req.params.memberId;
    const memberId = req.user?.role === 'librarian' ? memberIdFromUrl : req.user?.id;

    if (!memberId) {
      res.status(401).json({ error: 'Unauthorized', message: 'Missing or invalid token' });
      return;
    }

    if (req.user?.role === 'member' && memberIdFromUrl !== memberId) {
      res.status(403).json({ error: 'Forbidden', message: 'Insufficient role' });
      return;
    }

    const updated = returnBook(memberId, bookId, copies);

    res.status(200).json(updated);
  } catch (err) {
    return mapError(err, res);
  }
});

export { membersRouter };
