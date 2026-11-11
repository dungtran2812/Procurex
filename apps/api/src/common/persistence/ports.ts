/**
 * PORT hạ tầng dùng chung giữa các module.
 * Use case chỉ biết các abstract class này; hiện thực Prisma ở src/infrastructure/persistence.
 */

/** Mọi lệnh ghi bên trong fn (qua repository) chạy trong CÙNG một transaction DB. */
export abstract class UnitOfWork {
  abstract run<T>(fn: () => Promise<T>): Promise<T>;
}

export interface AuditEntry {
  companyId: string;
  entityType: string;
  entityId: string;
  action: string;
  fromStatus?: string | null;
  toStatus?: string | null;
  actorId: string;
  data?: Record<string, unknown>;
}

/** Audit trail append-only: không có update/delete. */
export abstract class AuditLog {
  abstract append(entry: AuditEntry): Promise<void>;
  abstract list(
    companyId: string,
    entityType: string,
    entityId: string,
  ): Promise<Array<AuditEntry & { id: string; createdAt: Date }>>;
}

export interface DomainEvent {
  type: string; // vd 'pr.approved'
  payload: Record<string, unknown>;
}

/** Transactional outbox: gọi BÊN TRONG uow.run() để event được ghi cùng transaction. */
export abstract class Outbox {
  abstract add(event: DomainEvent): Promise<void>;
}
