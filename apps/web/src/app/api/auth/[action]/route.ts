import { NextRequest, NextResponse } from 'next/server';
import { API_URL, clearTokens, clientIp, readTokens, writeTokens } from '@/lib/server/session';
import type { TokenPair } from '@/lib/server/refresh';

/**
 * Đăng nhập / đăng ký / đăng xuất qua BFF:
 *  - login, register: gọi API, CẤT token vào cookie httpOnly, chỉ trả `user` cho trình duyệt.
 *  - logout: thu hồi refresh token ở API rồi xoá cookie (kể cả khi API lỗi).
 */
type Ctx = { params: Promise<{ action: string }> };

export async function POST(req: NextRequest, ctx: Ctx): Promise<NextResponse> {
  const { action } = await ctx.params;
  const ip = clientIp(req.headers);
  const fwd: Record<string, string> = ip ? { 'x-forwarded-for': ip } : {};

  if (action === 'logout') {
    const { accessToken, refreshToken } = await readTokens();
    if (accessToken && refreshToken) {
      await fetch(`${API_URL}/auth/logout`, {
        method: 'POST',
        headers: {
          ...fwd,
          'content-type': 'application/json',
          authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ refreshToken }),
        cache: 'no-store',
      }).catch(() => undefined);
    }
    await clearTokens();
    return new NextResponse(null, { status: 204 });
  }

  if (action !== 'login' && action !== 'register') {
    return NextResponse.json({ message: 'Not found' }, { status: 404 });
  }

  const res = await fetch(`${API_URL}/auth/${action}`, {
    method: 'POST',
    headers: { ...fwd, 'content-type': 'application/json' },
    body: await req.text(),
    cache: 'no-store',
  });
  const body = (await res.json().catch(() => ({}))) as { user?: unknown; tokens?: TokenPair };
  if (!res.ok || !body.tokens) return NextResponse.json(body, { status: res.status });

  await writeTokens(body.tokens);
  return NextResponse.json({ user: body.user }, { status: res.status });
}
