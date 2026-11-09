import { Injectable } from '@nestjs/common';
import type { AuthUser } from '../../../../common/auth/auth.types';
import { DomainError } from '../../../../common/errors/domain-error';
import { TokenService } from '../ports';

export interface LogoutInput {
  refreshToken: string;
  /** true = đăng xuất khỏi MỌI thiết bị */
  allDevices?: boolean;
}

/**
 * Lưu ý: logout chỉ thu hồi REFRESH token. Access token (JWT stateless) vẫn dùng được tới khi
 * hết hạn (tối đa JWT_ACCESS_TTL = 15 phút) → đó là lý do access token phải sống ngắn.
 * Cần thu hồi tức thì? → denylist theo jti trong Redis (sẽ bàn ở giai đoạn sau).
 */
@Injectable()
export class LogoutUseCase {
  constructor(private readonly tokens: TokenService) {}

  async execute(actor: AuthUser, input: LogoutInput): Promise<void> {
    if (input.allDevices) {
      await this.tokens.revokeAll(actor.id);
      return;
    }
    try {
      await this.tokens.consumeRefreshToken(input.refreshToken);
    } catch (err) {
      // Idempotent: token đã hết hạn/đã thu hồi thì coi như đã logout.
      if (err instanceof DomainError && err.code === 'INVALID_REFRESH_TOKEN') return;
      throw err;
    }
  }
}
