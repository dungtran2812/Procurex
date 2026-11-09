import type { AuthUser } from '../../../../common/auth/auth.types';
import { FakePasswordHasher, InMemoryIdentityRepository } from '../../testing/fakes';
import { CreateUserInput, CreateUserUseCase } from './create-user.use-case';

/** Bài 5 – tiêu chí chấm. Chạy: pnpm test create-user */
describe('Bài 5 – CreateUserUseCase', () => {
  let repo: InMemoryIdentityRepository;
  let useCase: CreateUserUseCase;
  const admin: AuthUser = { id: 'admin-1', companyId: 'company-A', role: 'ADMIN' };
  const input: CreateUserInput = {
    email: ' New.Buyer@ACME.vn ',
    password: 'Secret123!',
    fullName: 'Le Van C',
    role: 'BUYER',
  };

  beforeEach(() => {
    repo = new InMemoryIdentityRepository();
    useCase = new CreateUserUseCase(repo, new FakePasswordHasher());
  });

  it('tạo user trong công ty của actor, email chuẩn hóa, approvalLimit mặc định 0', async () => {
    const user = await useCase.execute(admin, input);

    expect(user).toMatchObject({
      companyId: 'company-A',
      email: 'new.buyer@acme.vn',
      fullName: 'Le Van C',
      role: 'BUYER',
      approvalLimit: 0,
      isActive: true,
    });
  });

  it('BỎ QUA companyId lẻn vào từ input (chống tạo user vào tenant khác)', async () => {
    const malicious = { ...input, companyId: 'company-B' } as CreateUserInput;
    const user = await useCase.execute(admin, malicious);

    expect(user.companyId).toBe('company-A');
    expect(repo.users.get(user.id)?.companyId).toBe('company-A');
  });

  it('giữ approvalLimit nếu được truyền', async () => {
    const user = await useCase.execute(admin, {
      ...input,
      role: 'APPROVER',
      approvalLimit: 50_000_000,
    });
    expect(user.approvalLimit).toBe(50_000_000);
  });

  it('hash mật khẩu, không lưu mật khẩu thô, không trả passwordHash', async () => {
    const user = await useCase.execute(admin, input);

    expect(user).not.toHaveProperty('passwordHash');
    const stored = repo.users.get(user.id)!;
    expect(stored.passwordHash).not.toBe('Secret123!');
    expect(stored.passwordHash).toBe('hashed:Secret123!');
  });

  it('email trùng (khác hoa thường) → EMAIL_TAKEN', async () => {
    repo.seedUser({ email: 'new.buyer@acme.vn' });
    await expect(useCase.execute(admin, input)).rejects.toMatchObject({ code: 'EMAIL_TAKEN' });
  });
});
