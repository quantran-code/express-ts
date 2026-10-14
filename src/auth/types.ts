import type { Role } from '../store/users';

export interface AuthContext {
  userId: number;
  role: Role;
}
