import { DomainError } from '../../../common/errors/domain-error';
import {
  QuoteSummary,
  Rfq,
  assertCanOpenRfq,
  award,
  close,
  hashInviteToken,
  issueInviteToken,
  newPoNumber,
  priceQuote,
  rankQuotes,
} from './sourcing';

const now = new Date('2026-11-11T00:00:00Z');
const h = (hours: number) => new Date(now.getTime() + hours * 3600_000);
const code = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    return e instanceof DomainError ? e.code : 'NOT_DOMAIN';
  }
  return 'NO_THROW';
};

const rfq = (patch: Partial<Rfq> = {}): Rfq => ({
  id: 'r1',
  companyId: 'acme',
  prId: 'pr1',
  createdBy: 'buyer',
  status: 'OPEN',
  deadline: h(48),
  lines: [
    { lineNo: 1, sku: 'A', productName: 'A', unit: 'cái', quantity: 10 },
    { lineNo: 2, sku: 'B', productName: 'B', unit: 'hộp', quantity: 3 },
  ],
  version: 0,
  closedAt: null,
  createdAt: now,
  ...patch,
});

const q = (id: string, total: number, lead: number, submittedH = 0): QuoteSummary => ({
  quoteId: id,
  invitationId: `i-${id}`,
  supplierId: `s-${id}`,
  supplierName: id,
  totalAmount: total,
  leadTimeDays: lead,
  validUntil: h(24 * 30),
  submittedAt: h(submittedH),
});

describe('assertCanOpenRfq', () => {
  it('PR phải APPROVED, hạn ≥ 1 giờ nữa, có NCC', () => {
    expect(code(() => assertCanOpenRfq('APPROVED', h(2), now, 1))).toBe('NO_THROW');
    expect(code(() => assertCanOpenRfq('PENDING_APPROVAL', h(2), now, 1))).toBe(
      'INVALID_TRANSITION',
    );
    expect(code(() => assertCanOpenRfq('APPROVED', h(0.5), now, 1))).toBe('INVALID_RFQ');
    expect(code(() => assertCanOpenRfq('APPROVED', h(2), now, 0))).toBe('INVALID_RFQ');
  });
});

describe('priceQuote', () => {
  const input = {
    leadTimeDays: 7,
    validUntil: h(24 * 30),
    lines: [
      { lineNo: 2, unitPrice: 50_000 },
      { lineNo: 1, unitPrice: 10_000 },
    ],
  };

  it('tính thành tiền theo số lượng của RFQ, sắp theo lineNo', () => {
    expect(priceQuote(rfq(), input, now)).toEqual({
      lines: [
        { lineNo: 1, unitPrice: 10_000, lineTotal: 100_000 },
        { lineNo: 2, unitPrice: 50_000, lineTotal: 150_000 },
      ],
      totalAmount: 250_000,
    });
  });

  it('thiếu dòng, dòng lạ, trùng dòng, giá không nguyên → INVALID_QUOTE', () => {
    const bad = (lines: Array<{ lineNo: number; unitPrice: number }>) =>
      code(() => priceQuote(rfq(), { ...input, lines }, now));
    expect(bad([{ lineNo: 1, unitPrice: 1 }])).toBe('INVALID_QUOTE');
    expect(bad([...input.lines, { lineNo: 9, unitPrice: 1 }])).toBe('INVALID_QUOTE');
    expect(bad([...input.lines, { lineNo: 1, unitPrice: 1 }])).toBe('INVALID_QUOTE');
    expect(
      bad([
        { lineNo: 1, unitPrice: 1.5 },
        { lineNo: 2, unitPrice: 1 },
      ]),
    ).toBe('INVALID_QUOTE');
  });

  it('hết hạn (đúng mốc deadline cũng là hết) hoặc đã đóng → RFQ_CLOSED', () => {
    expect(code(() => priceQuote(rfq(), input, h(48)))).toBe('RFQ_CLOSED');
    expect(code(() => priceQuote(rfq({ status: 'CLOSED' }), input, now))).toBe('RFQ_CLOSED');
  });

  it('hiệu lực báo giá phải sau deadline', () => {
    expect(code(() => priceQuote(rfq(), { ...input, validUntil: h(24) }, now))).toBe(
      'INVALID_QUOTE',
    );
  });
});

describe('rankQuotes & award', () => {
  const quotes = [q('slow-cheap', 100, 30), q('fast', 120, 2), q('tie-later', 100, 30, 5)];

  it('xếp theo giá, rồi lead time, rồi nộp sớm', () => {
    expect(rankQuotes(quotes).map((x) => x.quoteId)).toEqual(['slow-cheap', 'tie-later', 'fast']);
  });

  it('chỉ chọn thầu khi đã đóng hoặc quá hạn', () => {
    expect(code(() => award(rfq(), quotes[0].quoteId, quotes, null, now))).toBe(
      'INVALID_TRANSITION',
    );
    // RFQ còn mở + báo giá lạ → vẫn báo lỗi trạng thái trước
    expect(code(() => award(rfq(), 'khong-co', quotes, null, now))).toBe('INVALID_TRANSITION');
    expect(award(rfq(), quotes[0].quoteId, quotes, null, h(49)).status).toBe('AWARDED');
    expect(award(close(rfq(), now), quotes[0].quoteId, quotes, null, now).status).toBe('AWARDED');
  });

  it('không chọn giá thấp nhất → bắt buộc lý do', () => {
    const closed = close(rfq(), now);
    expect(code(() => award(closed, quotes[1].quoteId, quotes, null, now))).toBe(
      'COMMENT_REQUIRED',
    );
    expect(award(closed, quotes[1].quoteId, quotes, 'Cần giao gấp trong 2 ngày', now).status).toBe(
      'AWARDED',
    );
  });

  it('báo giá hết hiệu lực hoặc không thuộc RFQ → INVALID_QUOTE', () => {
    const closed = close(rfq(), now);
    const expired = { ...quotes[0], validUntil: now };
    expect(code(() => award(closed, expired.quoteId, [expired], null, now))).toBe('INVALID_QUOTE');
    expect(code(() => award(closed, q('x', 1, 1).quoteId, quotes, 'x', now))).toBe('INVALID_QUOTE');
  });

  it('đóng 2 lần → INVALID_TRANSITION', () => {
    expect(code(() => close(close(rfq(), now), now))).toBe('INVALID_TRANSITION');
  });
});

describe('token & số PO', () => {
  it('token ngẫu nhiên 256-bit, hash ổn định, không lưu token thô', () => {
    const a = issueInviteToken();
    const b = issueInviteToken();
    expect(a.token).not.toBe(b.token);
    expect(a.token).toHaveLength(43); // 32 byte base64url
    expect(hashInviteToken(a.token)).toBe(a.hash);
    expect(a.hash).not.toContain(a.token);
  });

  it('PO-YYYYMMDD-XXXXXX', () => {
    expect(newPoNumber(now)).toMatch(/^PO-20261111-[0-9A-F]{6}$/);
  });
});
