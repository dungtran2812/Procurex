import { Inject, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Redis } from 'ioredis';
import { randomUUID } from 'node:crypto';
import type { AccessPayload } from '../../../common/auth/auth.types';
import { DomainError } from '../../../common/errors/domain-error';
import { ENV, Env } from '../../../config/env';
import { REDIS } from '../../../infrastructure/redis/redis.module';
import { AuthTokens, TokenService, TokenSubject } from '../application/ports';

/** Payload trong refresh token: chỉ cần biết "của ai" và "phiên nào". */
export interface RefreshPayload {
  sub: string; // userId
  jti: string; // JWT ID = id phiên
  typ: 'refresh';
}

/** Key Redis của MỘT phiên refresh. Tồn tại = phiên còn hiệu lực. */
export const sessionKey = (userId: string, jti: string) => `rt:${userId}:${jti}`;
/** Redis SET chứa mọi jti đang hoạt động của user (để revokeAll). */
export const userSessionsKey = (userId: string) => `rt:user:${userId}`;

/**
 * Refresh token có trạng thái (stateful) lưu trong Redis:
 *   rt:{userId}:{jti}  = "1"  (TTL = JWT_REFRESH_TTL)
 *   rt:user:{userId}   = SET { jti1, jti2, ... }  (mỗi thiết bị đăng nhập = 1 jti)
 */
@Injectable()
export class JwtTokenService extends TokenService {
  constructor(
    private readonly jwt: JwtService,
    @Inject(REDIS) private readonly redis: Redis,
    @Inject(ENV) private readonly env: Env,
  ) {
    super();
  }

  /** ✅ Đã viết sẵn — đọc để hiểu cấu trúc key trước khi làm Bài 4a. */
  async issue(user: TokenSubject): Promise<AuthTokens> {
    const jti = randomUUID();
    const ttl = this.env.JWT_REFRESH_TTL;

    const accessPayload: AccessPayload = { sub: user.id, cid: user.companyId, role: user.role };
    const refreshPayload: RefreshPayload = { sub: user.id, jti, typ: 'refresh' };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwt.signAsync(accessPayload, {
        secret: this.env.JWT_ACCESS_SECRET,
        expiresIn: this.env.JWT_ACCESS_TTL,
      }),
      this.jwt.signAsync(refreshPayload, {
        secret: this.env.JWT_REFRESH_SECRET,
        expiresIn: ttl,
      }),
    ]);

    // MULTI: các lệnh được gửi và thực thi liền một khối, không lệnh nào khác chen vào giữa.
    await this.redis
      .multi()
      .set(sessionKey(user.id, jti), '1', 'EX', ttl)
      .sadd(userSessionsKey(user.id), jti)
      .expire(userSessionsKey(user.id), ttl)
      .exec();

    return { accessToken, refreshToken, tokenType: 'Bearer', expiresIn: this.env.JWT_ACCESS_TTL };
  }

  /**
   * ============================================================
   *  BÀI 4a – consumeRefreshToken (Refresh token rotation + reuse detection)
   *  Test: pnpm test jwt-token
   * ============================================================
   * Các bước gợi ý:
   *  1. Verify: await this.jwt.verifyAsync<RefreshPayload>(refreshToken, { secret: this.env.JWT_REFRESH_SECRET })
   *     Lỗi (sai chữ ký, hết hạn, rác) hoặc payload.typ !== 'refresh'
   *       → throw new DomainError('INVALID_REFRESH_TOKEN', ...).
   *  2. XÓA key phiên: const deleted = await this.redis.del(sessionKey(sub, jti))
   *     - deleted === 1 → phiên hợp lệ, vừa bị tiêu thụ. Gỡ jti khỏi SET userSessionsKey (srem).
   *       Trả { userId: sub }.
   *     - deleted === 0 → token có chữ ký ĐÚNG nhưng phiên không còn → đã bị dùng rồi (REUSE)!
   *       Đây là dấu hiệu token bị đánh cắp → await this.revokeAll(sub), rồi ném INVALID_REFRESH_TOKEN.
   *
   * ❓ Vì sao dùng kết quả của DEL (số key bị xóa) thay vì GET để kiểm tra rồi mới DEL?
   *    (Gợi ý: 2 request cùng refresh 1 token đến cùng lúc.)
   * ❓ Khi phát hiện reuse, vì sao thu hồi TẤT CẢ phiên chứ không chỉ báo lỗi?
   */
  async consumeRefreshToken(refreshToken: string): Promise<{ userId: string }> {
    let payload: RefreshPayload;
    try {
      payload = await this.jwt.verifyAsync<RefreshPayload>(refreshToken, {
        secret: this.env.JWT_REFRESH_SECRET,
      });
    } catch {
      throw new DomainError('INVALID_REFRESH_TOKEN', 'Refresh token không hợp lệ hoặc đã hết hạn');
    }
    if (payload.typ !== 'refresh') {
      throw new DomainError('INVALID_REFRESH_TOKEN', 'Sai loại token');
    }

    const { sub, jti } = payload;
    // DEL là atomic: trong 2 request đồng thời, chỉ đúng 1 request nhận được 1.
    const deleted = await this.redis.del(sessionKey(sub, jti));
    if (deleted === 0) {
      // Chữ ký đúng nhưng phiên đã bị tiêu thụ → reuse → nghi bị đánh cắp.
      await this.revokeAll(sub);
      throw new DomainError('INVALID_REFRESH_TOKEN', 'Refresh token đã được sử dụng');
    }

    await this.redis.srem(userSessionsKey(sub), jti);
    return { userId: sub };
  }

  /**
   * ============================================================
   *  BÀI 4a (tiếp) – revokeAll
   * ============================================================
   *  1. jtis = await this.redis.smembers(userSessionsKey(userId))
   *  2. Xóa mọi sessionKey(userId, jti) và cả userSessionsKey(userId)
   *     (gợi ý: multi() rồi .del(...) từng key, hoặc del(...keys) một lần — chú ý mảng rỗng).
   */
  async revokeAll(userId: string): Promise<void> {
    const jtis = await this.redis.smembers(userSessionsKey(userId));
    // Luôn có ít nhất userSessionsKey nên mảng keys không bao giờ rỗng.
    const keys = [...jtis.map((jti) => sessionKey(userId, jti)), userSessionsKey(userId)];
    await this.redis.del(...keys);
  }
}
