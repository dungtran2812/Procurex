/**
 * FakeRedis: hiện thực in-memory một TẬP CON lệnh của ioredis đủ cho JwtTokenService.
 * Hỗ trợ: get, set (kèm 'EX', ttl), del, exists, incr, sadd, srem, smembers, expire, multi().exec().
 * TTL được ghi lại nhưng không tự hết hạn (test không cần chờ thời gian thực).
 * Nếu bạn dùng lệnh khác → test sẽ báo "is not a function": hãy dùng các lệnh trên.
 */
type Value = string | Set<string>;

class FakeMulti {
  private readonly ops: Array<() => unknown> = [];
  constructor(private readonly redis: FakeRedis) {}

  set(key: string, value: string, ...args: Array<string | number>): this {
    this.ops.push(() => this.redis.setSync(key, value, args));
    return this;
  }
  del(...keys: string[]): this {
    this.ops.push(() => this.redis.delSync(keys));
    return this;
  }
  sadd(key: string, ...members: string[]): this {
    this.ops.push(() => this.redis.saddSync(key, members));
    return this;
  }
  srem(key: string, ...members: string[]): this {
    this.ops.push(() => this.redis.sremSync(key, members));
    return this;
  }
  expire(key: string, seconds: number): this {
    this.ops.push(() => this.redis.expireSync(key, seconds));
    return this;
  }
  async exec(): Promise<Array<[Error | null, unknown]>> {
    return this.ops.map((op) => [null, op()]);
  }
}

export class FakeRedis {
  readonly store = new Map<string, Value>();
  readonly ttls = new Map<string, number>();

  // ---- sync core (dùng chung cho lệnh đơn và multi) ----
  setSync(key: string, value: string, args: Array<string | number>): 'OK' {
    this.store.set(key, value);
    const exIdx = args.findIndex((a) => String(a).toUpperCase() === 'EX');
    if (exIdx >= 0) this.ttls.set(key, Number(args[exIdx + 1]));
    else this.ttls.delete(key);
    return 'OK';
  }
  delSync(keys: string[]): number {
    let n = 0;
    for (const k of keys.flat()) {
      if (this.store.delete(k)) n += 1;
      this.ttls.delete(k);
    }
    return n;
  }
  saddSync(key: string, members: string[]): number {
    const cur = this.store.get(key);
    const set = cur instanceof Set ? cur : new Set<string>();
    let added = 0;
    for (const m of members.flat()) {
      if (!set.has(m)) {
        set.add(m);
        added += 1;
      }
    }
    this.store.set(key, set);
    return added;
  }
  sremSync(key: string, members: string[]): number {
    const cur = this.store.get(key);
    if (!(cur instanceof Set)) return 0;
    let removed = 0;
    for (const m of members.flat()) if (cur.delete(m)) removed += 1;
    if (cur.size === 0) this.store.delete(key);
    return removed;
  }
  expireSync(key: string, seconds: number): number {
    if (!this.store.has(key)) return 0;
    this.ttls.set(key, seconds);
    return 1;
  }

  // ---- API giống ioredis ----
  async get(key: string): Promise<string | null> {
    const v = this.store.get(key);
    return typeof v === 'string' ? v : null;
  }
  async set(key: string, value: string, ...args: Array<string | number>): Promise<'OK'> {
    return this.setSync(key, value, args);
  }
  async del(...keys: string[]): Promise<number> {
    return this.delSync(keys);
  }
  async exists(...keys: string[]): Promise<number> {
    return keys.flat().filter((k) => this.store.has(k)).length;
  }
  async incr(key: string): Promise<number> {
    const next = Number((await this.get(key)) ?? '0') + 1;
    this.store.set(key, String(next));
    return next;
  }
  async sadd(key: string, ...members: string[]): Promise<number> {
    return this.saddSync(key, members);
  }
  async srem(key: string, ...members: string[]): Promise<number> {
    return this.sremSync(key, members);
  }
  async smembers(key: string): Promise<string[]> {
    const v = this.store.get(key);
    return v instanceof Set ? [...v] : [];
  }
  async expire(key: string, seconds: number): Promise<number> {
    return this.expireSync(key, seconds);
  }
  multi(): FakeMulti {
    return new FakeMulti(this);
  }
}
