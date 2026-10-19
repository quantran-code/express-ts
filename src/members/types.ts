export interface Member {
  id: string;
  name: string;
  email: string;
}

export interface CreateMemberInput {
  name: string;
  email: string;
}

export type UpdateMemberInput = CreateMemberInput;

export type PatchMemberInput = Partial<CreateMemberInput>;

export type { FieldErrors, ValidationResult } from '../books/types';
