import type { AuthUser } from '../../../common/auth/auth.types';
import { DomainError } from '../../../common/errors/domain-error';

/**
 * DOMAIN Purchase Request — hàm thuần, không I/O (cùng khuôn với catalog/domain/pricing.ts).
 * Use case: đọc → gọi hàm ở đây để ra trạng thái mới → lưu (kèm optimistic locking).
 */

export type PrStatus = 'DRAFT' | 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
export type PrAction = 'SUBMIT' | 'APPROVE' | 'REJECT' | 'CANCEL';
export type Decision = 'PENDING' | 'APPROVED' | 'REJECTED';

export interface PrLine {
  lineNo: number;
  productId: string;
  sku: string;
  productName: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  priceSource: 'TIER' | 'CONTRACT';
  lineTotal: number;
}

export interface ApprovalStep {
  level: number;
  minApproverLimit: number;
  decision: Decision;
  decidedBy: string | null;
  comment: string | null;
  decidedAt: Date | null;
}

export interface PurchaseRequest {
  id: string;
  companyId: string;
  requesterId: string;
  title: string;
  note: string | null;
  status: PrStatus;
  totalAmount: number;
  version: number;
  submittedAt: Date | null;
  decidedAt: Date | null;
  createdAt: Date;
  lines: PrLine[];
  steps: ApprovalStep[];
}

/** Quy tắc duyệt của công ty (bảng approval_rules). */
export interface ApprovalRule {
  level: number;
  minTotal: number;
  minApproverLimit: number;
}

/** Người duyệt: thông tin cần để kiểm tra quyền (approvalLimit không nằm trong JWT). */
export interface Approver extends AuthUser {
  approvalLimit: number;
  isActive: boolean;
}

/** Không cấu hình gì → 1 cấp, ai có quyền duyệt cũng được. */
export const DEFAULT_RULES: ApprovalRule[] = [{ level: 1, minTotal: 0, minApproverLimit: 0 }];

// ---------------- State machine ----------------

const TRANSITIONS: Record<PrStatus, Partial<Record<PrAction, PrStatus>>> = {
  DRAFT: { SUBMIT: 'PENDING_APPROVAL', CANCEL: 'CANCELLED' },
  // APPROVE ở đây là "duyệt 1 bước"; chỉ bước cuối mới đưa PR sang APPROVED (xem decide()).
  PENDING_APPROVAL: { APPROVE: 'APPROVED', REJECT: 'REJECTED', CANCEL: 'CANCELLED' },
  APPROVED: {},
  REJECTED: {},
  CANCELLED: {},
};

export function assertTransition(from: PrStatus, action: PrAction): PrStatus {
  const to = TRANSITIONS[from][action];
  if (!to) throw new DomainError('INVALID_TRANSITION', `Không thể ${action} khi PR đang ${from}`);
  return to;
}

/** Bước đang chờ duyệt (level nhỏ nhất còn PENDING). */
export const currentStep = (pr: PurchaseRequest): ApprovalStep | undefined =>
  pr.steps.find((s) => s.decision === 'PENDING');

/** Kiểm tra người duyệt cho bước hiện tại; trả lý do từ chối hoặc null nếu hợp lệ. */
function approverProblem(pr: PurchaseRequest, actor: Approver): string | null {
  if (actor.companyId !== pr.companyId) return 'PR không thuộc công ty của bạn';
  if (actor.role !== 'APPROVER' && actor.role !== 'ADMIN') return 'Bạn không có quyền duyệt';
  if (!actor.isActive) return 'Tài khoản đã bị khóa';
  // Tách biệt nhiệm vụ (segregation of duties): không tự duyệt yêu cầu của chính mình.
  if (actor.id === pr.requesterId) return 'Không được tự duyệt PR của chính mình';
  // Một người không duyệt 2 cấp của cùng PR (nếu không, "2 cấp" chỉ là hình thức).
  if (pr.steps.some((s) => s.decidedBy === actor.id)) return 'Bạn đã duyệt một cấp của PR này';
  const step = currentStep(pr);
  if (step && actor.approvalLimit < step.minApproverLimit) {
    return `Cấp ${step.level} cần hạn mức duyệt ≥ ${step.minApproverLimit}`;
  }
  return null;
}

/** Hành động người dùng được phép làm → API trả về để UI không tự đoán luật. */
export function allowedActions(pr: PurchaseRequest, actor: Approver): PrAction[] {
  const out: PrAction[] = [];
  const isOwnerOrAdmin = actor.id === pr.requesterId || actor.role === 'ADMIN';
  if (pr.status === 'DRAFT' && actor.id === pr.requesterId) out.push('SUBMIT');
  if (pr.status === 'PENDING_APPROVAL' && approverProblem(pr, actor) === null) {
    out.push('APPROVE', 'REJECT');
  }
  if ((pr.status === 'DRAFT' || pr.status === 'PENDING_APPROVAL') && isOwnerOrAdmin) {
    out.push('CANCEL');
  }
  return out;
}

