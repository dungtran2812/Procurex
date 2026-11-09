import type { Role } from '../../../../common/auth/role';
import type { AuthTokens } from './types';

export interface TokenSubject {
  id: string;
  companyId: string;
  role: Role;
}

export abstract class TokenService {
  /** Cấp cặp access + refresh token mới (mỗi refresh token = 1 phiên, có jti riêng). */
  abstract issue(user: TokenSubject): Promise<AuthTokens>;
  /**
   * "Tiêu thụ" refresh token: hợp lệ thì xóa phiên và trả userId (dùng được ĐÚNG 1 lần).
   * Không hợp lệ / đã dùng → ném DomainError('INVALID_REFRESH_TOKEN').
   */
  abstract consumeRefreshToken(refreshToken: string): Promise<{ userId: string }>;
  /** Thu hồi mọi phiên refresh của user. */
  abstract revokeAll(userId: string): Promise<void>;
}
