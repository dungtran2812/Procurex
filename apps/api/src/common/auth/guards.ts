import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { ENV, Env } from '../../config/env';
import type { AccessPayload, AuthUser } from './auth.types';
import { IS_PUBLIC_KEY, ROLES_KEY } from './decorators';
import type { Role } from './role';

/**
 * ============================================================
 *  BÀI 2a – JwtAuthGuard (Authentication: "bạn là ai?")
 *  Test: pnpm test guards
 * ============================================================
 * Guard này được đăng ký TOÀN CỤC (APP_GUARD) → mọi route đều phải có token,
 * trừ route gắn @Public(). Đây là kiểu "secure by default".
 *
 * Các bước gợi ý:
 *  1. Đọc metadata IS_PUBLIC_KEY bằng this.reflector.getAllAndOverride<boolean>(
 *     IS_PUBLIC_KEY, [ctx.getHandler(), ctx.getClass()]). Nếu true → return true.
 *  2. Lấy request: ctx.switchToHttp().getRequest<{ headers: Record<string, string | undefined>; user?: AuthUser }>()
 *  3. Đọc header `authorization`, tách dạng "Bearer <token>". Sai định dạng/thiếu → UnauthorizedException.
 *  4. Verify: await this.jwt.verifyAsync<AccessPayload>(token, { secret: this.env.JWT_ACCESS_SECRET })
 *     (nhớ: verify lỗi/hết hạn sẽ THROW → bắt lại và ném UnauthorizedException).
 *  5. Gắn req.user = { id: payload.sub, companyId: payload.cid, role: payload.role }. return true.
 *
 * ❓ Vì sao phải verify bằng JWT_ACCESS_SECRET riêng, chứ không dùng chung 1 secret cho
 *    cả access và refresh token? (Gợi ý: nếu dùng chung, kẻ tấn công cầm refresh token làm gì được?)
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (isPublic) return true;

    const req = ctx
      .switchToHttp()
      .getRequest<{ headers: Record<string, string | undefined>; user?: AuthUser }>();
    const [scheme, token] = req.headers['authorization']?.split(' ') ?? [];
    if (scheme !== 'Bearer' || !token) {
      throw new UnauthorizedException('Missing or malformed bearer token');
    }

    let payload: AccessPayload;
    try {
      payload = await this.jwt.verifyAsync<AccessPayload>(token, {
        secret: this.env.JWT_ACCESS_SECRET,
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }

    req.user = { id: payload.sub, companyId: payload.cid, role: payload.role };
    return true;
  }
}

/**
 * ============================================================
 *  BÀI 2b – RolesGuard (Authorization: "bạn được làm gì?")
 * ============================================================
 * Chạy SAU JwtAuthGuard (thứ tự APP_GUARD trong AppModule), nên req.user đã có.
 *
 * Các bước gợi ý:
 *  1. roles = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES_KEY, [handler, class])
 *  2. Không khai báo roles (undefined hoặc mảng rỗng) → return true.
 *  3. Lấy req.user. Không có user, hoặc user.role không nằm trong roles → ForbiddenException.
 *
 * ❓ Vì sao sai role trả 403 (Forbidden) chứ không phải 401 (Unauthorized)?
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (!roles || roles.length === 0) return true;

    const { user } = ctx.switchToHttp().getRequest<{ user?: AuthUser }>();
    if (!user || !roles.includes(user.role)) {
      throw new ForbiddenException('Insufficient role');
    }
    return true;
  }
}
