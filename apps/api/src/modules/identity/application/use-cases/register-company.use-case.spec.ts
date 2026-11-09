import {
  FakePasswordHasher,
  FakeTokenService,
  InMemoryIdentityRepository,
} from '../../testing/fakes';
import { RegisterCompanyUseCase } from './register-company.use-case';

/** Test mẫu (đang XANH) — xem cách dựng use case với fake để viết các bài sau. */
describe('RegisterCompanyUseCase (worked example)', () => {
  let repo: InMemoryIdentityRepository;
  let tokens: FakeTokenService;
  let useCase: RegisterCompanyUseCase;

  const input = {
    companyName: '  Công ty TNHH Cơ Khí ACME ',
    taxCode: '0312345678',
    adminEmail: '  Admin@ACME.vn ',
    adminPassword: 'Secret123!',
    adminFullName: 'Tran Thi B',
  };

  beforeEach(() => {
    repo = new InMemoryIdentityRepository();
    tokens = new FakeTokenService();
    useCase = new RegisterCompanyUseCase(repo, new FakePasswordHasher(), tokens);
  });

  it('tạo company + admin, chuẩn hóa email, trả tokens', async () => {
    const result = await useCase.execute(input);

    expect(result.user.email).toBe('admin@acme.vn');
    expect(result.user.role).toBe('ADMIN');
    expect(result.tokens.accessToken).toBeDefined();
    expect(tokens.issuedFor[0]).toMatchObject({ id: result.user.id, role: 'ADMIN' });
    expect([...repo.companies.values()][0]).toMatchObject({
      name: 'Công ty TNHH Cơ Khí ACME',
      taxCode: '0312345678',
    });
  });

  it('không bao giờ trả passwordHash và không lưu mật khẩu thô', async () => {
    const result = await useCase.execute(input);

    expect(result.user).not.toHaveProperty('passwordHash');
    expect(repo.users.get(result.user.id)?.passwordHash).toBe('hashed:Secret123!');
  });

  it('mã số thuế trùng → TAX_CODE_TAKEN', async () => {
    await useCase.execute(input);
    await expect(useCase.execute({ ...input, adminEmail: 'other@acme.vn' })).rejects.toMatchObject({
      code: 'TAX_CODE_TAKEN',
    });
  });

  it('email trùng (không phân biệt hoa thường) → EMAIL_TAKEN', async () => {
    await useCase.execute(input);
    await expect(
      useCase.execute({ ...input, taxCode: '0399999999', adminEmail: 'ADMIN@acme.VN' }),
    ).rejects.toMatchObject({
      code: 'EMAIL_TAKEN',
    });
  });
});
