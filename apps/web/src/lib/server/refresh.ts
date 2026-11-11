/**
 * Refresh token SINGLE-FLIGHT (chạy ở server Next.js, không phải trình duyệt).
 *
 * Vì sao cần: API (Bài 4a) có REUSE DETECTION — dùng lại refresh token đã tiêu thụ → API thu hồi
 * MỌI phiên của user. Trang có 5 request song song cùng gặp access token hết hạn: nếu mỗi request
 * tự gọi /auth/refresh với CÙNG refresh token, request thứ 2 trở đi bị coi là "token bị đánh cắp"
 * → người dùng bị đăng xuất vô cớ.
 *
 * Cách làm: gom theo refresh token —
 *  1. Đang có lượt refresh cho token này → chờ chung promise đó (không gọi API lần 2).
 *  2. Vừa refresh xong (≤ GRACE_MS) → trả luôn kết quả cũ cho request đến trễ
 *     (request đã gửi đi với cookie cũ trước khi trình duyệt nhận cookie mới).
 *
 * Giới hạn: Map nằm trong bộ nhớ 1 process. Chạy nhiều instance Next → cần sticky session
 * hoặc chuyển Map sang Redis (khoá SET NX + lưu kết quả ngắn hạn).
 */
export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

type Refresher = (refreshToken: string) => Promise<TokenPair>;

const GRACE_MS = 30_000;

export function createSingleFlightRefresher(doRefresh: Refresher, now: () => number = Date.now) {
  const inFlight = new Map<string, Promise<TokenPair>>();
  const recent = new Map<string, { at: number; tokens: TokenPair }>();

  return async function refresh(refreshToken: string): Promise<TokenPair> {
    const hit = recent.get(refreshToken);
    if (hit && now() - hit.at <= GRACE_MS) return hit.tokens;

    let pending = inFlight.get(refreshToken);
    if (!pending) {
      pending = doRefresh(refreshToken)
        .then((tokens) => {
          recent.set(refreshToken, { at: now(), tokens });
          return tokens;
        })
        .finally(() => inFlight.delete(refreshToken));
      inFlight.set(refreshToken, pending);
      // Dọn kết quả cũ để Map không phình mãi.
      for (const [k, v] of recent) if (now() - v.at > GRACE_MS) recent.delete(k);
    }
    return pending;
  };
}
