import { JwtService } from '@nestjs/jwt';
import type { Redis } from 'ioredis';
import type { Env } from '../../../config/env';
import { FakeRedis } from '../../../testing/fake-redis';
import { JwtTokenService, sessionKey, userSessionsKey } from './jwt-token.service';

/** Bài 4a – tiêu chí chấm. Chạy: pnpm test jwt-token */

const env = {
  JWT_ACCESS_SECRET: 'access-secret-access-secret-access-secret-123',
  JWT_REFRESH_SECRET: 'refresh-secret-refresh-secret-refresh-secret-456',
  JWT_ACCESS_TTL: 900,
  JWT_REFRESH_TTL: 604800,
} as Env;

const alice = { id: 'alice', companyId: 'c-1', role: 'BUYER' as const };
const bob = { id: 'bob', companyId: 'c-1', role: 'ADMIN' as const };

describe('JwtTokenService', () => {
  let redis: FakeRedis;
  let jwt: JwtService;
  let service: JwtTokenService;

  beforeEach(() => {
    redis = new FakeRedis();
    jwt = new JwtService({});
    service = new JwtTokenService(jwt, redis as unknown as Redis, env);
  });

  describe('issue() — đã viết sẵn (XANH)', () => {
    it('access token chứa sub/cid/role, ký bằng access secret', async () => {
      const { accessToken } = await service.issue(alice);
      const payload = await jwt.verifyAsync(accessToken, { secret: env.JWT_ACCESS_SECRET });
      expect(payload).toMatchObject({ sub: 'alice', cid: 'c-1', role: 'BUYER' });
    });

    it('lưu phiên rt:{userId}:{jti} với TTL và thêm jti vào rt:user:{userId}', async () => {
      const { refreshToken } = await service.issue(alice);
      const { jti } = await jwt.verifyAsync(refreshToken, { secret: env.JWT_REFRESH_SECRET });

      expect(await redis.get(sessionKey('alice', jti))).toBe('1');
      expect(redis.ttls.get(sessionKey('alice', jti))).toBe(env.JWT_REFRESH_TTL);
      expect(await redis.smembers(userSessionsKey('alice'))).toEqual([jti]);
    });
  });

  describe('Bài 4a – consumeRefreshToken()', () => {
    it('token hợp lệ → trả userId và xóa phiên', async () => {
      const { refreshToken } = await service.issue(alice);
      const { jti } = await jwt.verifyAsync(refreshToken, { secret: env.JWT_REFRESH_SECRET });

      await expect(service.consumeRefreshToken(refreshToken)).resolves.toEqual({ userId: 'alice' });
      expect(await redis.exists(sessionKey('alice', jti))).toBe(0);
      expect(await redis.smembers(userSessionsKey('alice'))).not.toContain(jti);
    });

    it('token rác → INVALID_REFRESH_TOKEN', async () => {
      await expect(service.consumeRefreshToken('garbage')).rejects.toMatchObject({
        code: 'INVALID_REFRESH_TOKEN',
      });
    });

    it('dùng ACCESS token làm refresh token → INVALID_REFRESH_TOKEN', async () => {
      const { accessToken } = await service.issue(alice);
      await expect(service.consumeRefreshToken(accessToken)).rejects.toMatchObject({
        code: 'INVALID_REFRESH_TOKEN',
      });
    });

    it('refresh token hết hạn → INVALID_REFRESH_TOKEN', async () => {
      const expired = await jwt.signAsync(
        { sub: 'alice', jti: 'old', typ: 'refresh', exp: Math.floor(Date.now() / 1000) - 60 },
        { secret: env.JWT_REFRESH_SECRET },
      );
      await expect(service.consumeRefreshToken(expired)).rejects.toMatchObject({
        code: 'INVALID_REFRESH_TOKEN',
      });
    });

    it('REUSE: dùng lại token đã tiêu thụ → INVALID_REFRESH_TOKEN và thu hồi MỌI phiên của user', async () => {
      const t1 = await service.issue(alice); // laptop
      const t2 = await service.issue(alice); // điện thoại

      await service.consumeRefreshToken(t1.refreshToken); // lần 1: OK
      await expect(service.consumeRefreshToken(t1.refreshToken)).rejects.toMatchObject({
        code: 'INVALID_REFRESH_TOKEN',
      }); // lần 2: reuse!

      // Phiên trên điện thoại cũng bị thu hồi
      await expect(service.consumeRefreshToken(t2.refreshToken)).rejects.toMatchObject({
        code: 'INVALID_REFRESH_TOKEN',
      });
    });
  });

  describe('Bài 4a – revokeAll()', () => {
    it('xóa mọi phiên của user, KHÔNG đụng tới user khác', async () => {
      await service.issue(alice);
      await service.issue(alice);
      const bobTokens = await service.issue(bob);

      await service.revokeAll('alice');

      const aliceKeys = [...redis.store.keys()].filter(
        (k) => k.startsWith('rt:alice:') || k === userSessionsKey('alice'),
      );
      expect(aliceKeys).toEqual([]);
      await expect(service.consumeRefreshToken(bobTokens.refreshToken)).resolves.toEqual({
        userId: 'bob',
      });
    });

    it('user chưa có phiên nào → không lỗi', async () => {
      await expect(service.revokeAll('nobody')).resolves.toBeUndefined();
    });
  });
});
