import { Injectable } from '@nestjs/common';
import type { AuthUser } from '../../../../common/auth/auth.types';
import type { Role } from '../../../../common/auth/role';
import { DomainError } from '../../../../common/errors/domain-error';
import { normalizeEmail } from '../../domain/email';
import { IdentityRepository } from '../../domain/identity.repository';
import { PasswordHasher, PublicUser } from '../ports';

export interface CreateUserInput {
  email: string;
  password: string;
  fullName: string;
  role: Role;
  approvalLimit?: number;
}

/**
 * ============================================================
 *  BÀI 5 – CreateUserUseCase (Multi-tenant)
 *  Test: pnpm test create-user
 * ============================================================
 * ADMIN của một công ty tạo thêm user (BUYER/APPROVER/ADMIN) cho CHÍNH công ty mình.
 *
 * Các bước gợi ý:
 *  1. Chuẩn hóa email; email đã tồn tại → DomainError('EMAIL_TAKEN', ...).
 *  2. Hash mật khẩu.
 *  3. this.repo.createUser({ companyId: ???, ... , approvalLimit: input.approvalLimit ?? 0 })
 *     → companyId LUÔN lấy từ actor (người gọi, đã xác thực qua token).
 *       Kể cả khi `input` có lẫn field companyId thì cũng phải BỎ QUA.
 *  4. Trả user.toPublic().
 *
 * ❓ ValidationPipe (whitelist + forbidNonWhitelisted) đã chặn field lạ như companyId ở HTTP rồi,
 *    vì sao use case vẫn phải tự lấy companyId từ actor? (Gợi ý: use case còn được gọi từ đâu
 *    khác ngoài HTTP controller ở các giai đoạn sau?)
 */
@Injectable()
export class CreateUserUseCase {
  constructor(
    private readonly repo: IdentityRepository,
    private readonly hasher: PasswordHasher,
  ) {}

  async execute(actor: AuthUser, input: CreateUserInput): Promise<PublicUser> {
    // 1. Chuẩn hóa email + kiểm tra trùng.
    const email = normalizeEmail(input.email);
    if (await this.repo.emailExists(email)) {
      throw new DomainError('EMAIL_TAKEN', 'Email đã được sử dụng');
    }

    // 2. Hash mật khẩu.
    const passwordHash = await this.hasher.hash(input.password);

    // 3. Liệt kê từng field (không spread input) → companyId lạ trong input bị bỏ qua.
    //    companyId LUÔN lấy từ actor đã xác thực.
    const user = await this.repo.createUser({
      companyId: actor.companyId,
      email,
      passwordHash,
      fullName: input.fullName,
      role: input.role,
      approvalLimit: input.approvalLimit ?? 0,
    });

    // 4. Không bao giờ trả passwordHash ra ngoài.
    return user.toPublic();
  }
}
