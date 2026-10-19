import { randomUUID } from 'crypto';
import type { CreateMemberInput, Member, PatchMemberInput } from './types';
import { normalizeEmail } from './validation';

/**
 * Module-level in-memory member registry. Process memory only: no database, no migrations.
 */
const members = new Map<string, Member>();

function clone(member: Member): Member {
  return { ...member };
}

export function createMember(input: CreateMemberInput): Member {
  const member: Member = {
    id: randomUUID(),
    name: input.name,
    email: normalizeEmail(input.email),
  };

  members.set(member.id, member);
  return clone(member);
}

export function listMembers(): Member[] {
  return Array.from(members.values(), clone);
}

export function findMemberById(id: string): Member | undefined {
  const member = members.get(id);
  return member ? clone(member) : undefined;
}

export function findMemberByEmail(normalizedEmail: string): Member | undefined {
  const email = normalizeEmail(normalizedEmail);
  for (const member of members.values()) {
    if (member.email === email) {
      return clone(member);
    }
  }
  return undefined;
}

export function replaceMember(id: string, input: CreateMemberInput): Member | undefined {
  const existing = members.get(id);
  if (!existing) {
    return undefined;
  }

  const updated: Member = {
    id,
    name: input.name,
    email: normalizeEmail(input.email),
  };

  members.set(id, updated);
  return clone(updated);
}

export function patchMember(id: string, patch: PatchMemberInput): Member | undefined {
  const existing = members.get(id);
  if (!existing) {
    return undefined;
  }

  const updated: Member = {
    id,
    name: patch.name !== undefined ? patch.name : existing.name,
    email: patch.email !== undefined ? normalizeEmail(patch.email) : existing.email,
  };

  members.set(id, updated);
  return clone(updated);
}

export function deleteMember(id: string): boolean {
  return members.delete(id);
}

export function resetMembers(): void {
  members.clear();
}
