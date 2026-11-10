import { Injectable } from '@nestjs/common';
import { DomainError } from '../../../../common/errors/domain-error';
import { IdentityRepository } from '../../domain/identity.repository';
import { AuthResult, TokenService } from '../ports';

/**
 * ============================================================
 *  BÀI 4b – RefreshTokenUseCase (làm SAU Bài 4a trong JwtTokenService)
 *  Test: pnpm test refresh
 * ============================================================
 * Refresh token ROTATION: mỗi lần refresh, token cũ bị tiêu thụ và cấp cặp token MỚI.
 *
 * Các bước gợi ý:
 *  1. const { userId } = await this.tokens.consumeRefreshToken(refreshToken)
 *     (token sai/đã dùng → hàm này đã tự ném INVALID_REFRESH_TOKEN, cứ để lỗi đi lên).
 *  2. Tải user theo userId.
 *  3. User không còn tồn tại hoặc bị khóa (isActive=false) → revokeAll(userId) rồi ném
 *     DomainError('INVALID_REFRESH_TOKEN', ...).
 *  4. Cấp token mới, trả { user: user.toPublic(), tokens }.
 *
 * ❓ Vì sao phải tải lại user từ DB thay vì tin role/companyId trong refresh token?
 */
@Injectable()
export class RefreshTokenUseCase {
  constructor(
    private readonly repo: IdentityRepository,
    private readonly tokens: TokenService,
  ) {}

  async execute(refreshToken: string): Promise<AuthResult> {
    // 1. Tiêu thụ token cũ (sai / đã dùng → tự ném INVALID_REFRESH_TOKEN).
    const { userId } = await this.tokens.consumeRefreshToken(refreshToken);

    // 2. Tải lại user từ DB: role/trạng thái có thể đã đổi kể từ lúc cấp token.
    const user = await this.repo.findById(userId);

    // 3. User bị xóa hoặc bị khóa → cắt mọi phiên còn lại.
    if (!user || !user.isActive) {
      await this.tokens.revokeAll(userId);
      throw new DomainError('INVALID_REFRESH_TOKEN', 'Tài khoản không còn hiệu lực');
    }

    // 4. Rotation: cấp cặp token mới.
    const tokens = await this.tokens.issue(user);
    return { user: user.toPublic(), tokens };
  }
}
