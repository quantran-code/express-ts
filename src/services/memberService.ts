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
  });

  return created;
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
  listMembers,
  getMemberById,
};
