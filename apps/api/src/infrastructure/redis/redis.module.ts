import { Global, Inject, Injectable, Module, OnApplicationShutdown } from '@nestjs/common';
import { Redis } from 'ioredis';
import { ENV, Env } from '../../config/env';

/** DI token cho Redis client (ioredis). */
export const REDIS = Symbol('REDIS');

@Injectable()
class RedisLifecycle implements OnApplicationShutdown {
  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  async onApplicationShutdown(): Promise<void> {
    await this.redis.quit();
  }
}

@Global()
@Module({
  providers: [
    {
      provide: REDIS,
      inject: [ENV],
      useFactory: (env: Env) => new Redis(env.REDIS_URL, { maxRetriesPerRequest: 3 }),
    },
    RedisLifecycle,
  ],
  exports: [REDIS],
})
export class RedisModule {}
