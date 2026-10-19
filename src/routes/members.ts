import { Router, RequestHandler } from 'express';
import {
  createMember,
  deleteMember,
  findMemberByEmail,
  findMemberById,
  listMembers,
  patchMember,
  replaceMember,
} from '../members/store';
import {
  normalizeEmail,
  validateCreateMember,
  validatePatchMember,
} from '../members/validation';
import { countActiveLoansByMember, listActiveLoansByMember } from '../loans/store';

export const membersRouter: Router = Router();

export const createMemberHandler: RequestHandler = (req, res) => {
  const result = validateCreateMember(req.body);
  if (!result.ok) {
    res.status(400).json({ errors: result.errors });
    return;
  }

  const normalizedEmail = normalizeEmail(result.value.email);
  if (findMemberByEmail(normalizedEmail)) {
    res.status(409).json({ error: 'A member with this email already exists' });
    return;
  }

  const member = createMember({ ...result.value, email: normalizedEmail });
  res.status(201).json(member);
};

export const listMembersHandler: RequestHandler = (_req, res) => {
  res.status(200).json(listMembers());
};

export const getMemberByIdHandler: RequestHandler<{ id: string }> = (req, res) => {
  const member = findMemberById(req.params.id);
  if (!member) {
    res.status(404).json({ error: 'Member not found' });
    return;
  }

  res.status(200).json(member);
};

export const replaceMemberHandler: RequestHandler<{ id: string }> = (req, res) => {
  const result = validateCreateMember(req.body);
  if (!result.ok) {
    res.status(400).json({ errors: result.errors });
    return;
  }

  const existing = findMemberById(req.params.id);
  if (!existing) {
    res.status(404).json({ error: 'Member not found' });
    return;
  }

  const normalizedEmail = normalizeEmail(result.value.email);
  const conflict = findMemberByEmail(normalizedEmail);
  if (conflict && conflict.id !== existing.id) {
    res.status(409).json({ error: 'A member with this email already exists' });
    return;
  }

  const member = replaceMember(existing.id, { ...result.value, email: normalizedEmail });
  if (!member) {
    res.status(404).json({ error: 'Member not found' });
    return;
  }

  res.status(200).json(member);
};

export const patchMemberHandler: RequestHandler<{ id: string }> = (req, res) => {
  const result = validatePatchMember(req.body);
  if (!result.ok) {
    res.status(400).json({ errors: result.errors });
    return;
  }

  const existing = findMemberById(req.params.id);
  if (!existing) {
    res.status(404).json({ error: 'Member not found' });
    return;
  }

  const patch = { ...result.value };
  if (patch.email !== undefined) {
    const normalizedEmail = normalizeEmail(patch.email);
    const conflict = findMemberByEmail(normalizedEmail);
    if (conflict && conflict.id !== existing.id) {
      res.status(409).json({ error: 'A member with this email already exists' });
      return;
    }
    patch.email = normalizedEmail;
  }

  const member = patchMember(existing.id, patch);
  if (!member) {
    res.status(404).json({ error: 'Member not found' });
    return;
  }

  res.status(200).json(member);
};

export const deleteMemberHandler: RequestHandler<{ id: string }> = (req, res) => {
  const existing = findMemberById(req.params.id);
  if (!existing) {
    res.status(404).json({ error: 'Member not found' });
    return;
  }

  if (countActiveLoansByMember(existing.id) > 0) {
    res.status(409).json({ error: 'Member cannot be deleted while loans are active' });
    return;
  }

  deleteMember(existing.id);
  res.status(204).send();
};

export const listMemberLoansHandler: RequestHandler<{ id: string }> = (req, res) => {
  const member = findMemberById(req.params.id);
  if (!member) {
    res.status(404).json({ error: 'Member not found' });
    return;
  }

  res.status(200).json(listActiveLoansByMember(member.id));
};

membersRouter.post('/', createMemberHandler);
membersRouter.get('/', listMembersHandler);
membersRouter.get('/:id', getMemberByIdHandler);
membersRouter.put('/:id', replaceMemberHandler);
membersRouter.patch('/:id', patchMemberHandler);
membersRouter.delete('/:id', deleteMemberHandler);
membersRouter.get('/:id/loans', listMemberLoansHandler);
