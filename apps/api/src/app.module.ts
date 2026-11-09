import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { JwtAuthGuard, RolesGuard } from './common/auth/guards';
import { DomainErrorFilter } from './common/errors/domain-error.filter';
import { EnvModule } from './config/env.module';
import { HealthController } from './health/health.controller';
import { PrismaModule } from './infrastructure/prisma/prisma.module';
import { RedisModule } from './infrastructure/redis/redis.module';
import { IdentityModule } from './modules/identity/identity.module';

@Module({
  imports: [
    EnvModule,
    PrismaModule,
    RedisModule,
    // Secret truyền theo từng lần sign/verify (access vs refresh khác nhau) nên ở đây để trống.
    JwtModule.register({ global: true }),
    // Mặc định 100 req/phút/IP; route login tự siết xuống 5. (In-memory; GĐ5 chuyển sang Redis storage.)
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 100 }]),
    IdentityModule,
  ],
  controllers: [HealthController],
  providers: [
    // Guard toàn cục chạy THEO THỨ TỰ khai báo: Throttler → JwtAuth → Roles
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_FILTER, useClass: DomainErrorFilter },
  ],
})
export class AppModule {}
