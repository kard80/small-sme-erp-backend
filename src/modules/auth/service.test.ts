import jwt from 'jsonwebtoken';
import { describe, expect, it, vi } from 'vitest';
import { login, refreshTokens, verifyAccessToken } from './service';
import { requireAuth } from './middleware';
import { UnauthorizedError } from '../../shared/errors';

const fakeRes = () => {
  const res: any = { statusCode: 0, body: undefined };
  res.status = (code: number) => {
    res.statusCode = code;
    return res;
  };
  res.json = (body: unknown) => {
    res.body = body;
    return res;
  };
  return res;
};

describe('auth service', () => {
  it('rejects bad credentials', () => {
    expect(() => login('admin', 'wrong')).toThrow(UnauthorizedError);
    expect(() => login('other', '1234')).toThrow(UnauthorizedError);
  });

  it('issues a token pair that verifies', () => {
    const pair = login('admin', '1234');
    expect(pair.tokenType).toBe('Bearer');
    expect(verifyAccessToken(pair.accessToken)).toEqual({ id: 'admin', username: 'admin' });
    expect(refreshTokens(pair.refreshToken).user.username).toBe('admin');
  });

  it('does not accept a refresh token as an access token (and vice versa)', () => {
    const pair = login('admin', '1234');
    expect(() => verifyAccessToken(pair.refreshToken)).toThrow();
    expect(() => refreshTokens(pair.accessToken)).toThrow();
  });

  it('rejects an expired token', () => {
    const expired = jwt.sign(
      { sub: 'admin', username: 'admin', tokenType: 'access' },
      process.env.JWT_ACCESS_SECRET || 'dev-access-secret-change-me',
      { expiresIn: -10 }
    );
    expect(() => verifyAccessToken(expired)).toThrow();
  });
});

describe('requireAuth middleware', () => {
  it('returns 401 without a Bearer header', () => {
    const res = fakeRes();
    const next = vi.fn();
    requireAuth({ headers: {} } as any, res, next);
    expect(res.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 401 for an invalid token', () => {
    const res = fakeRes();
    const next = vi.fn();
    requireAuth({ headers: { authorization: 'Bearer nope' } } as any, res, next);
    expect(res.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('sets authUser and calls next for a valid access token', () => {
    const req: any = { headers: { authorization: `Bearer ${login('admin', '1234').accessToken}` } };
    const next = vi.fn();
    requireAuth(req, fakeRes(), next);
    expect(next).toHaveBeenCalled();
    expect(req.authUser).toEqual({ id: 'admin', username: 'admin' });
  });
});
