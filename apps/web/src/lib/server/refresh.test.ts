import { describe, expect, it, vi } from 'vitest';
import { createSingleFlightRefresher, type TokenPair } from './refresh';

const pair = (n: number): TokenPair => ({
  accessToken: `at${n}`,
  refreshToken: `rt${n}`,
  expiresIn: 900,
});

describe('createSingleFlightRefresher', () => {
  it('5 request song song cùng refresh token → API chỉ bị gọi 1 lần, tất cả nhận cùng token mới', async () => {
    let calls = 0;
    const api = vi.fn(async () => {
      calls++;
      await new Promise((r) => setTimeout(r, 20));
      return pair(calls);
    });
    const refresh = createSingleFlightRefresher(api);

    const results = await Promise.all(Array.from({ length: 5 }, () => refresh('rt0')));
    expect(api).toHaveBeenCalledTimes(1);
    expect(new Set(results.map((r) => r.accessToken))).toEqual(new Set(['at1']));
  });

  it('request đến trễ (cookie cũ) trong 30s → dùng lại kết quả, không gọi API (tránh reuse detection)', async () => {
    let t = 0;
    const api = vi.fn(async () => pair(1));
    const refresh = createSingleFlightRefresher(api, () => t);

    await refresh('rt0');
    t = 29_000;
    await refresh('rt0');
    expect(api).toHaveBeenCalledTimes(1);

    t = 31_000; // quá hạn grace → gọi thật (API sẽ tự quyết định)
    await refresh('rt0');
    expect(api).toHaveBeenCalledTimes(2);
  });

  it('refresh lỗi → mọi request chờ chung nhận lỗi; lần sau thử lại được', async () => {
    const api = vi
      .fn<(rt: string) => Promise<TokenPair>>()
      .mockRejectedValueOnce(new Error('401'))
      .mockResolvedValueOnce(pair(2));
    const refresh = createSingleFlightRefresher(api);

    const results = await Promise.allSettled([refresh('rt0'), refresh('rt0')]);
    expect(results.every((r) => r.status === 'rejected')).toBe(true);
    await expect(refresh('rt0')).resolves.toMatchObject({ accessToken: 'at2' });
  });

  it('refresh token khác nhau (người dùng khác) không chờ nhau', async () => {
    const api = vi.fn(async (rt: string) => pair(Number(rt.slice(2)) + 10));
    const refresh = createSingleFlightRefresher(api);
    const [a, b] = await Promise.all([refresh('rt1'), refresh('rt2')]);
    expect(api).toHaveBeenCalledTimes(2);
    expect([a.accessToken, b.accessToken]).toEqual(['at11', 'at12']);
  });
});
