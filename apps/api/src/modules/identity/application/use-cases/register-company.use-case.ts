import { Injectable } from '@nestjs/common';
import { DomainError } from '../../../../common/errors/domain-error';
import { normalizeEmail } from '../../domain/email';
import { IdentityRepository } from '../../domain/identity.repository';
import { AuthResult, PasswordHasher, TokenService } from '../ports';

export interface RegisterCompanyInput {
  companyName: string;
  taxCode: string;
  adminEmail: string;
  adminPassword: string;
  adminFullName: string;
}

/**
 * ✅ WORKED EXAMPLE (đọc kỹ, các bài tập sẽ theo đúng khuôn này).
 *
 * Một use case = một hành động nghiệp vụ. Nó:
 *  - chỉ phụ thuộc vào PORT (IdentityRepository, PasswordHasher, TokenService) — là abstract class,
 *    không biết Prisma/argon2/Redis là gì;
 *  - ném DomainError cho lỗi nghiệp vụ (không ném HttpException);
 *  - trả về dữ liệu thuần (không trả entity có passwordHash ra ngoài).
 *
 * Ghi chú: @Injectable() là "nhượng bộ thực dụng" — application layer phụ thuộc nhẹ vào NestJS
 * để DI tự nối dây. Domain layer thì tuyệt đối không.
 */
@Injectable()
export class RegisterCompanyUseCase {
  constructor(
    private readonly repo: IdentityRepository,
    private readonly hasher: PasswordHasher,
    private readonly tokens: TokenService,
  ) {}

  async execute(input: RegisterCompanyInput): Promise<AuthResult> {
    // 1. Chuẩn hóa dữ liệu đầu vào
    const email = normalizeEmail(input.adminEmail);
    const taxCode = input.taxCode.trim();

    // 2. Kiểm tra quy tắc nghiệp vụ (unique). DB vẫn có unique constraint làm "lưới an toàn"
    //    cho race condition — adapter sẽ map lỗi P2002 về cùng DomainError.
    if (await this.repo.taxCodeExists(taxCode)) {
      throw new DomainError('TAX_CODE_TAKEN', 'Mã số thuế đã được đăng ký');
    }
    if (await this.repo.emailExists(email)) {
      throw new DomainError('EMAIL_TAKEN', 'Email đã được sử dụng');
    }

    // 3. Không bao giờ lưu mật khẩu thô
    const passwordHash = await this.hasher.hash(input.adminPassword);

    // 4. Company + Admin trong 1 transaction (adapter lo phần này)
    const { admin } = await this.repo.createCompanyWithAdmin({
      company: { name: input.companyName.trim(), taxCode },
      admin: { email, passwordHash, fullName: input.adminFullName.trim() },
    });

    // 5. Đăng ký xong thì đăng nhập luôn
    const tokens = await this.tokens.issue(admin);
    return { user: admin.toPublic(), tokens };
  }
}
