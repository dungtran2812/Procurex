import {
  FakePasswordHasher,
  FakeTokenService,
  InMemoryIdentityRepository,
} from '../../testing/fakes';
import { LoginUseCase } from './login.use-case';

/** Bài 3 – tiêu chí chấm. Chạy: pnpm test login */
describe('Bài 3 – LoginUseCase', () => {
  let repo: InMemoryIdentityRepository;
  let tokens: FakeTokenService;
  let useCase: LoginUseCase;

  beforeEach(() => {
    repo = new InMemoryIdentityRepository();
    tokens = new FakeTokenService();
    useCase = new LoginUseCase(repo, new FakePasswordHasher(), tokens);
    repo.seedUser({ id: 'u-1', email: 'buyer@acme.vn', passwordHash: 'hashed:Secret123!' });
  });

  it('đăng nhập đúng → trả user công khai + tokens (email được chuẩn hóa)', async () => {
    const result = await useCase.execute({ email: '  BUYER@Acme.VN ', password: 'Secret123!' });

    expect(result.user.id).toBe('u-1');
    expect(result.user.email).toBe('buyer@acme.vn');
    expect(result.tokens.accessToken).toBeDefined();
    expect(tokens.issuedFor).toEqual([
      expect.objectContaining({ id: 'u-1', companyId: 'company-1', role: 'BUYER' }),
    ]);
  });

  it('không trả passwordHash', async () => {
    const result = await useCase.execute({ email: 'buyer@acme.vn', password: 'Secret123!' });
    expect(result.user).not.toHaveProperty('passwordHash');
  });

  it('sai email → INVALID_CREDENTIALS', async () => {
    await expect(
      useCase.execute({ email: 'nobody@acme.vn', password: 'Secret123!' }),
    ).rejects.toMatchObject({
      code: 'INVALID_CREDENTIALS',
    });
  });

  it('sai mật khẩu → INVALID_CREDENTIALS', async () => {
    await expect(
      useCase.execute({ email: 'buyer@acme.vn', password: 'wrong' }),
    ).rejects.toMatchObject({
      code: 'INVALID_CREDENTIALS',
    });
  });

  it('sai email và sai mật khẩu trả về CÙNG message (không lộ email nào tồn tại)', async () => {
    const e1 = await useCase
      .execute({ email: 'nobody@acme.vn', password: 'x' })
      .catch((e: Error) => e);
    const e2 = await useCase
      .execute({ email: 'buyer@acme.vn', password: 'x' })
      .catch((e: Error) => e);
    expect(e1).toMatchObject({ code: 'INVALID_CREDENTIALS' });
    expect(e2).toMatchObject({ code: 'INVALID_CREDENTIALS' });
    expect((e1 as Error).message).toBe((e2 as Error).message);
  });

  it('user bị khóa + đúng mật khẩu → USER_INACTIVE, không cấp token', async () => {
    repo.seedUser({
      id: 'u-2',
      email: 'locked@acme.vn',
      passwordHash: 'hashed:Secret123!',
      isActive: false,
    });
    await expect(
      useCase.execute({ email: 'locked@acme.vn', password: 'Secret123!' }),
    ).rejects.toMatchObject({
      code: 'USER_INACTIVE',
    });
    expect(tokens.issuedFor).toHaveLength(0);
  });

  it('user bị khóa + SAI mật khẩu → INVALID_CREDENTIALS (không lộ trạng thái tài khoản)', async () => {
    repo.seedUser({
      id: 'u-2',
      email: 'locked@acme.vn',
      passwordHash: 'hashed:Secret123!',
      isActive: false,
    });
    await expect(
      useCase.execute({ email: 'locked@acme.vn', password: 'wrong' }),
    ).rejects.toMatchObject({
      code: 'INVALID_CREDENTIALS',
    });
  });
});
