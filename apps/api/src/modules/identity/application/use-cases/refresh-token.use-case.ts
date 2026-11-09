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
    throw new Error('TODO Bài 4b: RefreshTokenUseCase.execute');
  }
}
