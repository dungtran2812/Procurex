/** Tiền VND: dùng Intl thay vì tự ghép chuỗi (dấu phân cách, ký hiệu ₫ đúng chuẩn vi-VN). */
const vndFormatter = new Intl.NumberFormat('vi-VN', {
  style: 'currency',
  currency: 'VND',
  maximumFractionDigits: 0,
});
export const vnd = (n: number | null | undefined) => (n == null ? '—' : vndFormatter.format(n));

const dateTime = new Intl.DateTimeFormat('vi-VN', {
  dateStyle: 'short',
  timeStyle: 'short',
  timeZone: 'Asia/Ho_Chi_Minh',
});
/** API trả UTC (ISO); chỉ đổi sang giờ Việt Nam lúc HIỂN THỊ. */
export const dt = (iso: string | null | undefined) => (iso ? dateTime.format(new Date(iso)) : '—');

export const shortId = (id: string) => id.slice(0, 8);

export const PR_STATUS_LABEL: Record<string, string> = {
  DRAFT: 'Nháp',
  PENDING_APPROVAL: 'Chờ duyệt',
  APPROVED: 'Đã duyệt',
  REJECTED: 'Bị từ chối',
  CANCELLED: 'Đã hủy',
};

export const RFQ_STATUS_LABEL: Record<string, string> = {
  OPEN: 'Đang nhận báo giá',
  CLOSED: 'Đã đóng',
  AWARDED: 'Đã chọn thầu',
  CANCELLED: 'Đã hủy',
};

export const ERP_STATUS_LABEL: Record<string, string> = {
  PENDING: 'Đang đồng bộ',
  SYNCED: 'Đã đồng bộ',
  FAILED: 'Đồng bộ lỗi',
};

export const ROLE_LABEL: Record<string, string> = {
  ADMIN: 'Quản trị',
  APPROVER: 'Người duyệt',
  BUYER: 'Người mua',
};

/** Tên thông số: size_mm → "Size (mm)". */
export function specLabel(key: string): string {
  const known: Record<string, string> = {
    brand: 'Thương hiệu',
    material: 'Vật liệu',
    origin: 'Xuất xứ',
    type: 'Loại',
    size: 'Kích cỡ',
    size_mm: 'Kích thước (mm)',
    length_mm: 'Chiều dài (mm)',
    length_inch: 'Chiều dài (inch)',
    power_w: 'Công suất (W)',
    voltage: 'Điện áp',
    chuck_mm: 'Đầu kẹp (mm)',
    disc_mm: 'Đường kính đĩa (mm)',
    tip: 'Đầu vít',
    color: 'Màu',
    standard: 'Tiêu chuẩn',
    toe: 'Mũi giày',
    thread: 'Ren',
    grade: 'Cấp bền',
    finish: 'Bề mặt',
    head: 'Đầu',
    code: 'Mã',
    seal: 'Phớt',
  };
  return known[key] ?? key.replace(/_/g, ' ');
}
