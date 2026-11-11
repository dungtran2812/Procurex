import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { EventBus, JobQueue } from '../../../common/events/ports';
import { Notifier } from '../../../common/notifications/ports';
import { UnitOfWork } from '../../../common/persistence/ports';
import { Clock } from '../../../common/time/clock';
import { ENV, Env } from '../../../config/env';
import { issueInviteToken } from '../domain/sourcing';
import { ErpPort, SourcingRepository } from './ports';
import { ERP_QUEUE, RFQ_DEADLINE_QUEUE, SourcingService } from './sourcing.service';

/**
 * Phản ứng với domain event + job hẹn giờ của sourcing.
 * Mọi handler phải IDEMPOTENT: event/job có thể được giao nhiều lần.
 */
@Injectable()
export class SourcingHandlers implements OnModuleInit {
  private readonly logger = new Logger('Sourcing');

  constructor(
    private readonly events: EventBus,
    private readonly queue: JobQueue,
    private readonly repo: SourcingRepository,
    private readonly service: SourcingService,
    private readonly erp: ErpPort,
    private readonly notifier: Notifier,
    private readonly uow: UnitOfWork,
    private readonly clock: Clock,
    @Inject(ENV) private readonly env: Env,
  ) {}

  onModuleInit(): void {
    this.events.on('rfq.opened', 'sourcing.send-invitations', (p) =>
      this.sendInvitations(String(p.companyId), String(p.rfqId)),
    );
    this.events.on('rfq.closed', 'sourcing.notify-buyer-closed', async (p, ctx) =>
      this.notifier.send({
        companyId: String(p.companyId),
        recipient: `user:${String(p.createdBy)}`,
        subject: 'RFQ đã đóng – có thể chọn nhà cung cấp',
        body: `RFQ ${String(p.rfqId)} đã đóng nhận báo giá.`,
        dedupeKey: `${ctx.eventId}-buyer`,
      }),
    );
    this.events.on('po.issued', 'sourcing.erp-enqueue', (p) =>
      this.queue.add(
        ERP_QUEUE,
        'push',
        { poId: String(p.poId), companyId: String(p.companyId) },
        // jobId cố định theo PO → event giao lại cũng không tạo job ERP thứ 2.
        { jobId: `erp-${String(p.poId)}`, attempts: 6, backoffMs: 2000 },
      ),
    );
    this.events.on('po.issued', 'sourcing.notify-supplier-po', (p) =>
      this.notifySupplierPo(String(p.companyId), String(p.poId)),
    );

    this.queue.process(RFQ_DEADLINE_QUEUE, (d) =>
      this.service.closeOnDeadline(String(d.companyId), String(d.rfqId)),
    );
    this.queue.process(ERP_QUEUE, (d, meta) =>
      this.syncPoToErp(String(d.companyId), String(d.poId), meta.final),
    );
  }

  /** Sinh token cho từng lời mời CHƯA gửi, lưu hash, gửi link; rồi hẹn giờ đóng RFQ. */
  async sendInvitations(companyId: string, rfqId: string): Promise<void> {
    const rfq = await this.repo.findRfq(companyId, rfqId);
    if (!rfq || rfq.status !== 'OPEN') return;
    for (const inv of await this.repo.listInvitations(rfqId)) {
      if (inv.sentAt) continue; // đã gửi ở lần chạy trước
      const { token, hash } = issueInviteToken();
      await this.repo.setInvitationToken(inv.id, hash, this.clock.now());
      await this.notifier.send({
        companyId,
        recipient: inv.supplierEmail,
        subject: `Mời báo giá – hạn ${rfq.deadline.toISOString()}`,
        body: `Kính gửi ${inv.supplierName}, vui lòng báo giá tại: ${this.env.PUBLIC_APP_URL}/rfq/${token}`,
        dedupeKey: `rfq-invite-${inv.id}`,
      });
    }
    await this.queue.add(
      RFQ_DEADLINE_QUEUE,
      'close',
      { companyId, rfqId },
      {
        jobId: `rfq-deadline-${rfqId}`,
        delayMs: Math.max(0, rfq.deadline.getTime() - this.clock.now().getTime()),
      },
    );
  }

  private async notifySupplierPo(companyId: string, poId: string): Promise<void> {
    const po = await this.repo.findPo(companyId, poId);
    if (!po) return;
    const [supplier] = await this.repo.findSuppliers(companyId, [po.supplierId]);
    if (!supplier) return;
    await this.notifier.send({
      companyId,
      recipient: supplier.email,
      subject: `Đơn đặt hàng ${po.poNumber}`,
      body: `Chúc mừng ${po.supplierName} trúng thầu. Tổng giá trị: ${po.totalAmount} VND.`,
      dedupeKey: `po-issued-${poId}`,
    });
  }

  /**
   * Đồng bộ PO sang ERP. Gọi hệ thống ngoài KHÔNG nằm trong transaction (không rollback được),
   * nên idempotency dựa vào ERP (khoá theo poNumber) + kiểm tra SYNCED trước khi gọi.
   * Lỗi → ghi attempts/lỗi rồi ném lại để BullMQ retry với backoff mũ;
   * lần cuối vẫn lỗi → FAILED + báo ADMIN (sửa xong bấm "đồng bộ lại").
   */
  async syncPoToErp(companyId: string, poId: string, final: boolean): Promise<void> {
    const po = await this.repo.findPo(companyId, poId);
    if (!po || po.erpSyncStatus === 'SYNCED') return;
    try {
      const { erpRef } = await this.erp.pushPurchaseOrder(po);
      await this.repo.updateErpSync(poId, {
        erpSyncStatus: 'SYNCED',
        erpRef,
        erpLastError: null,
        incrementAttempts: true,
      });
      this.logger.log(`PO ${po.poNumber} → ERP ${erpRef}`);
    } catch (e) {
      const message = (e as Error).message;
      await this.uow.run(async () => {
        await this.repo.updateErpSync(poId, {
          erpSyncStatus: final ? 'FAILED' : 'PENDING',
          erpLastError: message,
          incrementAttempts: true,
        });
        if (final) {
          await this.notifier.send({
            companyId,
            recipient: `admins:${companyId}`,
            subject: `Đồng bộ ERP thất bại: ${po.poNumber}`,
            body: `Lỗi cuối: ${message}. Vào PO và bấm "đồng bộ lại" khi ERP hoạt động.`,
            dedupeKey: `erp-failed-${poId}-${po.erpAttempts}`,
          });
        }
      });
      throw e;
    }
  }
}
