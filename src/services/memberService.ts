import type { Member } from '../models/member';
import * as memberRepository from '../repositories/memberRepository';
import { ConflictError, NotFoundError, ValidationError } from '../errors';

type CreateMemberInput = {
  name: string;
  email: string;
};

const isNonEmptyString = (value: unknown): value is string => {
  return typeof value === 'string' && value.trim().length > 0;
};

const createMember = (input: CreateMemberInput): Member => {
  if (!isNonEmptyString(input.name)) {
    throw new ValidationError('name is required');
  }

  if (!isNonEmptyString(input.email)) {
    throw new ValidationError('email is required');
  }

  if (memberRepository.existsByEmail(input.email)) {
    throw new ConflictError('email already exists');
  }

  const created = memberRepository.create({
    name: input.name,
    email: input.email,
    role: 'member',
    passwordHash: '',
  });

  return created;
};

const updateMember = (id: string, patch: { name?: string; email?: string }): Member => {
  const existing = memberRepository.findById(id);
  if (!existing) {
    throw new NotFoundError('member not found');
  }

  const nextName = patch.name !== undefined ? patch.name : existing.name;
  const nextEmail = patch.email !== undefined ? patch.email : existing.email;

  if (patch.name !== undefined && !isNonEmptyString(patch.name)) {
    throw new ValidationError('name must be a non-empty string');
  }

  if (patch.email !== undefined && !isNonEmptyString(patch.email)) {
    throw new ValidationError('email must be a non-empty string');
  }

  if (patch.email !== undefined && memberRepository.existsByEmail(nextEmail, id)) {
    throw new ConflictError('email already exists');
  }

  const updated = memberRepository.update(id, {
    name: nextName,
    email: nextEmail,
  });

  if (!updated) {
    throw new NotFoundError('member not found');
  }

  return updated;
};

const deleteMember = (id: string): void => {
  const existing = memberRepository.findById(id);
  if (!existing) {
    throw new NotFoundError('member not found');
  }

  memberRepository.remove(id);
};

const listMembers = (): Member[] => {
  return memberRepository.findAll();
};

const getMemberById = (id: string): Member => {
  const found = memberRepository.findById(id);
  if (!found) {
    throw new NotFoundError('member not found');
  }

  return found;
};

export {
  createMember,
  updateMember,
  deleteMember,
  listMembers,
  getMemberById,
};
