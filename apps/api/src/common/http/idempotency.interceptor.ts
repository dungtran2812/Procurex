import {
  CallHandler,
  ConflictException,
  ExecutionContext,
  Inject,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import type { Redis } from 'ioredis';
import { Observable, from, of, switchMap, tap } from 'rxjs';
import type { AuthUser } from '../auth/auth.types';
import { REDIS } from '../../infrastructure/redis/redis.module';

const TTL_SECONDS = 24 * 3600;
const LOCK_SECONDS = 30;

/**
 * Idempotency cho POST: client gửi header `Idempotency-Key` (vd UUID sinh khi mở form).
 *  - Lần đầu: khoá key (SET NX) → chạy handler → lưu response 24h.
 *  - Gửi lại cùng key (double-click, retry do mạng): trả lại ĐÚNG response cũ, không tạo bản ghi mới.
 *  - Đang xử lý mà gửi lại: 409.
 * Không có header → chạy bình thường (tuỳ chọn, để không phá client cũ).
 * Key gắn với user + method + URL để key của người này không đụng người khác.
 */
@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = ctx.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    const res = ctx.switchToHttp().getResponse<Response>();
    const key = req.header('idempotency-key');
    if (req.method !== 'POST' || !key || !req.user) return next.handle();
    if (!/^[\w-]{8,100}$/.test(key)) throw new ConflictException('Idempotency-Key không hợp lệ');

    const base = `idem:${req.user.id}:${req.method}:${req.originalUrl}:${key}`;
    return from(this.redis.get(base)).pipe(
      switchMap((saved) => {
        if (saved) {
          const { status, body } = JSON.parse(saved) as { status: number; body: unknown };
          res.status(status).setHeader('Idempotent-Replay', 'true');
          return of(body);
        }
        return from(this.redis.set(`${base}:lock`, '1', 'EX', LOCK_SECONDS, 'NX')).pipe(
          switchMap((ok) => {
            if (!ok) throw new ConflictException('Request cùng Idempotency-Key đang được xử lý');
            return next.handle().pipe(
              tap({
                next: (body) =>
                  void this.redis.set(
                    base,
                    JSON.stringify({ status: res.statusCode, body }),
                    'EX',
                    TTL_SECONDS,
                  ),
                // Lỗi → nhả khoá để client sửa rồi gửi lại cùng key được.
                error: () => void this.redis.del(`${base}:lock`),
              }),
            );
          }),
        );
      }),
    );
  }
}
