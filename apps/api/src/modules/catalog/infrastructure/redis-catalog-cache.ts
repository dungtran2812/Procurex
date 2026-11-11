import { Inject, Injectable } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { REDIS } from '../../../infrastructure/redis/redis.module';
import { CatalogCache } from '../application/ports';

/** Key giữ số phiên bản hiện tại của catalog. */
export const CATALOG_VERSION_KEY = 'catalog:version';

/**
 * ADAPTER cache bằng Redis.
 *   catalog:version                = "7"
 *   catalog:v7:product:{id}        = JSON  (TTL)
 *   catalog:v7:search:{...}        = JSON  (TTL)
 * invalidateAll() → INCR catalog:version → mọi đọc sau dùng v8, key v7 tự hết hạn.
 *
 * Cache là tối ưu, không phải nguồn sự thật: Redis lỗi thì đọc thẳng DB (fail-open) thay vì 500.
 */
@Injectable()
export class RedisCatalogCache extends CatalogCache {
  constructor(@Inject(REDIS) private readonly redis: Redis) {
    super();
  }

  private async versioned(key: string): Promise<string> {
    const v = (await this.redis.get(CATALOG_VERSION_KEY)) ?? '0';
    return `catalog:v${v}:${key}`;
  }

  async get<T>(key: string): Promise<T | null> {
    try {
      const raw = await this.redis.get(await this.versioned(key));
      return raw === null ? null : (JSON.parse(raw) as T);
    } catch {
      return null;
    }
  }

  async set<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
    try {
      await this.redis.set(await this.versioned(key), JSON.stringify(value), 'EX', ttlSeconds);
    } catch {
      // bỏ qua: lần sau đọc DB lại
    }
  }

  async invalidateAll(): Promise<void> {
    await this.redis.incr(CATALOG_VERSION_KEY);
  }
}
