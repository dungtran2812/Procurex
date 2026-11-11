import { Global, Module } from '@nestjs/common';
import { AuditLog, Outbox, UnitOfWork } from '../../common/persistence/ports';
import { Clock, SystemClock } from '../../common/time/clock';
import { PrismaAuditLog } from './prisma-audit-log';
import { PrismaOutbox } from './prisma-outbox';
import { PrismaUnitOfWork } from './prisma-unit-of-work';

/** Hạ tầng dùng chung cho mọi module: transaction, audit, outbox, đồng hồ. */
@Global()
@Module({
  providers: [
    { provide: UnitOfWork, useClass: PrismaUnitOfWork },
    { provide: AuditLog, useClass: PrismaAuditLog },
    { provide: Outbox, useClass: PrismaOutbox },
    { provide: Clock, useClass: SystemClock },
  ],
  exports: [UnitOfWork, AuditLog, Outbox, Clock],
})
export class PersistenceModule {}
