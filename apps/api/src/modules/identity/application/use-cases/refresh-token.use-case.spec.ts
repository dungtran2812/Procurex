import { FakeTokenService, InMemoryIdentityRepository } from '../../testing/fakes';
import { RefreshTokenUseCase } from './refresh-token.use-case';

/** Bài 4b – tiêu chí chấm. Chạy: pnpm test refresh */
describe('Bài 4b – RefreshTokenUseCase', () => {
  let repo: InMemoryIdentityRepository;
  let tokens: FakeTokenService;
  let useCase: RefreshTokenUseCase;

  beforeEach(() => {
    repo = new InMemoryIdentityRepository();
    tokens = new FakeTokenService();
    useCase = new RefreshTokenUseCase(repo, tokens);
  });

  it('refresh hợp lệ → cặp token MỚI, token cũ không dùng lại được', async () => {
    const user = repo.seedUser({ id: 'u-1' });
    const old = await tokens.issue(user);

    const result = await useCase.execute(old.refreshToken);

    expect(result.tokens.refreshToken).not.toBe(old.refreshToken);
    expect(result.user.id).toBe('u-1');
    expect(result.user).not.toHaveProperty('passwordHash');
    await expect(useCase.execute(old.refreshToken)).rejects.toMatchObject({
      code: 'INVALID_REFRESH_TOKEN',
    });
  });

  it('token không hợp lệ → INVALID_REFRESH_TOKEN', async () => {
    await expect(useCase.execute('garbage')).rejects.toMatchObject({
      code: 'INVALID_REFRESH_TOKEN',
    });
  });

  it('user bị khóa → INVALID_REFRESH_TOKEN và thu hồi mọi phiên', async () => {
    const user = repo.seedUser({ id: 'u-1', isActive: false });
    const t1 = await tokens.issue(user);
    const t2 = await tokens.issue(user);

    await expect(useCase.execute(t1.refreshToken)).rejects.toMatchObject({
      code: 'INVALID_REFRESH_TOKEN',
    });
    expect(tokens.revokedUsers).toContain('u-1');
    expect(tokens.sessions.has(t2.refreshToken)).toBe(false);
  });

  it('user đã bị xóa → INVALID_REFRESH_TOKEN', async () => {
    const ghost = { id: 'ghost', companyId: 'c', role: 'BUYER' as const };
    const t = await tokens.issue(ghost);
    await expect(useCase.execute(t.refreshToken)).rejects.toMatchObject({
      code: 'INVALID_REFRESH_TOKEN',
    });
  });

  it('dùng role/companyId MỚI NHẤT từ DB khi cấp token', async () => {
    const user = repo.seedUser({ id: 'u-1', role: 'BUYER' });
    const t = await tokens.issue(user);
    repo.users.get('u-1')!.role = 'APPROVER'; // admin vừa nâng quyền

    await useCase.execute(t.refreshToken);

    expect(tokens.issuedFor.at(-1)).toMatchObject({ id: 'u-1', role: 'APPROVER' });
  });
});
