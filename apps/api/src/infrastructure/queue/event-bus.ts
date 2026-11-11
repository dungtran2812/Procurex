import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { EventBus, EventContext, EventHandler, JobQueue } from '../../common/events/ports';
import { UnitOfWork } from '../../common/persistence/ports';
import { db } from '../persistence/prisma-unit-of-work';
import { PrismaService } from '../prisma/prisma.service';

export const EVENTS_QUEUE = 'domain-events';

/**
 * Dispatcher: 1 job = 1 event từ outbox → gọi lần lượt mọi handler đăng ký cho type đó.
 *
 * Idempotent consumer: mỗi handler chạy trong transaction riêng, CÙNG transaction đó ghi
 * processed_events(eventId, handler). Lần giao lại → thấy đã có dòng → bỏ qua handler đó.
 * Handler A xong, B lỗi → job retry → A được bỏ qua, chỉ chạy lại B.
 */
@Injectable()
export class PrismaEventBus extends EventBus implements OnModuleInit {
  private readonly logger = new Logger('EventBus');
  private readonly handlers = new Map<string, Array<{ name: string; fn: EventHandler }>>();

  constructor(
    private readonly queue: JobQueue,
    private readonly uow: UnitOfWork,
    private readonly prisma: PrismaService,
  ) {
    super();
  }

  on(type: string, handlerName: string, fn: EventHandler): void {
    const list = this.handlers.get(type) ?? [];
    if (list.some((h) => h.name === handlerName)) throw new Error(`Trùng handler ${handlerName}`);
    list.push({ name: handlerName, fn });
    this.handlers.set(type, list);
  }

  onModuleInit(): void {
    this.queue.process(EVENTS_QUEUE, (data) => this.dispatch(data), { concurrency: 10 });
  }

  /** Public để test gọi trực tiếp, không cần worker. */
  async dispatch(data: Record<string, unknown>): Promise<void> {
    const ctx: EventContext = { eventId: String(data.eventId), type: String(data.type) };
    const payload = (data.payload ?? {}) as Record<string, unknown>;
    for (const h of this.handlers.get(ctx.type) ?? []) {
      await this.uow.run(async () => {
        const client = db(this.prisma);
        const done = await client.processedEvent.findUnique({
          where: { eventId_handler: { eventId: ctx.eventId, handler: h.name } },
        });
        if (done) return;
        await h.fn(payload, ctx);
        // Nếu 2 worker cùng chạy 1 event: worker sau vỡ khoá chính ở đây → rollback → retry → skip.
        await client.processedEvent.create({ data: { eventId: ctx.eventId, handler: h.name } });
      });
      this.logger.debug(`${ctx.type} → ${h.name} ✓`);
    }
  }
}
