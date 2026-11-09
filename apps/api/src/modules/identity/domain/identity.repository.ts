import type { Role } from '../../../common/auth/role';
import type { User } from './user.entity';

export interface NewCompanyWithAdmin {
  company: { name: string; taxCode: string };
  admin: { email: string; passwordHash: string; fullName: string };
}

export interface NewUser {
  companyId: string;
  email: string;
  passwordHash: string;
  fullName: string;
  role: Role;
  approvalLimit: number;
}

/**
 * PORT (cổng ra) do domain/application ĐỊNH NGHĨA, infrastructure HIỆN THỰC.
 *
 * Dùng `abstract class` thay vì `interface` vì interface bị xóa khi biên dịch sang JS,
 * nên NestJS không có gì để làm DI token lúc runtime. Abstract class thì còn tồn tại.
 */
export abstract class IdentityRepository {
  abstract findByEmail(email: string): Promise<User | null>;
  abstract findById(id: string): Promise<User | null>;
  abstract emailExists(email: string): Promise<boolean>;
  abstract taxCodeExists(taxCode: string): Promise<boolean>;
  /** Tạo company + user ADMIN đầu tiên trong CÙNG một transaction. */
  abstract createCompanyWithAdmin(
    input: NewCompanyWithAdmin,
  ): Promise<{ companyId: string; admin: User }>;
  abstract createUser(input: NewUser): Promise<User>;
}
