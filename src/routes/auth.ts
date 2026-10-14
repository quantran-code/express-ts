import { Router, Request, Response } from 'express';
import { registerUser, verifyCredentials } from '../store/users';
import type { RegisterResult, UserErrorCode } from '../store/users';
import { signAccessToken } from '../auth/token';
import { requireAuth, requireRole } from '../auth/middleware';

const router = Router();

const STATUS_BY_CODE: Record<UserErrorCode, number> = {
  INVALID_FIELDS: 400,
  DUPLICATE_EMAIL: 409,
  INVALID_CREDENTIALS: 401,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function invalidCredentialsResponse(res: Response): void {
  res.status(401).json({
    error: { code: 'INVALID_CREDENTIALS', message: 'Invalid credentials.' },
  });
}

function sendRegisterResult(res: Response, result: RegisterResult, successStatus: number): void {
  if (result.ok) {
    res.status(successStatus).json(result.user);
    return;
  }

  res.status(STATUS_BY_CODE[result.error.code]).json({ error: result.error });
}

router.post('/register', async (req: Request, res: Response) => {
  const result = await registerUser(req.body, 'member');
  sendRegisterResult(res, result, 201);
});

router.post('/login', async (req: Request, res: Response) => {
  const body = req.body;
  const email = isRecord(body) ? body.email : undefined;
  const password = isRecord(body) ? body.password : undefined;

  if (typeof email !== 'string' || typeof password !== 'string') {
    invalidCredentialsResponse(res);
    return;
  }

  const result = await verifyCredentials(email, password);
  if (!result.ok) {
    invalidCredentialsResponse(res);
    return;
  }

  res.status(200).json({ token: signAccessToken(result.user.id, result.user.role) });
});

router.post(
  '/librarian',
  requireAuth,
  requireRole('librarian'),
  async (req: Request, res: Response) => {
    const result = await registerUser(req.body, 'librarian');
    sendRegisterResult(res, result, 201);
  },
);

export default router;
