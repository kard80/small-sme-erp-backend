export interface AuthUser {
  id: string;
  username: string;
}

export interface AuthTokenPair {
  accessToken: string;
  refreshToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
  refreshExpiresIn: number;
  user: AuthUser;
}
