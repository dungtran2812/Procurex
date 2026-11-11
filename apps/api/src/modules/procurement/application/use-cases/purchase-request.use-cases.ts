import { Injectable } from '@nestjs/common';
import type { AuthUser } from '../../../../common/auth/auth.types';
import { DomainError } from '../../../../common/errors/domain-error';
import { AuditLog, Outbox, UnitOfWork } from '../../../../common/persistence/ports';
import { Clock } from '../../../../common/time/clock';
import {
  ApprovalRule,
  PrAction,
  PrStatus,
  PurchaseRequest,
  allowedActions,
  cancel,
  decide,
  submit,
  sumLines,
  validateRules,
} from '../../domain/purchase-request';
import {
  ApprovalRuleRepository,
  ApproverDirectory,
  PricingPort,
  PrSummary,
  PurchaseRequestRepository,
} from '../ports';

export interface CreatePrInput {
  title: string;
  note?: string;
  lines: Array<{ productId: string; quantity: number }>;
}

/** PR trả ra API: kèm allowedActions tính theo người đang xem. */
export type PrView = PurchaseRequest & { allowedActions: PrAction[] };

const ENTITY = 'PurchaseRequest';

/**
 * Khuôn chung cho mọi thay đổi trạng thái:
 *   1. đọc PR (lọc theo tenant)            ─┐
 *   2. hàm domain thuần → PR mới            │ cùng 1 transaction (UnitOfWork)
 *   3. save với optimistic locking          │
 *   4. audit + outbox event                ─┘
 * Bất kỳ bước nào lỗi → rollback hết: không có PR đổi trạng thái mà thiếu audit/event.
 */
@Injectable()
export class PurchaseRequestService {
  constructor(
    private readonly prs: PurchaseRequestRepository,
    private readonly rules: ApprovalRuleRepository,
    private readonly pricing: PricingPort,
    private readonly approvers: ApproverDirectory,
    private readonly uow: UnitOfWork,
    private readonly audit: AuditLog,
    private readonly outbox: Outbox,
    private readonly clock: Clock,
  ) {}

  async create(actor: AuthUser, input: CreatePrInput): Promise<PrView> {
    if (input.lines.length === 0) throw new DomainError('EMPTY_PR', 'PR chưa có dòng hàng');
    const seen = new Set<string>();
    for (const l of input.lines) {
      if (seen.has(l.productId)) {
        throw new DomainError('EMPTY_PR', 'Một sản phẩm chỉ xuất hiện 1 dòng, hãy gộp số lượng');
      }
      seen.add(l.productId);
    }

    // Báo giá NGOÀI transaction (đọc catalog + cache, có thể chậm) → transaction ngắn.
    const priced = await Promise.all(
      input.lines.map((l) => this.pricing.price(actor, l.productId, l.quantity)),
    );
    const lines = priced.map((p, i) => ({ ...p, lineNo: i + 1 }));

    const pr = await this.uow.run(async () => {
      const created = await this.prs.create({
        companyId: actor.companyId,
        requesterId: actor.id,
        title: input.title.trim(),
        note: input.note?.trim() || null,
        totalAmount: sumLines(lines),
        lines,
      });
      await this.audit.append({
        companyId: actor.companyId,
        entityType: ENTITY,
        entityId: created.id,
        action: 'CREATE',
        toStatus: created.status,
        actorId: actor.id,
        data: { totalAmount: created.totalAmount, lineCount: lines.length },
      });
      return created;
    });
    return this.view(pr, actor);
  }

  async get(actor: AuthUser, id: string): Promise<PrView> {
    return this.view(await this.load(actor, id), actor);
  }

  async list(
    actor: AuthUser,
    q: { status?: PrStatus; page: number; pageSize: number },
  ): Promise<{ items: PrSummary[]; total: number; page: number; pageSize: number }> {
    const { items, total } = await this.prs.list({
      companyId: actor.companyId,
      requesterId: actor.role === 'BUYER' ? actor.id : undefined,
      ...q,
    });
    return { items, total, page: q.page, pageSize: q.pageSize };
  }

