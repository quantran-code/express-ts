import type { Role } from '../store/users';

export interface AuthContext {
  userId: number;
  email: string;
  role: Role;
}
