export interface Member {
  id: number;
  name: string;
  email: string;
}

export type MemberInput = {
  name: string;
  email: string;
};

export type MemberPatch = Partial<MemberInput>;

export type MemberErrorCode =
  | 'INVALID_FIELDS'
  | 'DUPLICATE_EMAIL'
  | 'NOT_FOUND'
  | 'MEMBER_HAS_ACTIVE_LOANS';

export interface MemberError {
  code: MemberErrorCode;
  message: string;
}

export type MemberResult =
  | { ok: true; member: Member }
  | { ok: false; error: MemberError };

const UPDATABLE_KEYS = ['name', 'email'];

let members: Member[] = [];
let nextId = 1;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isValidEmail(value: unknown): value is string {
  return typeof value === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function invalidFields(message: string): MemberResult {
  return { ok: false, error: { code: 'INVALID_FIELDS', message } };
}

function rejectDisallowedKeys(record: Record<string, unknown>): MemberResult | null {
  const unknownKeys = Object.keys(record).filter((key) => !UPDATABLE_KEYS.includes(key));
  if (unknownKeys.length > 0) {
    return invalidFields(`Unknown field(s): ${unknownKeys.join(', ')}.`);
  }

  return null;
}

export function createMember(input: unknown): MemberResult {
  if (!isRecord(input)) {
    return invalidFields('Member data must be an object.');
  }

  const disallowed = rejectDisallowedKeys(input);
  if (disallowed) {
    return disallowed;
  }

  const { name, email } = input;

  if (!isNonEmptyString(name)) {
    return invalidFields('name is required and must be a non-empty string.');
  }
  if (!isValidEmail(email)) {
    return invalidFields('email is required and must be a valid email address.');
  }

  const trimmedEmail = email.trim();

  if (members.some((member) => normalizeEmail(member.email) === normalizeEmail(trimmedEmail))) {
    return {
      ok: false,
      error: {
        code: 'DUPLICATE_EMAIL',
        message: `A member with email "${trimmedEmail}" already exists.`,
      },
    };
  }

  const member: Member = {
    id: nextId,
    name,
    email: trimmedEmail,
  };

  nextId += 1;
  members.push(member);

  return { ok: true, member };
}

export function listMembers(): Member[] {
  return [...members];
}

export function getMember(id: number): Member | undefined {
  return members.find((member) => member.id === id);
}

export function updateMember(id: number, patch: unknown): MemberResult {
  const index = members.findIndex((member) => member.id === id);
  if (index === -1) {
    return { ok: false, error: { code: 'NOT_FOUND', message: `Member with id ${id} not found.` } };
  }

  if (!isRecord(patch)) {
    return invalidFields('Update data must be an object.');
  }

  const disallowed = rejectDisallowedKeys(patch);
  if (disallowed) {
    return disallowed;
  }

  if (Object.keys(patch).length === 0) {
    return invalidFields('No updatable fields provided.');
  }

  const existing = members[index];

  if ('name' in patch && !isNonEmptyString(patch.name)) {
    return invalidFields('name must be a non-empty string.');
  }
  if ('email' in patch && !isValidEmail(patch.email)) {
    return invalidFields('email must be a valid email address.');
  }

  if ('email' in patch) {
    const email = (patch.email as string).trim();
    if (members.some((member) => member.id !== id && normalizeEmail(member.email) === normalizeEmail(email))) {
      return {
        ok: false,
        error: {
          code: 'DUPLICATE_EMAIL',
          message: `A member with email "${email}" already exists.`,
        },
      };
    }
  }

  const updated: Member = {
    id: existing.id,
    name: 'name' in patch ? (patch.name as string) : existing.name,
    email: 'email' in patch ? (patch.email as string).trim() : existing.email,
  };

  members[index] = updated;

  return { ok: true, member: updated };
}

export function deleteMember(id: number): MemberResult {
  const index = members.findIndex((member) => member.id === id);
  if (index === -1) {
    return { ok: false, error: { code: 'NOT_FOUND', message: `Member with id ${id} not found.` } };
  }

  const member = members[index];
  members.splice(index, 1);
  return { ok: true, member };
}

export function resetMemberStore(): void {
  members = [];
  nextId = 1;
}
