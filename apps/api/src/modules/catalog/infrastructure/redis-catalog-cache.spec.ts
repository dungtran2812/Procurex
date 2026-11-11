import type { Redis } from 'ioredis';
import { FakeRedis } from '../../../testing/fake-redis';
import { CATALOG_VERSION_KEY, RedisCatalogCache } from './redis-catalog-cache';

describe('RedisCatalogCache (Bài 9)', () => {
  let redis: FakeRedis;
  let cache: RedisCatalogCache;

  beforeEach(() => {
    redis = new FakeRedis();
    cache = new RedisCatalogCache(redis as unknown as Redis);
  });

  it('set/get JSON, key có version và TTL', async () => {
    await cache.set('product:1', { name: 'A' }, 600);
    expect(await cache.get('product:1')).toEqual({ name: 'A' });
    expect(redis.ttls.get('catalog:v0:product:1')).toBe(600);
  });

  it('invalidateAll tăng version → key cũ không còn đọc được', async () => {
    await cache.set('product:1', { name: 'A' }, 600);
    await cache.invalidateAll();
    expect(await redis.get(CATALOG_VERSION_KEY)).toBe('1');
    expect(await cache.get('product:1')).toBeNull();
  });

  it('Redis lỗi → fail-open (get trả null, set không ném)', async () => {
    redis.get = () => Promise.reject(new Error('ECONNREFUSED'));
    await expect(cache.get('x')).resolves.toBeNull();
    await expect(cache.set('x', 1, 10)).resolves.toBeUndefined();
  });
});
