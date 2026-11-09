import { Controller, Get, Inject } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import type { Redis } from 'ioredis';
import { Public } from '../common/auth/decorators';
import { PrismaService } from '../infrastructure/prisma/prisma.service';
import { REDIS } from '../infrastructure/redis/redis.module';

/** Kiểm tra sống/chết của API + kết nối DB, Redis (dùng cho k8s readiness probe ở GĐ8). */
@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  @Public()
  @SkipThrottle()
  @Get()
  async check() {
    const [db, cache] = await Promise.allSettled([
      this.prisma.$queryRaw`SELECT 1`,
      this.redis.ping(),
    ]);
    return {
      status: db.status === 'fulfilled' && cache.status === 'fulfilled' ? 'ok' : 'degraded',
      postgres: db.status === 'fulfilled' ? 'up' : 'down',
      redis: cache.status === 'fulfilled' ? 'up' : 'down',
    };
  }
}
