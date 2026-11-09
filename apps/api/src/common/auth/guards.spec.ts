import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { Env } from '../../config/env';
import type { AuthUser } from './auth.types';
import { Public, Roles } from './decorators';
import { JwtAuthGuard, RolesGuard } from './guards';

/** Bài 2 – tiêu chí chấm. Chạy: pnpm test guards */

const env = {
  JWT_ACCESS_SECRET: 'access-secret-access-secret-access-secret-123',
  JWT_REFRESH_SECRET: 'refresh-secret-refresh-secret-refresh-secret-456',
} as Env;

class FakeController {
  @Public()
  publicRoute() {}

  privateRoute() {}

  @Roles('ADMIN')
  adminOnly() {}

  @Roles('ADMIN', 'APPROVER')
  adminOrApprover() {}
}

type FakeRequest = { headers: Record<string, string | undefined>; user?: AuthUser };

function contextFor(handler: () => void, req: FakeRequest): ExecutionContext {
  return {
    getHandler: () => handler,
    getClass: () => FakeController,
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ExecutionContext;
}

describe('Bài 2a – JwtAuthGuard', () => {
  const jwt = new JwtService({});
  const guard = new JwtAuthGuard(new Reflector(), jwt, env);
  const payload = { sub: 'user-1', cid: 'company-1', role: 'BUYER' as const };

  it('cho qua route @Public() mà không cần token', async () => {
    const req: FakeRequest = { headers: {} };
    await expect(
      guard.canActivate(contextFor(FakeController.prototype.publicRoute, req)),
    ).resolves.toBe(true);
  });

  it('thiếu header Authorization → 401', async () => {
    const req: FakeRequest = { headers: {} };
    await expect(
      guard.canActivate(contextFor(FakeController.prototype.privateRoute, req)),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('header không phải dạng "Bearer <token>" → 401', async () => {
    const token = await jwt.signAsync(payload, { secret: env.JWT_ACCESS_SECRET });
    const req: FakeRequest = { headers: { authorization: `Token ${token}` } };
    await expect(
      guard.canActivate(contextFor(FakeController.prototype.privateRoute, req)),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('token rác → 401', async () => {
    const req: FakeRequest = { headers: { authorization: 'Bearer not-a-jwt' } };
    await expect(
      guard.canActivate(contextFor(FakeController.prototype.privateRoute, req)),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('token ký bằng REFRESH secret không được dùng làm access token → 401', async () => {
    const token = await jwt.signAsync(payload, { secret: env.JWT_REFRESH_SECRET });
    const req: FakeRequest = { headers: { authorization: `Bearer ${token}` } };
    await expect(
      guard.canActivate(contextFor(FakeController.prototype.privateRoute, req)),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('token hết hạn → 401', async () => {
    const expired = await jwt.signAsync(
      { ...payload, exp: Math.floor(Date.now() / 1000) - 60 },
      { secret: env.JWT_ACCESS_SECRET },
    );
    const req: FakeRequest = { headers: { authorization: `Bearer ${expired}` } };
    await expect(
      guard.canActivate(contextFor(FakeController.prototype.privateRoute, req)),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('token hợp lệ → true và gắn req.user = { id, companyId, role }', async () => {
    const token = await jwt.signAsync(payload, { secret: env.JWT_ACCESS_SECRET, expiresIn: 60 });
    const req: FakeRequest = { headers: { authorization: `Bearer ${token}` } };
    await expect(
      guard.canActivate(contextFor(FakeController.prototype.privateRoute, req)),
    ).resolves.toBe(true);
    expect(req.user).toEqual({ id: 'user-1', companyId: 'company-1', role: 'BUYER' });
  });
});

describe('Bài 2b – RolesGuard', () => {
  const guard = new RolesGuard(new Reflector());
  const user = (role: AuthUser['role']): AuthUser => ({ id: 'u', companyId: 'c', role });

  it('route không khai báo @Roles → cho qua', () => {
    const req: FakeRequest = { headers: {}, user: user('BUYER') };
    expect(guard.canActivate(contextFor(FakeController.prototype.privateRoute, req))).toBe(true);
  });

  it('đúng role → cho qua', () => {
    const req: FakeRequest = { headers: {}, user: user('ADMIN') };
    expect(guard.canActivate(contextFor(FakeController.prototype.adminOnly, req))).toBe(true);
  });

  it('một trong nhiều role được phép → cho qua', () => {
    const req: FakeRequest = { headers: {}, user: user('APPROVER') };
    expect(guard.canActivate(contextFor(FakeController.prototype.adminOrApprover, req))).toBe(true);
  });

  it('sai role → 403', () => {
    const req: FakeRequest = { headers: {}, user: user('BUYER') };
    expect(() => guard.canActivate(contextFor(FakeController.prototype.adminOnly, req))).toThrow(
      ForbiddenException,
    );
  });

  it('route yêu cầu role nhưng không có req.user → 403', () => {
    const req: FakeRequest = { headers: {} };
    expect(() => guard.canActivate(contextFor(FakeController.prototype.adminOnly, req))).toThrow(
      ForbiddenException,
    );
  });
});
