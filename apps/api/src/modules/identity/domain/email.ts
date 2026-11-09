/** Chuẩn hóa email trước khi lưu/tra cứu: " An@Corp.VN " → "an@corp.vn". */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
