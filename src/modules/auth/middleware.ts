import { NextFunction, Request, Response } from 'express';
import { AuthUser } from './types';
import { verifyAccessToken } from './service';

declare global {
  namespace Express {
    interface Request {
      authUser?: AuthUser;
    }
  }
}

export const requireAuth = (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const token = authHeader.slice('Bearer '.length).trim();
  if (!token) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  try {
    req.authUser = verifyAccessToken(token);
    next();
  } catch {
    res.status(401).json({ error: 'Unauthorized' });
  }
};
