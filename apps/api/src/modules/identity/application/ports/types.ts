import type { PublicUserProps } from '../../domain/user.entity';

export type PublicUser = PublicUserProps;

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  tokenType: 'Bearer';
  /** Số giây access token còn hiệu lực. */
  expiresIn: number;
}

export interface AuthResult {
  user: PublicUser;
  tokens: AuthTokens;
}
