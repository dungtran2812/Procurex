import {
  Inject,
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import { Job, Queue, Worker } from 'bullmq';
import { Redis } from 'ioredis';
import { JobHandler, JobOptions, JobQueue } from '../../common/events/ports';
import { ENV, Env } from '../../config/env';

/**
 * ADAPTER JobQueue bằng BullMQ.
 *  - BullMQ cần kết nối Redis RIÊNG với maxRetriesPerRequest = null (lệnh blocking BRPOPLPUSH...).
 *  - Worker chỉ khởi động khi WORKERS_ENABLED=true (có thể tách instance chỉ chạy HTTP).
 *  - Job thành công tự xoá sau 1 ngày, job lỗi giữ 7 ngày để điều tra.
 */
@Injectable()
export class BullMqJobQueue
  extends JobQueue
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger('JobQueue');
  private readonly connection: Redis;
  private readonly queues = new Map<string, Queue>();
  private readonly handlers = new Map<string, { handler: JobHandler; concurrency: number }>();
  private readonly workers: Worker[] = [];

  constructor(@Inject(ENV) private readonly env: Env) {
    super();
    this.connection = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
  }

  private queue(name: string): Queue {
    let q = this.queues.get(name);
    if (!q) {
      q = new Queue(name, {
        connection: this.connection,
        prefix: 'procurex',
        defaultJobOptions: {
          removeOnComplete: { age: 24 * 3600 },
          removeOnFail: { age: 7 * 24 * 3600 },
        },
      });
      this.queues.set(name, q);
    }
    return q;
  }

  process(queue: string, handler: JobHandler, opts: { concurrency?: number } = {}): void {
    if (this.handlers.has(queue)) throw new Error(`Queue "${queue}" đã có handler`);
    this.handlers.set(queue, { handler, concurrency: opts.concurrency ?? 5 });
  }

  async add(queue: string, name: string, data: Record<string, unknown>, opts: JobOptions = {}) {
    await this.queue(queue).add(name, data, {
      jobId: opts.jobId,
      delay: opts.delayMs,
      attempts: opts.attempts ?? 5,
      backoff: { type: 'exponential', delay: opts.backoffMs ?? 1000 },
    });
  }

  async remove(queue: string, jobId: string): Promise<void> {
    await this.queue(queue).remove(jobId);
  }

  onApplicationBootstrap(): void {
    if (!this.env.WORKERS_ENABLED) {
      this.logger.log('WORKERS_ENABLED=false → không chạy worker');
      return;
    }
    for (const [name, { handler, concurrency }] of this.handlers) {
      const worker = new Worker(
        name,
        async (job: Job) => {
          const attempts = job.opts.attempts ?? 1;
          await handler(job.data as Record<string, unknown>, {
            attemptsMade: job.attemptsMade,
            final: job.attemptsMade + 1 >= attempts,
          });
        },
        { connection: this.connection, prefix: 'procurex', concurrency },
      );
      worker.on('failed', (job, err) =>
        this.logger.warn(
          `[${name}] ${job?.name} #${job?.id} lần ${job?.attemptsMade}/${job?.opts.attempts}: ${err.message}`,
        ),
      );
      this.workers.push(worker);
    }
    this.logger.log(`Worker đang chạy: ${[...this.handlers.keys()].join(', ')}`);
  }

  async onApplicationShutdown(): Promise<void> {
    // Graceful: chờ job đang chạy xong rồi mới đóng kết nối.
    await Promise.all(this.workers.map((w) => w.close()));
    await Promise.all([...this.queues.values()].map((q) => q.close()));
    await this.connection.quit();
  }
}
