import 'server-only';
import { cookies } from 'next/headers';
import { createSingleFlightRefresher, type TokenPair } from './refresh';

/** URL API chỉ biết ở server. Trình duyệt chỉ nói chuyện với BFF (/api/*) cùng origin. */
export const API_URL = process.env.API_URL ?? 'http://localhost:3001/api/v1';

export const ACCESS_COOKIE = 'px_at';
export const REFRESH_COOKIE = 'px_rt';
const REFRESH_TTL_S = 7 * 24 * 3600;

/**
 * Token nằm trong cookie httpOnly: JavaScript trên trang KHÔNG đọc được → XSS không lấy được token.
 * SameSite=Lax chặn phần lớn CSRF (form từ site khác không kèm cookie khi POST);
 * mọi API ghi của BFF chỉ nhận JSON nên form HTML thuần cũng không giả được.
 */
const base = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: process.env.NODE_ENV === 'production',
  path: '/',
};

export async function readTokens() {
  const jar = await cookies();
  return {
    accessToken: jar.get(ACCESS_COOKIE)?.value,
    refreshToken: jar.get(REFRESH_COOKIE)?.value,
  };
}

export async function writeTokens(t: TokenPair): Promise<void> {
  const jar = await cookies();
  jar.set(ACCESS_COOKIE, t.accessToken, { ...base, maxAge: t.expiresIn });
  jar.set(REFRESH_COOKIE, t.refreshToken, { ...base, maxAge: REFRESH_TTL_S });
}

export async function clearTokens(): Promise<void> {
  const jar = await cookies();
  jar.delete(ACCESS_COOKIE);
  jar.delete(REFRESH_COOKIE);
}

export class RefreshFailed extends Error {}

/** Một refresher dùng chung cho cả process (xem refresh.ts). */
export const refreshTokens = createSingleFlightRefresher(async (refreshToken) => {
  const res = await fetch(`${API_URL}/auth/refresh`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
    cache: 'no-store',
  });
  if (!res.ok) throw new RefreshFailed(`refresh ${res.status}`);
  const body = (await res.json()) as { tokens: TokenPair };
  return body.tokens;
});
