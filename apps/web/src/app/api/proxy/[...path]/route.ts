import { NextRequest, NextResponse } from 'next/server';
import { API_URL, clearTokens, readTokens, refreshTokens, writeTokens } from '@/lib/server/session';

/**
 * BFF proxy: trình duyệt gọi /api/proxy/<đường dẫn API>, server Next gắn access token từ cookie
 * httpOnly rồi chuyển tiếp tới NestJS. Access token hết hạn (401) → refresh SINGLE-FLIGHT →
 * ghi cookie mới → gửi lại đúng 1 lần.
 *
 * Trình duyệt không bao giờ thấy token; API_URL cũng không lộ ra client.
 */
type Ctx = { params: Promise<{ path: string[] }> };

/** Header client được phép chuyển tiếp (allowlist, không chuyển cookie/host...). */
const FORWARD_REQUEST_HEADERS = ['content-type', 'idempotency-key', 'accept'];
const FORWARD_RESPONSE_HEADERS = ['content-type', 'idempotent-replay', 'retry-after'];

async function handle(req: NextRequest, ctx: Ctx): Promise<NextResponse> {
  const { path } = await ctx.params;
  const target = `${API_URL}/${path.map(encodeURIComponent).join('/')}${req.nextUrl.search}`;
  const body = req.method === 'GET' || req.method === 'HEAD' ? undefined : await req.text();

  const headers: Record<string, string> = {};
  for (const h of FORWARD_REQUEST_HEADERS) {
    const v = req.headers.get(h);
    if (v) headers[h] = v;
  }

  let { accessToken, refreshToken } = await readTokens();
  const send = (token?: string) =>
    fetch(target, {
      method: req.method,
      headers: token ? { ...headers, authorization: `Bearer ${token}` } : headers,
      body,
      cache: 'no-store',
      redirect: 'manual',
    });

  // Cookie access đã hết maxAge nhưng còn refresh → làm mới trước khi gửi.
  if (!accessToken && refreshToken) accessToken = await tryRefresh(refreshToken);

  let res = await send(accessToken);
  if (res.status === 401 && refreshToken) {
    const fresh = await tryRefresh(refreshToken);
    if (fresh) res = await send(fresh);
  }

  const out = new NextResponse(res.status === 204 ? null : res.body, { status: res.status });
  for (const h of FORWARD_RESPONSE_HEADERS) {
    const v = res.headers.get(h);
    if (v) out.headers.set(h, v);
  }
  return out;
}

async function tryRefresh(refreshToken: string): Promise<string | undefined> {
  try {
    const tokens = await refreshTokens(refreshToken);
    await writeTokens(tokens);
    return tokens.accessToken;
  } catch {
    // Refresh token hết hạn / bị thu hồi → xoá cookie; client nhận 401 và chuyển tới /login.
    await clearTokens();
    return undefined;
  }
}

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
