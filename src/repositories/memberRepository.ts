import type { Member } from '../models/member';


type MemberInput = Omit<Member, 'id'>;

const members = new Map<string, Member>();

let nextId = 1;

const generateId = (): string => {
  return String(nextId++);
};

const create = (data: Omit<Member, 'id'>): Member => {
  const id = generateId();

  const member: MemberInput = {
    name: data.name,
    email: data.email,
  };

  const stored: Member = { id, ...member };
  members.set(id, stored);
  return stored;
};

const findAll = (): Member[] => {
  return Array.from(members.values());
};

const findById = (id: string): Member | undefined => {
  return members.get(id);
};

const existsByEmail = (email: string, excludeId?: string): boolean => {
  for (const member of members.values()) {
    if (member.email === email && (!excludeId || member.id !== excludeId)) {
      return true;
    }
  }

  return false;
};

const reset = (): void => {
  members.clear();
  nextId = 1;
};

export {
  create,
  findAll,
  findById,
  existsByEmail,
  reset,
};
