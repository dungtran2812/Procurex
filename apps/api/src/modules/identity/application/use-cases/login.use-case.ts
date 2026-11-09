import { Injectable } from '@nestjs/common';
import { DomainError } from '../../../../common/errors/domain-error';
import { normalizeEmail } from '../../domain/email';
import { IdentityRepository } from '../../domain/identity.repository';
import { AuthResult, PasswordHasher, TokenService } from '../ports';

export interface LoginInput {
  email: string;
  password: string;
}

const INVALID_CREDENTIALS_MESSAGE = 'Email hoặc mật khẩu không đúng';

/**
 * ============================================================
 *  BÀI 3 – LoginUseCase
 *  Test: pnpm test login
 * ============================================================
 * Các bước gợi ý (nhìn RegisterCompanyUseCase để theo khuôn):
 *  1. Chuẩn hóa email bằng normalizeEmail().
 *  2. Tìm user theo email.
 *  3. Không có user → DomainError('INVALID_CREDENTIALS', ...).
 *  4. So mật khẩu bằng this.hasher.verify(user.passwordHash, input.password).
 *     Sai → DomainError('INVALID_CREDENTIALS', ...) với CÙNG message như bước 3.
 *  5. user.isActive === false → DomainError('USER_INACTIVE', ...).
 *  6. Cấp token: this.tokens.issue(user); trả { user: user.toPublic(), tokens }.
 *
 * ❓ Vì sao sai email và sai mật khẩu phải trả CÙNG một lỗi, cùng một message?
 * ❓ Vì sao kiểm tra isActive SAU khi đã kiểm tra mật khẩu, chứ không phải trước?
 * ⭐ Nâng cao (không bắt buộc): khi không tìm thấy user, request trả về nhanh hơn hẳn vì
 *    bỏ qua bước argon2 (~50-100ms). Kẻ tấn công đo thời gian là biết email nào tồn tại.
 *    Bạn sẽ khắc phục thế nào?
 */
@Injectable()
export class LoginUseCase {
  constructor(
    private readonly repo: IdentityRepository,
    private readonly hasher: PasswordHasher,
    private readonly tokens: TokenService,
  ) {}

  async execute(input: LoginInput): Promise<AuthResult> {
    const email = normalizeEmail(input.email);
    const user = await this.repo.findByEmail(email);
    if (!user) {
      throw new DomainError('INVALID_CREDENTIALS', INVALID_CREDENTIALS_MESSAGE);
    }

    const ok = await this.hasher.verify(user.passwordHash, input.password);
    if (!ok) {
      throw new DomainError('INVALID_CREDENTIALS', INVALID_CREDENTIALS_MESSAGE);
    }

    if (!user.isActive) {
      throw new DomainError('USER_INACTIVE', 'Tài khoản đã bị khóa');
    }

    const tokens = await this.tokens.issue(user);
    return { user: user.toPublic(), tokens };
  }
}
