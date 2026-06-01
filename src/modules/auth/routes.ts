import { Router } from 'express';
import { errorMessage } from '../../shared/http';
import { requireAuth } from './middleware';
import { loginSchema, refreshSchema } from './schemas';
import { login, refreshTokens } from './service';

export const createAuthRouter = () => {
  const router = Router();

  router.post('/login', (req, res) => {
    const input = loginSchema.safeParse(req.body);
    if (!input.success) {
      return res.status(400).json({ error: input.error.flatten() });
    }

    try {
      return res.json(login(input.data.username, input.data.password));
    } catch (error) {
      return res.status(401).json({ error: errorMessage(error, 'Unauthorized') });
    }
  });

  router.post('/refresh', (req, res) => {
    const input = refreshSchema.safeParse(req.body);
    if (!input.success) {
      return res.status(400).json({ error: input.error.flatten() });
    }

    try {
      return res.json(refreshTokens(input.data.refreshToken));
    } catch {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  });

  router.get('/me', requireAuth, (req, res) => {
    return res.json({ user: req.authUser });
  });

  router.post('/logout', requireAuth, (_req, res) => {
    return res.json({ ok: true });
  });

  return router;
};
