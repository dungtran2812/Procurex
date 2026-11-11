import { Injectable } from '@nestjs/common';
import type { AuthUser } from '../../../common/auth/auth.types';
import { DomainError } from '../../../common/errors/domain-error';
import { JobQueue } from '../../../common/events/ports';
import { AuditLog, Outbox, UnitOfWork } from '../../../common/persistence/ports';
import { Clock } from '../../../common/time/clock';
import {
  QuoteInput,
  Rfq,
  RfqStatus,
  assertCanOpenRfq,
  award,
  cancel,
  close,
  hashInviteToken,
  newPoNumber,
  priceQuote,
  rankQuotes,
} from '../domain/sourcing';
import { PurchaseRequestReader, SourcingRepository } from './ports';

export const ERP_QUEUE = 'erp-sync';
export const RFQ_DEADLINE_QUEUE = 'rfq-deadline';

/** Người dùng "hệ thống" cho job nền (audit vẫn có actorId). */
export const SYSTEM_ACTOR_ID = '00000000-0000-0000-0000-000000000000';

@Injectable()
export class SourcingService {
  constructor(
    private readonly repo: SourcingRepository,
    private readonly prs: PurchaseRequestReader,
    private readonly uow: UnitOfWork,
    private readonly audit: AuditLog,
    private readonly outbox: Outbox,
    private readonly queue: JobQueue,
    private readonly clock: Clock,
  ) {}

  // ---------------- Nhà cung cấp ----------------

  createSupplier(actor: AuthUser, s: { name: string; email: string; taxCode?: string }) {
    return this.repo.createSupplier({
      companyId: actor.companyId,
      name: s.name.trim(),
      email: s.email.trim().toLowerCase(),
      taxCode: s.taxCode?.trim() || null,
    });
  }

  listSuppliers(actor: AuthUser) {
    return this.repo.listSuppliers(actor.companyId);
  }

  // ---------------- RFQ (phía người mua) ----------------

  async createRfq(actor: AuthUser, input: { prId: string; supplierIds: string[]; deadline: Date }) {
    const supplierIds = [...new Set(input.supplierIds)];
    const now = this.clock.now();
    // Đọc PR qua module procurement (kiểm tra tenant + quyền xem ở đó).
    const pr = await this.prs.get(actor, input.prId);
    assertCanOpenRfq(pr.status, input.deadline, now, supplierIds.length);
    const suppliers = await this.repo.findSuppliers(actor.companyId, supplierIds);
    if (suppliers.length !== supplierIds.length) {
      throw new DomainError('SUPPLIER_NOT_FOUND', 'Có NCC không tồn tại hoặc đã ngừng hoạt động');
    }

    const rfq = await this.uow.run(async () => {
      const created = await this.repo.createRfq(
        {
          companyId: actor.companyId,
          prId: input.prId,
          createdBy: actor.id,
          deadline: input.deadline,
          lines: pr.lines,
        },
        supplierIds,
      );
      await this.audit.append({
        companyId: actor.companyId,
        entityType: 'Rfq',
        entityId: created.id,
        action: 'OPEN',
        toStatus: 'OPEN',
        actorId: actor.id,
        data: { prId: input.prId, supplierIds },
      });
      // Gửi lời mời + hẹn giờ đóng RFQ là việc của worker (xem sourcing.handlers.ts).
      await this.outbox.add({
        type: 'rfq.opened',
        payload: { rfqId: created.id, companyId: actor.companyId },
      });
      return created;
    });
    return this.getRfq(actor, rfq.id, rfq);
  }

  async getRfq(actor: AuthUser, id: string, preloaded?: Rfq) {
    const rfq = preloaded ?? (await this.loadRfq(actor.companyId, id));
    const [invitations, quotes] = await Promise.all([
      this.repo.listInvitations(rfq.id),
      this.repo.listQuotes(rfq.id),
    ]);
    // Người mua thấy mọi báo giá (xếp hạng); NCC chỉ thấy báo giá của mình (viewInvitation).
    return { ...rfq, invitations, quotes: rankQuotes(quotes) };
  }

  listRfqs(actor: AuthUser, status?: RfqStatus) {
    return this.repo.listRfqs(actor.companyId, status);
  }

  closeRfq(actor: AuthUser, id: string) {
    return this.changeRfq(actor.companyId, actor.id, id, 'CLOSE', (r) =>
      close(r, this.clock.now()),
    );
  }

  cancelRfq(actor: AuthUser, id: string) {
    return this.changeRfq(actor.companyId, actor.id, id, 'CANCEL', (r) =>
      cancel(r, this.clock.now()),
    );
  }

  /** Job hẹn giờ: tới hạn mà RFQ còn OPEN → đóng. Đã đóng/hủy → bỏ qua (idempotent). */
  async closeOnDeadline(companyId: string, rfqId: string): Promise<void> {
    const rfq = await this.repo.findRfq(companyId, rfqId);
    if (!rfq || rfq.status !== 'OPEN' || this.clock.now() < rfq.deadline) return;
    await this.changeRfq(companyId, SYSTEM_ACTOR_ID, rfqId, 'CLOSE', (r) =>
      close(r, this.clock.now()),
    );
  }

