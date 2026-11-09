import { Injectable } from '@nestjs/common';
import { Prisma, User as UserRow } from '@prisma/client';
import { DomainError } from '../../../common/errors/domain-error';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { IdentityRepository, NewCompanyWithAdmin, NewUser } from '../domain/identity.repository';
import { User } from '../domain/user.entity';

/**
 * ADAPTER: hiện thực port IdentityRepository bằng Prisma.
 * Mọi chi tiết Prisma (row, Decimal, mã lỗi P2002) dừng lại ở file này, không lọt vào domain.
 */
@Injectable()
export class PrismaIdentityRepository extends IdentityRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async findByEmail(email: string): Promise<User | null> {
    const row = await this.prisma.user.findUnique({ where: { email } });
    return row ? toDomain(row) : null;
  }

  async findById(id: string): Promise<User | null> {
    const row = await this.prisma.user.findUnique({ where: { id } });
    return row ? toDomain(row) : null;
  }

  async emailExists(email: string): Promise<boolean> {
    return (await this.prisma.user.count({ where: { email } })) > 0;
  }

  async taxCodeExists(taxCode: string): Promise<boolean> {
    return (await this.prisma.company.count({ where: { taxCode } })) > 0;
  }

  async createCompanyWithAdmin(
    input: NewCompanyWithAdmin,
  ): Promise<{ companyId: string; admin: User }> {
    try {
      // Nested create: Prisma tự bọc company + user trong MỘT transaction.
      const company = await this.prisma.company.create({
        data: {
          name: input.company.name,
          taxCode: input.company.taxCode,
          users: {
            create: {
              email: input.admin.email,
              passwordHash: input.admin.passwordHash,
              fullName: input.admin.fullName,
              role: 'ADMIN',
            },
          },
        },
        include: { users: true },
      });
      return { companyId: company.id, admin: toDomain(company.users[0]) };
    } catch (err) {
      throw mapUniqueViolation(err);
    }
  }

  async createUser(input: NewUser): Promise<User> {
    try {
      const row = await this.prisma.user.create({
        data: {
          companyId: input.companyId,
          email: input.email,
          passwordHash: input.passwordHash,
          fullName: input.fullName,
          role: input.role,
          approvalLimit: new Prisma.Decimal(input.approvalLimit),
        },
      });
      return toDomain(row);
    } catch (err) {
      throw mapUniqueViolation(err);
    }
  }
}

function toDomain(row: UserRow): User {
  return User.restore({
    id: row.id,
    companyId: row.companyId,
    email: row.email,
    passwordHash: row.passwordHash,
    fullName: row.fullName,
    role: row.role,
    // Decimal → number: an toàn cho hạn mức ở mức Decimal(14,2) (< 2^53).
    // Khi tính tiền nhiều bước (GĐ1b/3) sẽ cân nhắc giữ Decimal hoặc lưu số nguyên (đồng).
    approvalLimit: row.approvalLimit.toNumber(),
    isActive: row.isActive,
    createdAt: row.createdAt,
  });
}

/** Race condition: 2 request cùng email lọt qua emailExists() → DB unique constraint chặn (P2002). */
function mapUniqueViolation(err: unknown): unknown {
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
    const target = String(err.meta?.target ?? '');
    if (target.includes('email')) return new DomainError('EMAIL_TAKEN', 'Email đã được sử dụng');
    if (target.includes('tax_code') || target.includes('taxCode')) {
      return new DomainError('TAX_CODE_TAKEN', 'Mã số thuế đã được đăng ký');
    }
  }
  return err;
}
