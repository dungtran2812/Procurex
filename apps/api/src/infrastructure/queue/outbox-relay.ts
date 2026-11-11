import {
  Inject,
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import { JobQueue } from '../../common/events/ports';
import { ENV, Env } from '../../config/env';
import { PrismaService } from '../prisma/prisma.service';
import { EVENTS_QUEUE } from './event-bus';

const BATCH = 100;

/**
 * Outbox relay: chuyển event từ bảng outbox_events (ghi cùng transaction nghiệp vụ) sang BullMQ.
 *
 *  - FOR UPDATE SKIP LOCKED: nhiều instance chạy relay song song không lấy trùng dòng.
 *  - jobId = id event → relay chết sau khi add nhưng trước khi đánh dấu published thì lần sau
 *    add lại cũng bị BullMQ bỏ qua (dedupe). Đây là at-least-once + dedupe.
 *  - Giữ thứ tự theo created_at trong 1 batch (không đảm bảo thứ tự tuyệt đối giữa các worker —
 *    handler không được phụ thuộc thứ tự, hoặc tự kiểm tra trạng thái).
 */
@Injectable()
export class OutboxRelay implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger('OutboxRelay');
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly queue: JobQueue,
    @Inject(ENV) private readonly env: Env,
  ) {}

  onApplicationBootstrap(): void {
    if (!this.env.WORKERS_ENABLED) return;
    this.timer = setInterval(() => void this.tick(), this.env.OUTBOX_POLL_MS);
  }

  onApplicationShutdown(): void {
    if (this.timer) clearInterval(this.timer);
  }

  private async tick(): Promise<void> {
    if (this.running) return; // không chồng lượt khi DB chậm
    this.running = true;
    try {
      while ((await this.publishBatch()) === BATCH) {
        /* còn nữa thì xử lý tiếp ngay */
      }
    } catch (e) {
      this.logger.error(`Relay lỗi: ${(e as Error).message}`);
    } finally {
      this.running = false;
    }
  }

  /** Đẩy tối đa 1 batch; trả số event đã đẩy. Public để test. */
  async publishBatch(): Promise<number> {
    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<
        Array<{ id: string; type: string; payload: Record<string, unknown> }>
      >`
        SELECT id::text AS id, type, payload FROM outbox_events
        WHERE published_at IS NULL
        ORDER BY created_at
        LIMIT ${BATCH}
        FOR UPDATE SKIP LOCKED`;
      for (const r of rows) {
        await this.queue.add(
          EVENTS_QUEUE,
          r.type,
          { eventId: r.id, type: r.type, payload: r.payload },
          { jobId: r.id, attempts: 8, backoffMs: 2000 },
        );
      }
      if (rows.length) {
        await tx.outboxEvent.updateMany({
          where: { id: { in: rows.map((r) => r.id) } },
          data: { publishedAt: new Date(), attempts: { increment: 1 } },
        });
      }
      return rows.length;
    });
  }
}
