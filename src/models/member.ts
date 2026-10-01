export interface Member {
  id: string;
  name: string;
  email: string;
  role: 'member' | 'librarian';
  passwordHash: string;
}
