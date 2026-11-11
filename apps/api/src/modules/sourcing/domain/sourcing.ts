import { createHash, randomBytes } from 'node:crypto';
import { DomainError } from '../../../common/errors/domain-error';

/**
 * DOMAIN Sourcing: RFQ → báo giá NCC → chọn thầu → PO. Hàm thuần, không I/O.
 */

export type RfqStatus = 'OPEN' | 'CLOSED' | 'AWARDED' | 'CANCELLED';

export interface RfqLine {
  lineNo: number;
  sku: string;
  productName: string;
  unit: string;
  quantity: number;
}

export interface QuoteLine {
  lineNo: number;
  unitPrice: number;
  lineTotal: number;
}

export interface QuoteSummary {
  quoteId: string;
  invitationId: string;
  supplierId: string;
  supplierName: string;
  totalAmount: number;
  leadTimeDays: number;
  validUntil: Date;
  submittedAt: Date;
}

export interface Rfq {
  id: string;
  companyId: string;
  prId: string;
  createdBy: string;
  status: RfqStatus;
  deadline: Date;
  lines: RfqLine[];
  version: number;
  closedAt: Date | null;
  createdAt: Date;
}

// ---------------- RFQ ----------------

export function assertCanOpenRfq(
  prStatus: string,
  deadline: Date,
  now: Date,
  supplierCount: number,
) {
  if (prStatus !== 'APPROVED') {
    throw new DomainError('INVALID_TRANSITION', 'Chỉ tạo RFQ từ PR đã được duyệt');
  }
  if (deadline.getTime() <= now.getTime() + 60 * 60 * 1000) {
    throw new DomainError('INVALID_RFQ', 'Hạn báo giá phải sau thời điểm hiện tại ít nhất 1 giờ');
  }
  if (supplierCount < 1) throw new DomainError('INVALID_RFQ', 'Cần mời ít nhất 1 nhà cung cấp');
}

/** Còn nhận báo giá: OPEN và chưa quá hạn (hạn là mốc nửa mở: đúng hạn là hết). */
export const acceptsQuotes = (rfq: Rfq, now: Date) => rfq.status === 'OPEN' && now < rfq.deadline;

export function close(rfq: Rfq, now: Date): Rfq {
  if (rfq.status !== 'OPEN') {
    throw new DomainError('INVALID_TRANSITION', `Không thể đóng RFQ đang ${rfq.status}`);
  }
  return { ...rfq, status: 'CLOSED', closedAt: now };
}

export function cancel(rfq: Rfq, now: Date): Rfq {
  if (rfq.status !== 'OPEN' && rfq.status !== 'CLOSED') {
    throw new DomainError('INVALID_TRANSITION', `Không thể hủy RFQ đang ${rfq.status}`);
  }
  return { ...rfq, status: 'CANCELLED', closedAt: rfq.closedAt ?? now };
}

/**
 * Chọn thầu: RFQ phải đã đóng (hoặc đã quá hạn – coi như đóng), báo giá thuộc RFQ và còn hiệu lực.
 * Không bắt buộc chọn giá rẻ nhất (có thể vì lead time), nhưng phải có lý do nếu không rẻ nhất.
 */
export function award(
  rfq: Rfq,
  quoteId: string,
  all: QuoteSummary[],
  reason: string | null,
  now: Date,
): Rfq {
  const closed = rfq.status === 'CLOSED' || (rfq.status === 'OPEN' && now >= rfq.deadline);
  if (!closed) {
    throw new DomainError('INVALID_TRANSITION', 'Chỉ chọn thầu sau khi RFQ đã đóng hoặc quá hạn');
  }
  // Kiểm tra trạng thái TRƯỚC, rồi mới tới báo giá → lỗi trả về phản ánh đúng nguyên nhân.
  const quote = all.find((q) => q.quoteId === quoteId);
  if (!quote) throw new DomainError('INVALID_QUOTE', 'Báo giá không thuộc RFQ này');
  if (quote.validUntil <= now) throw new DomainError('INVALID_QUOTE', 'Báo giá đã hết hiệu lực');
  const cheapest = rankQuotes(all)[0];
  if (cheapest.quoteId !== quote.quoteId && !reason?.trim()) {
    throw new DomainError('COMMENT_REQUIRED', 'Không chọn giá thấp nhất thì phải ghi lý do');
  }
  return { ...rfq, status: 'AWARDED', closedAt: rfq.closedAt ?? now };
}

/** Xếp hạng: tổng tiền tăng dần, rồi lead time, rồi ai nộp sớm hơn. */
export const rankQuotes = (quotes: QuoteSummary[]) =>
  [...quotes].sort(
    (a, b) =>
      a.totalAmount - b.totalAmount ||
      a.leadTimeDays - b.leadTimeDays ||
      a.submittedAt.getTime() - b.submittedAt.getTime(),
  );

// ---------------- Báo giá ----------------

export interface QuoteInput {
  leadTimeDays: number;
  validUntil: Date;
  note?: string;
  lines: Array<{ lineNo: number; unitPrice: number }>;
}

/** Kiểm tra báo giá khớp ĐỦ và ĐÚNG các dòng của RFQ, tính thành tiền (số nguyên VND). */
export function priceQuote(
  rfq: Rfq,
  input: QuoteInput,
  now: Date,
): { lines: QuoteLine[]; totalAmount: number } {
  if (!acceptsQuotes(rfq, now)) throw new DomainError('RFQ_CLOSED', 'RFQ đã hết hạn nhận báo giá');
  if (input.validUntil <= rfq.deadline) {
    throw new DomainError('INVALID_QUOTE', 'Hiệu lực báo giá phải sau hạn chót của RFQ');
  }
  const expected = new Map(rfq.lines.map((l) => [l.lineNo, l]));
  const got = new Set<number>();
  const lines: QuoteLine[] = [];
  for (const l of input.lines) {
    const line = expected.get(l.lineNo);
    if (!line || got.has(l.lineNo)) {
      throw new DomainError('INVALID_QUOTE', `Dòng ${l.lineNo} không hợp lệ hoặc bị trùng`);
    }
    if (!Number.isInteger(l.unitPrice) || l.unitPrice <= 0) {
      throw new DomainError('INVALID_QUOTE', `Đơn giá dòng ${l.lineNo} phải là số nguyên dương`);
    }
    got.add(l.lineNo);
    lines.push({
      lineNo: l.lineNo,
      unitPrice: l.unitPrice,
      lineTotal: l.unitPrice * line.quantity,
    });
  }
  if (got.size !== expected.size) {
    throw new DomainError('INVALID_QUOTE', 'Báo giá phải có đủ mọi dòng hàng');
  }
  lines.sort((a, b) => a.lineNo - b.lineNo);
  return { lines, totalAmount: lines.reduce((s, l) => s + l.lineTotal, 0) };
}

// ---------------- Token mời NCC ----------------

/** Token 256-bit ngẫu nhiên; DB chỉ lưu SHA-256 (đủ vì token đã có entropy cao, không cần salt/argon2). */
export function issueInviteToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString('base64url');
  return { token, hash: hashInviteToken(token) };
}

export const hashInviteToken = (token: string) => createHash('sha256').update(token).digest('hex');

/** Số PO dễ đọc, không đoán được thứ tự: PO-20261111-3FA9C2. Trùng (rất hiếm) → unique constraint chặn. */
export function newPoNumber(now: Date): string {
  const d = now.toISOString().slice(0, 10).replace(/-/g, '');
  return `PO-${d}-${randomBytes(3).toString('hex').toUpperCase()}`;
}
