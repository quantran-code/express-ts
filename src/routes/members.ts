import { Router, Request, Response } from 'express';
import {
  createMember,
  listMembers,
  getMember,
  updateMember,
  deleteMember,
} from '../store/members';
import { hasActiveLoansForMember, listActiveLoansForMember } from '../store/loans';
import type { MemberResult, MemberErrorCode } from '../store/members';

const router = Router();

const STATUS_BY_CODE: Record<MemberErrorCode, number> = {
  INVALID_FIELDS: 400,
  DUPLICATE_EMAIL: 409,
  NOT_FOUND: 404,
  MEMBER_HAS_ACTIVE_LOANS: 422,
};

function parseId(raw: unknown): number | null {
  if (typeof raw !== 'string' || !/^[1-9]\d*$/.test(raw)) {
    return null;
  }
  return Number(raw);
}

function notFoundResponse(res: Response, message: string): void {
  res.status(404).json({ error: { code: 'NOT_FOUND', message } });
}

function sendResult(res: Response, result: MemberResult, successStatus: number): void {
  if (result.ok) {
    res.status(successStatus).json(result.member);
    return;
  }

  res.status(STATUS_BY_CODE[result.error.code]).json({ error: result.error });
}

function updateHandler(req: Request, res: Response): void {
  const id = parseId(req.params.id);
  if (id === null) {
    notFoundResponse(res, `Member id "${req.params.id}" is not valid.`);
    return;
  }

  sendResult(res, updateMember(id, req.body), 200);
}

router.post('/', (req: Request, res: Response) => {
  sendResult(res, createMember(req.body), 201);
});

router.get('/', (_req: Request, res: Response) => {
  res.status(200).json(listMembers());
});

router.get('/:id', (req: Request, res: Response) => {
  const id = parseId(req.params.id);
  if (id === null) {
    notFoundResponse(res, `Member id "${req.params.id}" is not valid.`);
    return;
  }

  const member = getMember(id);
  if (!member) {
    notFoundResponse(res, `Member with id ${id} not found.`);
    return;
  }

  res.status(200).json(member);
});

router.get('/:id/loans', (req: Request, res: Response) => {
  const id = parseId(req.params.id);
  if (id === null) {
    notFoundResponse(res, `Member id "${req.params.id}" is not valid.`);
    return;
  }

  const member = getMember(id);
  if (!member) {
    notFoundResponse(res, `Member with id ${id} not found.`);
    return;
  }

  res.status(200).json(listActiveLoansForMember(id));
});

router.put('/:id', updateHandler);
router.patch('/:id', updateHandler);

router.delete('/:id', (req: Request, res: Response) => {
  const id = parseId(req.params.id);
  if (id === null) {
    notFoundResponse(res, `Member id "${req.params.id}" is not valid.`);
    return;
  }

  const member = getMember(id);
  if (!member) {
    notFoundResponse(res, `Member with id ${id} not found.`);
    return;
  }

  if (hasActiveLoansForMember(id)) {
    res.status(422).json({
      error: {
        code: 'MEMBER_HAS_ACTIVE_LOANS',
        message: `Member with id ${id} has active loans and cannot be deleted.`,
      },
    });
    return;
  }

  sendResult(res, deleteMember(id), 200);
});

export default router;
