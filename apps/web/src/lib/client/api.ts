/**
 * Gọi API qua BFF (/api/proxy/...). Chạy được cả ở client component.
 * Lỗi được chuẩn hoá thành ApiError có `code` (mã nghiệp vụ của API, vd 'COMMENT_REQUIRED')
 * — UI quyết định hành vi theo `code`, KHÔNG theo chuỗi message.
 */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details: string[] = [],
  ) {
    super(message);
  }
}

interface Options {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  body?: unknown;
  /** Chống gửi trùng (double-click/retry) — sinh 1 lần khi mở form. */
  idempotencyKey?: string;
  signal?: AbortSignal;
}

export async function api<T>(path: string, opts: Options = {}): Promise<T> {
  const res = await fetch(`/api/proxy/${path.replace(/^\//, '')}`, {
    method: opts.method ?? 'GET',
    headers: {
      ...(opts.body !== undefined && { 'content-type': 'application/json' }),
      ...(opts.idempotencyKey && { 'idempotency-key': opts.idempotencyKey }),
    },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    signal: opts.signal,
  });
  if (res.status === 204) return undefined as T;
  const data = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  if (!res.ok) throw toApiError(res.status, data);
  return data as T;
}

/** Gọi BFF auth (login/register/logout) — không đi qua proxy. */
export async function authCall<T>(action: 'login' | 'register' | 'logout', body?: unknown) {
  const res = await fetch(`/api/auth/${action}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (res.status === 204) return undefined as T;
  const data = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  if (!res.ok) throw toApiError(res.status, data);
  return data as T;
}

/**
 * API trả 2 dạng lỗi:
 *  - DomainError: { statusCode, error: 'CODE', message: '...' }
 *  - ValidationPipe: { statusCode: 400, error: 'Bad Request', message: ['...', '...'] }
 */
export function toApiError(status: number, data: Record<string, unknown> | null): ApiError {
  const raw = data?.message;
  const details = Array.isArray(raw) ? raw.map(String) : [];
  const message = Array.isArray(raw) ? raw.join('; ') : String(raw ?? `Lỗi ${status}`);
  const error = typeof data?.error === 'string' ? data.error : '';
  const code = /^[A-Z_]+$/.test(error) ? error : status === 400 ? 'VALIDATION' : `HTTP_${status}`;
  return new ApiError(status, code, message, details);
}

/** Câu thông báo cho người dùng: ưu tiên message nghiệp vụ (tiếng Việt) của API. */
export function errorMessage(e: unknown): string {
  if (e instanceof ApiError) {
    if (e.status === 429) return 'Bạn thao tác quá nhanh, vui lòng thử lại sau ít phút.';
    if (e.status === 401) return 'Phiên đăng nhập đã hết hạn.';
    if (e.code === 'CONCURRENT_MODIFICATION') {
      return 'Dữ liệu vừa được người khác cập nhật. Trang đã tải lại, hãy thử lại.';
    }
    if (e.status >= 500) return 'Hệ thống đang gặp sự cố, vui lòng thử lại.';
    return e.message;
  }
  return 'Không kết nối được máy chủ.';
}

export const newIdempotencyKey = () => crypto.randomUUID();
