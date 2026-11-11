import { Global, Module } from '@nestjs/common';
import { EventBus, JobQueue } from '../../common/events/ports';
import { BullMqJobQueue } from './bullmq-job-queue';
import { PrismaEventBus } from './event-bus';
import { OutboxRelay } from './outbox-relay';

/** Hạ tầng bất đồng bộ dùng chung: BullMQ, event bus (idempotent consumer), outbox relay. */
@Global()
@Module({
  providers: [
    { provide: JobQueue, useClass: BullMqJobQueue },
    { provide: EventBus, useClass: PrismaEventBus },
    OutboxRelay,
  ],
  exports: [JobQueue, EventBus],
})
export class QueueModule {}