// ---------------- Hành động ----------------

/** Tổng tiền = Σ lineTotal (số nguyên VND). */
export const sumLines = (lines: PrLine[]) => lines.reduce((s, l) => s + l.lineTotal, 0);

/**
 * Sinh các bước duyệt khi submit: lấy mọi quy tắc có minTotal ≤ tổng tiền, theo level tăng dần.
 * PR nhỏ → ít cấp; PR lớn → nhiều cấp. Quy tắc là DỮ LIỆU, đổi được không cần deploy.
 */
export function buildSteps(total: number, rules: ApprovalRule[]): ApprovalStep[] {
  const source = rules.length ? rules : DEFAULT_RULES;
  const steps = source
    .filter((r) => total >= r.minTotal)
    .sort((a, b) => a.level - b.level)
    .map((r) => ({
      level: r.level,
      minApproverLimit: r.minApproverLimit,
      decision: 'PENDING' as const,
      decidedBy: null,
      comment: null,
      decidedAt: null,
    }));
  // Có quy tắc nhưng PR nhỏ hơn mọi ngưỡng → vẫn cần ít nhất 1 cấp (cấp thấp nhất).
  if (steps.length === 0) {
    const lowest = [...source].sort((a, b) => a.level - b.level)[0];
    steps.push({
      level: lowest.level,
      minApproverLimit: lowest.minApproverLimit,
      decision: 'PENDING',
      decidedBy: null,
      comment: null,
      decidedAt: null,
    });
  }
  return steps;
}

export function submit(
  pr: PurchaseRequest,
  actor: AuthUser,
  rules: ApprovalRule[],
  at: Date,
): PurchaseRequest {
  if (actor.id !== pr.requesterId) {
    throw new DomainError('FORBIDDEN_ACTION', 'Chỉ người tạo được gửi duyệt');
  }
  const status = assertTransition(pr.status, 'SUBMIT');
  if (pr.lines.length === 0) throw new DomainError('EMPTY_PR', 'PR chưa có dòng hàng');
  return { ...pr, status, submittedAt: at, steps: buildSteps(pr.totalAmount, rules) };
}

export function decide(
  pr: PurchaseRequest,
  actor: Approver,
  decision: 'APPROVE' | 'REJECT',
  comment: string | null,
  at: Date,
): PurchaseRequest {
  assertTransition(pr.status, decision);
  const problem = approverProblem(pr, actor);
  if (problem) throw new DomainError('FORBIDDEN_ACTION', problem);
  const step = currentStep(pr)!; // PENDING_APPROVAL luôn còn ít nhất 1 bước PENDING
  if (decision === 'REJECT' && !comment?.trim()) {
    throw new DomainError('COMMENT_REQUIRED', 'Từ chối phải ghi lý do');
  }

  const steps = pr.steps.map((s) =>
    s.level === step.level
      ? {
          ...s,
          decision: decision === 'APPROVE' ? ('APPROVED' as const) : ('REJECTED' as const),
          decidedBy: actor.id,
          comment: comment?.trim() || null,
          decidedAt: at,
        }
      : s,
  );

  if (decision === 'REJECT') return { ...pr, steps, status: 'REJECTED', decidedAt: at };
  const done = steps.every((s) => s.decision === 'APPROVED');
  return done ? { ...pr, steps, status: 'APPROVED', decidedAt: at } : { ...pr, steps };
}

export function cancel(pr: PurchaseRequest, actor: AuthUser, at: Date): PurchaseRequest {
  if (actor.id !== pr.requesterId && actor.role !== 'ADMIN') {
    throw new DomainError('FORBIDDEN_ACTION', 'Chỉ người tạo hoặc ADMIN được hủy');
  }
  return { ...pr, status: assertTransition(pr.status, 'CANCEL'), decidedAt: at };
}

/** Kiểm tra bộ quy tắc trước khi lưu. */
export function validateRules(rules: ApprovalRule[]): void {
  const levels = rules.map((r) => r.level).sort((a, b) => a - b);
  if (levels.some((l, i) => l !== i + 1)) {
    throw new DomainError('INVALID_APPROVAL_RULES', 'level phải liên tục 1, 2, 3...');
  }
  const byLevel = [...rules].sort((a, b) => a.level - b.level);
  for (let i = 1; i < byLevel.length; i++) {
    if (byLevel[i].minTotal < byLevel[i - 1].minTotal) {
      throw new DomainError('INVALID_APPROVAL_RULES', 'minTotal phải không giảm theo level');
    }
  }
}
