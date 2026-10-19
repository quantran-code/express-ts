import { Router, Request, RequestHandler } from 'express';
import { callerMemberId, isLibrarian, requireLibrarian } from '../auth/middleware';
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

/**
 * Whether the caller may act on the member record `memberId`. Librarians manage every
 * member; a member only ever reaches the record their own token points at. The target is
 * never looked up, so a cross-member attempt is a 403 whether or not the id exists.
 */
export function canAccessMember(req: Request, memberId: string): boolean {
  if (isLibrarian(req)) {
    return true;
  }

  return callerMemberId(req) === memberId;
}

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

/**
 * A librarian sees the whole registry; a member sees only their own record, so listing
 * members never exposes another member's data. A member token without a member record
 * (the seeded librarian has none, but a member always does) yields an empty list.
 */
export const listMembersHandler: RequestHandler = (req, res) => {
  if (isLibrarian(req)) {
    res.status(200).json(listMembers());
    return;
  }

  const memberId = callerMemberId(req);
  const member = memberId === null ? undefined : findMemberById(memberId);
  res.status(200).json(member ? [member] : []);
};

export const getMemberByIdHandler: RequestHandler<{ id: string }> = (req, res) => {
  if (!canAccessMember(req, req.params.id)) {
    res.status(403).json({ error: 'A member may only access their own record' });
    return;
  }

  const member = findMemberById(req.params.id);
  if (!member) {
    res.status(404).json({ error: 'Member not found' });
    return;
  }

  res.status(200).json(member);
};

export const replaceMemberHandler: RequestHandler<{ id: string }> = (req, res) => {
  if (!canAccessMember(req, req.params.id)) {
    res.status(403).json({ error: 'A member may only access their own record' });
    return;
  }

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
  if (!canAccessMember(req, req.params.id)) {
    res.status(403).json({ error: 'A member may only access their own record' });
    return;
  }

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
  if (!canAccessMember(req, req.params.id)) {
    res.status(403).json({ error: 'A member may only access their own record' });
    return;
  }

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
  if (!canAccessMember(req, req.params.id)) {
    res.status(403).json({ error: 'A member may only access their own loans' });
    return;
  }

  const member = findMemberById(req.params.id);
  if (!member) {
    res.status(404).json({ error: 'Member not found' });
    return;
  }

  res.status(200).json(listActiveLoansByMember(member.id));
};

membersRouter.post('/', requireLibrarian, createMemberHandler);
membersRouter.get('/', listMembersHandler);
membersRouter.get('/:id', getMemberByIdHandler);
membersRouter.put('/:id', replaceMemberHandler);
membersRouter.patch('/:id', patchMemberHandler);
membersRouter.delete('/:id', deleteMemberHandler);
membersRouter.get('/:id/loans', listMemberLoansHandler);
