import { DomainError } from '../../../common/errors/domain-error';
import {
  Approver,
  ApprovalRule,
  PurchaseRequest,
  allowedActions,
  buildSteps,
  cancel,
  decide,
  submit,
  validateRules,
} from './purchase-request';

const at = new Date('2026-11-11T00:00:00Z');
const buyer = { id: 'buyer', companyId: 'acme', role: 'BUYER' as const };
const approver = (id: string, limit: number, extra: Partial<Approver> = {}): Approver => ({
  id,
  companyId: 'acme',
  role: 'APPROVER',
  approvalLimit: limit,
  isActive: true,
  ...extra,
});
const RULES: ApprovalRule[] = [
  { level: 1, minTotal: 0, minApproverLimit: 0 },
  { level: 2, minTotal: 50_000_000, minApproverLimit: 50_000_000 },
  { level: 3, minTotal: 200_000_000, minApproverLimit: 500_000_000 },
];

const draft = (total = 10_000_000): PurchaseRequest => ({
  id: 'pr1',
  companyId: 'acme',
  requesterId: 'buyer',
  title: 'PR',
  note: null,
  status: 'DRAFT',
  totalAmount: total,
  version: 0,
  submittedAt: null,
  decidedAt: null,
  createdAt: at,
  lines: [
    {
      lineNo: 1,
      productId: 'p',
      sku: 'S',
      productName: 'N',
      unit: 'cái',
      quantity: 1,
      unitPrice: total,
      priceSource: 'TIER',
      lineTotal: total,
    },
  ],
  steps: [],
});
const code = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    return e instanceof DomainError ? e.code : 'NOT_DOMAIN';
  }
  return 'NO_THROW';
};

describe('buildSteps – quy tắc duyệt cấu hình được', () => {
  it.each([
    [10_000_000, [1]],
    [50_000_000, [1, 2]],
    [300_000_000, [1, 2, 3]],
  ])('tổng %i → các cấp %j', (total, levels) => {
    expect(buildSteps(total, RULES).map((s) => s.level)).toEqual(levels);
  });

  it('không cấu hình → 1 cấp mặc định', () => {
    expect(buildSteps(1, [])).toMatchObject([{ level: 1, minApproverLimit: 0 }]);
  });

  it('PR nhỏ hơn mọi ngưỡng → vẫn cần cấp thấp nhất', () => {
    const steps = buildSteps(1, [{ level: 1, minTotal: 1_000_000, minApproverLimit: 5 }]);
    expect(steps).toMatchObject([{ level: 1, minApproverLimit: 5 }]);
  });
});

