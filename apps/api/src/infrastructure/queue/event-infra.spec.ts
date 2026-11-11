import { randomUUID } from 'node:crypto';
import { JobHandler, JobOptions, JobQueue } from '../../common/events/ports';
import type { Env } from '../../config/env';
import { PrismaOutbox } from '../persistence/prisma-outbox';
import { PrismaUnitOfWork } from '../persistence/prisma-unit-of-work';
import { PrismaService } from '../prisma/prisma.service';
import { EVENTS_QUEUE, PrismaEventBus } from './event-bus';
import { OutboxRelay } from './outbox-relay';

/** Ghi lại job thay vì gửi BullMQ thật. */
class RecordingQueue extends JobQueue {
  readonly added: Array<{
    queue: string;
    name: string;
    data: Record<string, unknown>;
    opts?: JobOptions;
  }> = [];
  process(_q: string, _h: JobHandler): void {}
  async add(queue: string, name: string, data: Record<string, unknown>, opts?: JobOptions) {
    this.added.push({ queue, name, data, opts });
  }
  async remove(): Promise<void> {}
}

/** Integration (Postgres thật): outbox relay + idempotent consumer. */
describe('Outbox relay & EventBus (Postgres thật)', () => {
  const prisma = new PrismaService();
  const uow = new PrismaUnitOfWork(prisma);
  const outbox = new PrismaOutbox(prisma);
  const type = `test.${randomUUID()}`;

  afterAll(async () => {
    const events = await prisma.outboxEvent.findMany({ where: { type } });
    await prisma.processedEvent.deleteMany({ where: { eventId: { in: events.map((e) => e.id) } } });
    await prisma.outboxEvent.deleteMany({ where: { type } });
    await prisma.$disconnect();
  });

  it('relay: đẩy event chưa publish sang queue với jobId = event id, rồi đánh dấu published', async () => {
    await uow.run(() => outbox.add({ type, payload: { n: 1 } }));
    const queue = new RecordingQueue();
    const relay = new OutboxRelay(prisma, queue, {} as Env);

    // Có thể còn event của test khác/seed đang chờ → chạy tới khi hết.
    while ((await relay.publishBatch()) > 0) {
      /* drain */
    }
    const mine = queue.added.filter((j) => j.name === type);
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({ queue: EVENTS_QUEUE, data: { type, payload: { n: 1 } } });
    expect(mine[0].opts?.jobId).toBe(mine[0].data.eventId);

    const row = await prisma.outboxEvent.findFirstOrThrow({ where: { type } });
    expect(row.publishedAt).not.toBeNull();
    // Lần relay sau không đẩy lại.
    const again = new RecordingQueue();
    await new OutboxRelay(prisma, again, {} as Env).publishBatch();
    expect(again.added.filter((j) => j.name === type)).toHaveLength(0);
  });

  it('EventBus: event giao 2 lần → mỗi handler chạy thành công đúng 1 lần', async () => {
    const bus = new PrismaEventBus(new RecordingQueue(), uow, prisma);
    const calls = { a: 0, b: 0 };
    bus.on(type, 'h.a', async () => void calls.a++);
    bus.on(type, 'h.b', async () => void calls.b++);
    const job = { eventId: randomUUID(), type, payload: {} };

    await bus.dispatch(job);
    await bus.dispatch(job);
    expect(calls).toEqual({ a: 1, b: 1 });
  });

  it('EventBus: handler B lỗi → retry chỉ chạy lại B, không chạy lại A', async () => {
    const bus = new PrismaEventBus(new RecordingQueue(), uow, prisma);
    const calls = { a: 0, b: 0 };
    let failB = true;
    bus.on(type, 'r.a', async () => void calls.a++);
    bus.on(type, 'r.b', async () => {
      calls.b++;
      if (failB) throw new Error('tạm lỗi');
    });
    const job = { eventId: randomUUID(), type, payload: {} };

    await expect(bus.dispatch(job)).rejects.toThrow('tạm lỗi');
    failB = false;
    await bus.dispatch(job);
    expect(calls).toEqual({ a: 1, b: 2 });
  });

  it('EventBus: handler lỗi → thay đổi DB của handler đó bị rollback', async () => {
    const bus = new PrismaEventBus(new RecordingQueue(), uow, prisma);
    const marker = `test.${randomUUID()}`;
    bus.on(type, 'tx.fail', async () => {
      await outbox.add({ type: marker, payload: {} }); // ghi trong transaction của handler
      throw new Error('boom');
    });
    await expect(bus.dispatch({ eventId: randomUUID(), type, payload: {} })).rejects.toThrow();
    expect(await prisma.outboxEvent.count({ where: { type: marker } })).toBe(0);
  });
});
