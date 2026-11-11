import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditEntry, AuditLog } from '../../common/persistence/ports';
import { PrismaService } from '../prisma/prisma.service';
import { db } from './prisma-unit-of-work';

@Injectable()
export class PrismaAuditLog extends AuditLog {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async append(e: AuditEntry): Promise<void> {
    await db(this.prisma).auditLog.create({
      data: {
        companyId: e.companyId,
        entityType: e.entityType,
        entityId: e.entityId,
        action: e.action,
        fromStatus: e.fromStatus ?? null,
        toStatus: e.toStatus ?? null,
        actorId: e.actorId,
        data: (e.data ?? {}) as Prisma.InputJsonObject,
      },
    });
  }

  async list(companyId: string, entityType: string, entityId: string) {
    const rows = await db(this.prisma).auditLog.findMany({
      where: { companyId, entityType, entityId },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map((r) => ({ ...r, data: r.data as Record<string, unknown> }));
  }
}