describe('state machine', () => {
  it('submit: DRAFT → PENDING_APPROVAL và sinh bước duyệt', () => {
    const pr = submit(draft(60_000_000), buyer, RULES, at);
    expect(pr.status).toBe('PENDING_APPROVAL');
    expect(pr.submittedAt).toBe(at);
    expect(pr.steps.map((s) => s.decision)).toEqual(['PENDING', 'PENDING']);
  });

  it('submit: người khác không gửi được, không gửi lại lần 2, không gửi PR rỗng', () => {
    expect(code(() => submit(draft(), { ...buyer, id: 'x' }, RULES, at))).toBe('FORBIDDEN_ACTION');
    const pending = submit(draft(), buyer, RULES, at);
    expect(code(() => submit(pending, buyer, RULES, at))).toBe('INVALID_TRANSITION');
    expect(code(() => submit({ ...draft(), lines: [] }, buyer, RULES, at))).toBe('EMPTY_PR');
  });

  it('duyệt nhiều cấp: chỉ APPROVED khi đủ mọi cấp, mỗi cấp đúng hạn mức', () => {
    let pr = submit(draft(60_000_000), buyer, RULES, at);
    pr = decide(pr, approver('a1', 0), 'APPROVE', null, at);
    expect(pr.status).toBe('PENDING_APPROVAL');
    expect(pr.steps[0]).toMatchObject({ decision: 'APPROVED', decidedBy: 'a1' });

    // cấp 2 cần hạn mức ≥ 50tr
    expect(code(() => decide(pr, approver('a2', 10_000_000), 'APPROVE', null, at))).toBe(
      'FORBIDDEN_ACTION',
    );
    pr = decide(pr, approver('a2', 100_000_000), 'APPROVE', null, at);
    expect(pr.status).toBe('APPROVED');
    expect(pr.decidedAt).toBe(at);
  });

  it('một người không duyệt 2 cấp của cùng PR', () => {
    let pr = submit(draft(60_000_000), buyer, RULES, at);
    pr = decide(pr, approver('boss', 999_999_999), 'APPROVE', null, at);
    expect(code(() => decide(pr, approver('boss', 999_999_999), 'APPROVE', null, at))).toBe(
      'FORBIDDEN_ACTION',
    );
  });

  it('không tự duyệt PR của mình, BUYER/khoá/khác công ty không duyệt được', () => {
    const pr = submit(draft(), buyer, RULES, at);
    const tries: Approver[] = [
      approver('buyer', 999),
      { ...approver('b2', 999), role: 'BUYER' },
      approver('a', 999, { isActive: false }),
      approver('a', 999, { companyId: 'other' }),
    ];
    for (const a of tries)
      expect(code(() => decide(pr, a, 'APPROVE', null, at))).toBe('FORBIDDEN_ACTION');
  });

  it('từ chối: bắt buộc lý do, kết thúc PR ngay', () => {
    const pr = submit(draft(60_000_000), buyer, RULES, at);
    expect(code(() => decide(pr, approver('a1', 0), 'REJECT', '  ', at))).toBe('COMMENT_REQUIRED');
    const rejected = decide(pr, approver('a1', 0), 'REJECT', 'Vượt ngân sách', at);
    expect(rejected.status).toBe('REJECTED');
    expect(rejected.steps[0]).toMatchObject({ decision: 'REJECTED', comment: 'Vượt ngân sách' });
    expect(code(() => decide(rejected, approver('a2', 1e12), 'APPROVE', null, at))).toBe(
      'INVALID_TRANSITION',
    );
  });

  it('hủy: người tạo hoặc ADMIN; không hủy PR đã duyệt', () => {
    expect(cancel(draft(), buyer, at).status).toBe('CANCELLED');
    expect(code(() => cancel(draft(), { ...buyer, id: 'x' }, at))).toBe('FORBIDDEN_ACTION');
    expect(cancel(draft(), { id: 'adm', companyId: 'acme', role: 'ADMIN' }, at).status).toBe(
      'CANCELLED',
    );
    const approved = decide(
      submit(draft(), buyer, RULES, at),
      approver('a', 0),
      'APPROVE',
      null,
      at,
    );
    expect(code(() => cancel(approved, buyer, at))).toBe('INVALID_TRANSITION');
  });
});

describe('allowedActions – UI không tự đoán luật', () => {
  const asApprover = (a: Approver) => a;
  it('theo vai trò và trạng thái', () => {
    const d = draft(60_000_000);
    expect(allowedActions(d, { ...asApprover(approver('buyer', 0)), role: 'BUYER' })).toEqual([
      'SUBMIT',
      'CANCEL',
    ]);
    const pending = submit(d, buyer, RULES, at);
    expect(allowedActions(pending, approver('a1', 0))).toEqual(['APPROVE', 'REJECT']);
    const lvl2 = decide(pending, approver('a1', 0), 'APPROVE', null, at);
    expect(allowedActions(lvl2, approver('a2', 1_000))).toEqual([]); // thiếu hạn mức cấp 2
  });
});

describe('validateRules', () => {
  it('level liên tục, minTotal không giảm', () => {
    expect(() => validateRules(RULES)).not.toThrow();
    expect(code(() => validateRules([{ level: 2, minTotal: 0, minApproverLimit: 0 }]))).toBe(
      'INVALID_APPROVAL_RULES',
    );
    expect(
      code(() =>
        validateRules([
          { level: 1, minTotal: 100, minApproverLimit: 0 },
          { level: 2, minTotal: 50, minApproverLimit: 0 },
        ]),
      ),
    ).toBe('INVALID_APPROVAL_RULES');
  });
});
