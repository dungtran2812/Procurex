import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { EventBus, JobQueue } from '../../../common/events/ports';
import { Notifier } from '../../../common/notifications/ports';
import { ENV, Env } from '../../../config/env';
import { PurchaseRequestRepository } from './ports';

export const APPROVAL_SLA_QUEUE = 'approval-sla';

/**
 * Workflow phụ của PR (chạy nền, idempotent):
 *  - Thông báo người duyệt / người tạo theo từng trạng thái.
 *  - SLA: gửi duyệt xong hẹn giờ APPROVAL_SLA_HOURS; tới giờ PR vẫn chờ → nhắc + escalate.
 */
@Injectable()
export class ProcurementHandlers implements OnModuleInit {
  constructor(
    private readonly events: EventBus,
    private readonly queue: JobQueue,
    private readonly prs: PurchaseRequestRepository,
    private readonly notifier: Notifier,
    @Inject(ENV) private readonly env: Env,
  ) {}

  onModuleInit(): void {
    this.events.on('pr.pending_approval', 'procurement.notify-approvers', async (p, ctx) => {
      await this.notifier.send({
        companyId: String(p.companyId),
        recipient: `approvers:${String(p.companyId)}`,
        subject: 'Có PR chờ duyệt',
        body: `PR ${String(p.prId)} trị giá ${Number(p.totalAmount)} VND đang chờ duyệt.`,
        dedupeKey: `${ctx.eventId}-approvers`,
      });
    });

    this.events.on('pr.pending_approval', 'procurement.schedule-sla', (p) =>
      this.queue.add(
        APPROVAL_SLA_QUEUE,
        'remind',
        { companyId: String(p.companyId), prId: String(p.prId), round: 1 },
        {
          jobId: `pr-sla-${String(p.prId)}-1`,
          delayMs: this.env.APPROVAL_SLA_HOURS * 3600 * 1000,
        },
      ),
    );

    for (const status of ['approved', 'rejected', 'cancelled'] as const) {
      this.events.on(`pr.${status}`, 'procurement.notify-requester', async (p, ctx) => {
        await this.notifier.send({
          companyId: String(p.companyId),
          recipient: `user:${String(p.requesterId)}`,
          subject: `PR đã ${{ approved: 'được duyệt', rejected: 'bị từ chối', cancelled: 'bị hủy' }[status]}`,
          body: `PR ${String(p.prId)}.`,
          dedupeKey: `${ctx.eventId}-requester`,
        });
      });
    }

    this.queue.process(APPROVAL_SLA_QUEUE, (d) =>
      this.remind(String(d.companyId), String(d.prId), Number(d.round)),
    );
  }

  /** Tới hạn SLA: PR còn chờ → nhắc người duyệt + báo ADMIN, hẹn vòng nhắc tiếp theo (tối đa 3). */
  async remind(companyId: string, prId: string, round: number): Promise<void> {
    const pr = await this.prs.findById(companyId, prId);
    if (!pr || pr.status !== 'PENDING_APPROVAL') return; // đã xử lý xong → không làm gì
    const level = pr.steps.find((s) => s.decision === 'PENDING')?.level;
    await this.notifier.send({
      companyId,
      recipient: round >= 2 ? `admins:${companyId}` : `approvers:${companyId}`,
      subject: `${round >= 2 ? '[ESCALATE] ' : ''}PR quá hạn duyệt (cấp ${level})`,
      body: `PR "${pr.title}" đã chờ quá ${this.env.APPROVAL_SLA_HOURS * round} giờ.`,
      dedupeKey: `pr-sla-${prId}-${round}`,
    });
    if (round < 3) {
      await this.queue.add(
        APPROVAL_SLA_QUEUE,
        'remind',
        { companyId, prId, round: round + 1 },
        {
          jobId: `pr-sla-${prId}-${round + 1}`,
          delayMs: this.env.APPROVAL_SLA_HOURS * 3600 * 1000,
        },
      );
    }
  }
}
