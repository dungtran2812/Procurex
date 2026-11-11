import { Global, Module } from '@nestjs/common';
import { Notifier } from '../../common/notifications/ports';
import { AuditLog, Outbox, UnitOfWork } from '../../common/persistence/ports';
import { Clock, SystemClock } from '../../common/time/clock';
import { PrismaAuditLog } from './prisma-audit-log';
import { PrismaNotifier } from './prisma-notifier';
import { PrismaOutbox } from './prisma-outbox';
import { PrismaUnitOfWork } from './prisma-unit-of-work';

/** Hạ tầng dùng chung cho mọi module: transaction, audit, outbox, đồng hồ, thông báo. */
@Global()
@Module({
  providers: [
    { provide: UnitOfWork, useClass: PrismaUnitOfWork },
    { provide: AuditLog, useClass: PrismaAuditLog },
    { provide: Outbox, useClass: PrismaOutbox },
    { provide: Clock, useClass: SystemClock },
    { provide: Notifier, useClass: PrismaNotifier },
  ],
  exports: [UnitOfWork, AuditLog, Outbox, Clock, Notifier],
})
export class PersistenceModule {}
