import jwt, { SignOptions } from 'jsonwebtoken';
import { AuthTokenPair, AuthUser } from './types';

interface AuthTokenPayload extends jwt.JwtPayload {
  sub: string;
  username: string;
  tokenType: 'access' | 'refresh';
}

const ACCESS_TOKEN_TTL = '15m';
const REFRESH_TOKEN_TTL = '1d';
const ACCESS_TOKEN_EXPIRES_IN_SECONDS = 15 * 60;
const REFRESH_TOKEN_EXPIRES_IN_SECONDS = 24 * 60 * 60;

const getAccessSecret = () => process.env.JWT_ACCESS_SECRET || 'dev-access-secret-change-me';
const getRefreshSecret = () => process.env.JWT_REFRESH_SECRET || 'dev-refresh-secret-change-me';

const temporaryUser: AuthUser = {
  id: 'admin',
  username: 'admin'
};

const signToken = (
  user: AuthUser,
  tokenType: AuthTokenPayload['tokenType'],
  secret: string,
  expiresIn: SignOptions['expiresIn']
) => {
  return jwt.sign(
    {
      sub: user.id,
      username: user.username,
      tokenType
    },
    secret,
    { expiresIn }
  );
};

const issueTokenPair = (user: AuthUser): AuthTokenPair => {
  return {
    accessToken: signToken(user, 'access', getAccessSecret(), ACCESS_TOKEN_TTL),
    refreshToken: signToken(user, 'refresh', getRefreshSecret(), REFRESH_TOKEN_TTL),
    tokenType: 'Bearer',
    expiresIn: ACCESS_TOKEN_EXPIRES_IN_SECONDS,
    refreshExpiresIn: REFRESH_TOKEN_EXPIRES_IN_SECONDS,
    user
  };
};

const toAuthUser = (payload: AuthTokenPayload): AuthUser => ({
  id: payload.sub,
  username: payload.username
});

const verifyToken = (token: string, secret: string, tokenType: AuthTokenPayload['tokenType']) => {
  const decoded = jwt.verify(token, secret);
  if (!decoded || typeof decoded === 'string') {
    throw new Error('Invalid token');
  }

  const payload = decoded as AuthTokenPayload;
  if (payload.tokenType !== tokenType || !payload.sub || !payload.username) {
    throw new Error('Invalid token');
  }

  return payload;
};

export const login = (username: string, password: string) => {
  if (username !== 'admin' || password !== '1234') {
    throw new Error('Invalid username or password');
  }

  return issueTokenPair(temporaryUser);
};

export const refreshTokens = (refreshToken: string) => {
  const payload = verifyToken(refreshToken, getRefreshSecret(), 'refresh');
  return issueTokenPair(toAuthUser(payload));
};

export const verifyAccessToken = (accessToken: string) => {
  return toAuthUser(verifyToken(accessToken, getAccessSecret(), 'access'));
};
