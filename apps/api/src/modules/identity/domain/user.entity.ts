import type { Role } from '../../../common/auth/role';

/**
 * DOMAIN: thuần TypeScript — KHÔNG import NestJS, Prisma, hay thư viện hạ tầng nào.
 * Nhờ vậy domain test được không cần DB và sống sót qua việc đổi framework/ORM.
 */
export interface UserProps {
  id: string;
  companyId: string;
  email: string;
  passwordHash: string;
  fullName: string;
  role: Role;
  approvalLimit: number;
  isActive: boolean;
  createdAt: Date;
}

/** Dữ liệu an toàn để trả ra ngoài: KHÔNG có passwordHash. */
export type PublicUserProps = Omit<UserProps, 'passwordHash'>;

export class User {
  private constructor(private readonly props: UserProps) {}

  /** Dựng lại entity từ dữ liệu đã lưu (repository gọi). */
  static restore(props: UserProps): User {
    return new User({ ...props });
  }

  get id(): string {
    return this.props.id;
  }
  get companyId(): string {
    return this.props.companyId;
  }
  get email(): string {
    return this.props.email;
  }
  get passwordHash(): string {
    return this.props.passwordHash;
  }
  get fullName(): string {
    return this.props.fullName;
  }
  get role(): Role {
    return this.props.role;
  }
  get approvalLimit(): number {
    return this.props.approvalLimit;
  }
  get isActive(): boolean {
    return this.props.isActive;
  }
  get createdAt(): Date {
    return this.props.createdAt;
  }

  toPublic(): PublicUserProps {
    // Tách passwordHash ra, phần còn lại là public.
    const { passwordHash: _omit, ...rest } = this.props;
    return { ...rest };
  }
}
