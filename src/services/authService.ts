import type { Member } from '../models/member';
import * as memberRepository from '../repositories/memberRepository';
import { ConflictError, ValidationError } from '../errors';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

type RegisterInput = {
  name: string;
  email: string;
  password: string;
};

type LoginInput = {
  email: string;
  password: string;
};

type JwtPayload = {
  id: string;
  role: Member['role'];
};

const INVALID_CREDENTIALS_MESSAGE = 'invalid credentials';

const PASSWORD_MIN_LENGTH = 8;

const JWT_SECRET = process.env.JWT_SECRET ?? 'dev-secret';

const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN ?? '1h';

const signToken = (payload: JwtPayload): string => {
  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: JWT_EXPIRES_IN,
  });
};

const register = (input: RegisterInput): Omit<Member, 'passwordHash'> => {
  const { name, email, password } = input;

  if (typeof name !== 'string' || name.trim().length === 0) {
    throw new ValidationError('name is required');
  }

  if (typeof email !== 'string' || email.trim().length === 0) {
    throw new ValidationError('email is required');
  }

  if (typeof password !== 'string' || password.trim().length === 0) {
    throw new ValidationError('password is required');
  }

  if (password.length < PASSWORD_MIN_LENGTH) {
    throw new ValidationError(`password must be at least ${PASSWORD_MIN_LENGTH} characters`);
  }

  if (memberRepository.existsByEmail(email)) {
    throw new ConflictError('email already exists');
  }

  const passwordHash = bcrypt.hashSync(password, 10);

  const created = memberRepository.create({
    name,
    email,
    role: 'member',
    passwordHash,
  });

  const { passwordHash: _passwordHash, ...withoutPasswordHash } = created;
  return withoutPasswordHash;
};

const login = (input: LoginInput): { token: string } => {
  const { email, password } = input;

  const member = memberRepository.findByEmail(email);
  if (!member) {
    throw new ValidationError(INVALID_CREDENTIALS_MESSAGE);
  }

  const matches = bcrypt.compareSync(password, member.passwordHash);
  if (!matches) {
    throw new ValidationError(INVALID_CREDENTIALS_MESSAGE);
  }

  const token = signToken({ id: member.id, role: member.role });
  return { token };
};

export {
  register,
  login,
};