  async history(actor: AuthUser, id: string) {
    await this.load(actor, id); // kiểm tra quyền xem
    return this.audit.list(actor.companyId, ENTITY, id);
  }

  submit(actor: AuthUser, id: string): Promise<PrView> {
    return this.change(actor, id, 'SUBMIT', async (pr) =>
      submit(pr, actor, await this.rules.list(actor.companyId), this.clock.now()),
    );
  }

  decide(
    actor: AuthUser,
    id: string,
    decision: 'APPROVE' | 'REJECT',
    comment?: string,
  ): Promise<PrView> {
    return this.change(actor, id, decision, async (pr) =>
      decide(pr, await this.approvers.get(actor), decision, comment ?? null, this.clock.now()),
    );
  }

  cancel(actor: AuthUser, id: string): Promise<PrView> {
    return this.change(actor, id, 'CANCEL', async (pr) => cancel(pr, actor, this.clock.now()));
  }

  // ---------------- nội bộ ----------------

  private async change(
    actor: AuthUser,
    id: string,
    action: PrAction,
    apply: (pr: PurchaseRequest) => Promise<PurchaseRequest>,
  ): Promise<PrView> {
    const saved = await this.uow.run(async () => {
      const before = await this.load(actor, id);
      const after = await apply(before);
      const result = await this.prs.save(after);

      await this.audit.append({
        companyId: actor.companyId,
        entityType: ENTITY,
        entityId: id,
        action,
        fromStatus: before.status,
        toStatus: result.status,
        actorId: actor.id,
        data: action === 'APPROVE' || action === 'REJECT' ? stepData(before, result) : {},
      });
      // Chỉ phát event khi trạng thái PR thực sự đổi (duyệt cấp 1/2 thì chưa).
      if (before.status !== result.status) {
        await this.outbox.add({
          type: `pr.${result.status.toLowerCase()}`,
          payload: {
            prId: id,
            companyId: actor.companyId,
            requesterId: result.requesterId,
            totalAmount: result.totalAmount,
            actorId: actor.id,
          },
        });
      }
      return result;
    });
    return this.view(saved, actor);
  }

  private async load(actor: AuthUser, id: string): Promise<PurchaseRequest> {
    const pr = await this.prs.findById(actor.companyId, id);
    // BUYER chỉ xem PR của mình; trả 404 (không lộ là PR tồn tại).
    if (!pr || (actor.role === 'BUYER' && pr.requesterId !== actor.id)) {
      throw new DomainError('PR_NOT_FOUND', 'Không tìm thấy PR');
    }
    return pr;
  }

  private async view(pr: PurchaseRequest, actor: AuthUser): Promise<PrView> {
    const approver = await this.approvers.get(actor);
    return { ...pr, allowedActions: allowedActions(pr, approver) };
  }
}

function stepData(before: PurchaseRequest, after: PurchaseRequest) {
  const step = after.steps.find(
    (s, i) => s.decision !== before.steps[i]?.decision && s.decision !== 'PENDING',
  );
  return step ? { level: step.level, decision: step.decision, comment: step.comment } : {};
}

@Injectable()
export class ApprovalRuleService {
  constructor(
    private readonly rules: ApprovalRuleRepository,
    private readonly uow: UnitOfWork,
    private readonly audit: AuditLog,
  ) {}

  list(actor: AuthUser): Promise<ApprovalRule[]> {
    return this.rules.list(actor.companyId);
  }

  async replace(actor: AuthUser, rules: ApprovalRule[]): Promise<ApprovalRule[]> {
    validateRules(rules);
    await this.uow.run(async () => {
      await this.rules.replace(actor.companyId, rules);
      await this.audit.append({
        companyId: actor.companyId,
        entityType: 'ApprovalRules',
        entityId: actor.companyId,
        action: 'REPLACE',
        actorId: actor.id,
        data: { rules },
      });
    });
    return this.rules.list(actor.companyId);
  }
}