  /** Chọn thầu → tạo PO (snapshot báo giá) trong CÙNG transaction, phát 'po.issued'. */
  async award(actor: AuthUser, rfqId: string, quoteId: string, reason?: string) {
    const now = this.clock.now();
    const po = await this.uow.run(async () => {
      const rfq = await this.loadRfq(actor.companyId, rfqId);
      const quotes = await this.repo.listQuotes(rfqId);
      const awarded = await this.repo.saveRfq(award(rfq, quoteId, quotes, reason ?? null, now));
      const quote = quotes.find((q) => q.quoteId === quoteId)!; // award() đã kiểm tra tồn tại

      const priceByLine = new Map(quote.lines.map((l) => [l.lineNo, l]));
      const created = await this.repo.createPo({
        companyId: actor.companyId,
        poNumber: newPoNumber(now),
        rfqId,
        prId: rfq.prId,
        supplierId: quote.supplierId,
        supplierName: quote.supplierName,
        quoteId,
        totalAmount: quote.totalAmount,
        lines: rfq.lines.map((l) => ({ ...l, ...priceByLine.get(l.lineNo)! })),
        issuedBy: actor.id,
      });
      await this.audit.append({
        companyId: actor.companyId,
        entityType: 'Rfq',
        entityId: rfqId,
        action: 'AWARD',
        fromStatus: rfq.status,
        toStatus: awarded.status,
        actorId: actor.id,
        data: { quoteId, poId: created.id, reason: reason ?? null },
      });
      await this.outbox.add({
        type: 'po.issued',
        payload: { poId: created.id, companyId: actor.companyId, supplierId: quote.supplierId },
      });
      return created;
    });
    return po;
  }

  // ---------------- Phía nhà cung cấp (xác thực bằng token) ----------------

  async viewInvitation(token: string) {
    const inv = await this.findInvitation(token);
    const quotes = await this.repo.listQuotes(inv.rfqId);
    const mine = quotes.find((q) => q.invitationId === inv.id) ?? null;
    // NCC chỉ thấy RFQ + báo giá CỦA MÌNH, không thấy NCC khác.
    return {
      supplierName: inv.supplierName,
      rfq: {
        id: inv.rfq.id,
        status: inv.rfq.status,
        deadline: inv.rfq.deadline,
        lines: inv.rfq.lines,
        acceptingQuotes: inv.rfq.status === 'OPEN' && this.clock.now() < inv.rfq.deadline,
      },
      myQuote: mine,
    };
  }

  async submitQuote(token: string, input: QuoteInput) {
    const inv = await this.findInvitation(token);
    const now = this.clock.now();
    const priced = priceQuote(inv.rfq, input, now);
    await this.uow.run(async () => {
      await this.repo.upsertQuote(
        inv.id,
        {
          ...priced,
          leadTimeDays: input.leadTimeDays,
          validUntil: input.validUntil,
          note: input.note?.trim() || null,
        },
        now,
      );
      await this.audit.append({
        companyId: inv.companyId,
        entityType: 'Rfq',
        entityId: inv.rfqId,
        action: inv.respondedAt ? 'QUOTE_UPDATED' : 'QUOTE_SUBMITTED',
        actorId: SYSTEM_ACTOR_ID,
        data: { supplierId: inv.supplierId, totalAmount: priced.totalAmount },
      });
    });
    return this.viewInvitation(token);
  }

  // ---------------- PO ----------------

  listPos(actor: AuthUser) {
    return this.repo.listPos(actor.companyId);
  }

  async getPo(actor: AuthUser, id: string) {
    const po = await this.repo.findPo(actor.companyId, id);
    if (!po) throw new DomainError('PO_NOT_FOUND', 'Không tìm thấy PO');
    return po;
  }

  /** ADMIN bấm đồng bộ lại sau khi ERP hết lỗi (job cũ đã FAILED hẳn). */
  async retryErpSync(actor: AuthUser, id: string) {
    const po = await this.getPo(actor, id);
    if (po.erpSyncStatus === 'SYNCED') return po;
    await this.repo.updateErpSync(id, { erpSyncStatus: 'PENDING', erpLastError: null });
    await this.queue.add(
      ERP_QUEUE,
      'push',
      { poId: id, companyId: actor.companyId },
      { jobId: `erp-${id}-retry-${Date.now()}`, attempts: 6, backoffMs: 2000 },
    );
    return this.getPo(actor, id);
  }

  // ---------------- nội bộ ----------------

  private async findInvitation(token: string) {
    const inv = await this.repo.findInvitationByTokenHash(hashInviteToken(token));
    if (!inv) throw new DomainError('INVALID_INVITE_TOKEN', 'Link báo giá không hợp lệ');
    return inv;
  }

  private async loadRfq(companyId: string, id: string): Promise<Rfq> {
    const rfq = await this.repo.findRfq(companyId, id);
    if (!rfq) throw new DomainError('RFQ_NOT_FOUND', 'Không tìm thấy RFQ');
    return rfq;
  }

  private async changeRfq(
    companyId: string,
    actorId: string,
    id: string,
    action: string,
    apply: (r: Rfq) => Rfq,
  ) {
    return this.uow.run(async () => {
      const before = await this.loadRfq(companyId, id);
      const after = await this.repo.saveRfq(apply(before));
      await this.audit.append({
        companyId,
        entityType: 'Rfq',
        entityId: id,
        action,
        fromStatus: before.status,
        toStatus: after.status,
        actorId,
      });
      await this.outbox.add({
        type: `rfq.${after.status.toLowerCase()}`,
        payload: { rfqId: id, companyId, createdBy: after.createdBy },
      });
      return after;
    });
  }
}
