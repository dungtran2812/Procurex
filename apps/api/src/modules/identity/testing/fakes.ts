/**
 * Fake (in-memory) cho unit test của tầng application.
 * Đây chính là lợi ích của Ports & Adapters: test use case không cần DB/Redis.
 */
import { randomUUID } from 'node:crypto';
import { DomainError } from '../../../common/errors/domain-error';
import { IdentityRepository, NewCompanyWithAdmin, NewUser } from '../domain/identity.repository';
import { User, UserProps } from '../domain/user.entity';
import { AuthTokens, PasswordHasher, TokenService, TokenSubject } from '../application/ports';

export class InMemoryIdentityRepository extends IdentityRepository {
  readonly users = new Map<string, UserProps>();
  readonly companies = new Map<string, { id: string; name: string; taxCode: string }>();

  /** Tiện ích cho test: thêm sẵn 1 user. */
  seedUser(overrides: Partial<UserProps> = {}): User {
    const props: UserProps = {
      id: randomUUID(),
      companyId: 'company-1',
      email: 'buyer@acme.vn',
      passwordHash: 'hashed:Secret123!',
      fullName: 'Nguyen Van A',
      role: 'BUYER',
      approvalLimit: 0,
      isActive: true,
      createdAt: new Date('2026-01-01T00:00:00Z'),
      ...overrides,
    };
    this.users.set(props.id, props);
    return User.restore(props);
  }

  async findByEmail(email: string): Promise<User | null> {
    const found = [...this.users.values()].find((u) => u.email === email);
    return found ? User.restore(found) : null;
  }

  async findById(id: string): Promise<User | null> {
    const found = this.users.get(id);
    return found ? User.restore(found) : null;
  }

  async emailExists(email: string): Promise<boolean> {
    return [...this.users.values()].some((u) => u.email === email);
  }

  async taxCodeExists(taxCode: string): Promise<boolean> {
    return [...this.companies.values()].some((c) => c.taxCode === taxCode);
  }

  async createCompanyWithAdmin(
    input: NewCompanyWithAdmin,
  ): Promise<{ companyId: string; admin: User }> {
    const companyId = randomUUID();
    this.companies.set(companyId, { id: companyId, ...input.company });
    const admin = this.seedUser({
      companyId,
      email: input.admin.email,
      passwordHash: input.admin.passwordHash,
      fullName: input.admin.fullName,
      role: 'ADMIN',
      approvalLimit: 0,
      createdAt: new Date(),
    });
    return { companyId, admin };
  }

  async createUser(input: NewUser): Promise<User> {
    return this.seedUser({ ...input, isActive: true, createdAt: new Date() });
  }
}

/** Hash giả: "Secret" → "hashed:Secret". Đủ để test logic, không tốn CPU như argon2. */
export class FakePasswordHasher extends PasswordHasher {
  readonly verifyCalls: Array<{ hash: string; plain: string }> = [];

  async hash(plain: string): Promise<string> {
    return `hashed:${plain}`;
  }

  async verify(hash: string, plain: string): Promise<boolean> {
    this.verifyCalls.push({ hash, plain });
    return hash === `hashed:${plain}`;
  }
}

export class FakeTokenService extends TokenService {
  /** refreshToken → userId của các phiên còn hiệu lực */
  readonly sessions = new Map<string, string>();
  readonly issuedFor: TokenSubject[] = [];
  readonly revokedUsers: string[] = [];
  private counter = 0;

  async issue(user: TokenSubject): Promise<AuthTokens> {
    this.counter += 1;
    // Không spread entity (getter không phải own property) → chép tường minh.
    this.issuedFor.push({ id: user.id, companyId: user.companyId, role: user.role });
    const refreshToken = `refresh-${user.id}-${this.counter}`;
    this.sessions.set(refreshToken, user.id);
    return {
      accessToken: `access-${user.id}-${this.counter}`,
      refreshToken,
      tokenType: 'Bearer',
      expiresIn: 900,
    };
  }

  async consumeRefreshToken(refreshToken: string): Promise<{ userId: string }> {
    const userId = this.sessions.get(refreshToken);
    if (!userId) {
      throw new DomainError('INVALID_REFRESH_TOKEN', 'Refresh token không hợp lệ');
    }
    this.sessions.delete(refreshToken);
    return { userId };
  }

  async revokeAll(userId: string): Promise<void> {
    this.revokedUsers.push(userId);
    for (const [token, owner] of this.sessions) {
      if (owner === userId) this.sessions.delete(token);
    }
  }
}
