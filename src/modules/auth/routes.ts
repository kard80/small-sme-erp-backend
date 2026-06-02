import { Router } from 'express';
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

    return res.json(login(input.data.username, input.data.password));
  });

  router.post('/refresh', (req, res) => {
    const input = refreshSchema.safeParse(req.body);
    if (!input.success) {
      return res.status(400).json({ error: input.error.flatten() });
    }

    return res.json(refreshTokens(input.data.refreshToken));
  });

  router.get('/me', requireAuth, (req, res) => {
    return res.json({ user: req.authUser });
  });

  router.post('/logout', requireAuth, (_req, res) => {
    return res.json({ ok: true });
  });

  return router;
};
