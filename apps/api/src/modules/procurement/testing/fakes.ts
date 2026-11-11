import type { AuthUser } from '../../../common/auth/auth.types';
import {
  AuditEntry,
  AuditLog,
  DomainEvent,
  Outbox,
  UnitOfWork,
} from '../../../common/persistence/ports';
import { DomainError } from '../../../common/errors/domain-error';
import type { ApprovalRule, Approver, PurchaseRequest } from '../domain/purchase-request';
import {
  ApprovalRuleRepository,
  ApproverDirectory,
  NewPurchaseRequest,
  PricedItem,
  PricingPort,
  PrListFilter,
  PurchaseRequestRepository,
} from '../application/ports';

export class FakeUnitOfWork extends UnitOfWork {
  runs = 0;
  run<T>(fn: () => Promise<T>): Promise<T> {
    this.runs += 1;
    return fn();
  }
}

export class FakeAuditLog extends AuditLog {
  readonly entries: AuditEntry[] = [];
  async append(e: AuditEntry) {
    this.entries.push(e);
  }
  async list(companyId: string, entityType: string, entityId: string) {
    return this.entries
      .filter(
        (e) => e.companyId === companyId && e.entityType === entityType && e.entityId === entityId,
      )
      .map((e, i) => ({ ...e, id: String(i), createdAt: new Date(0) }));
  }
}

export class FakeOutbox extends Outbox {
  readonly events: DomainEvent[] = [];
  async add(e: DomainEvent) {
    this.events.push(e);
  }
}

export class FakePricing extends PricingPort {
  constructor(private readonly unitPrice = 100_000) {
    super();
  }
  async price(_buyer: AuthUser, productId: string, quantity: number): Promise<PricedItem> {
    return {
      productId,
      sku: `SKU-${productId}`,
      productName: `Sản phẩm ${productId}`,
      unit: 'cái',
      quantity,
      unitPrice: this.unitPrice,
      priceSource: 'TIER',
      lineTotal: this.unitPrice * quantity,
    };
  }
}

export class FakeApproverDirectory extends ApproverDirectory {
  readonly limits = new Map<string, number>();
  async get(actor: AuthUser): Promise<Approver> {
    return { ...actor, approvalLimit: this.limits.get(actor.id) ?? 0, isActive: true };
  }
}

export class InMemoryApprovalRules extends ApprovalRuleRepository {
  readonly byCompany = new Map<string, ApprovalRule[]>();
  async list(companyId: string) {
    return this.byCompany.get(companyId) ?? [];
  }
  async replace(companyId: string, rules: ApprovalRule[]) {
    this.byCompany.set(companyId, rules);
  }
}

export class InMemoryPurchaseRequests extends PurchaseRequestRepository {
  readonly items = new Map<string, PurchaseRequest>();
  private seq = 0;

  async create(i: NewPurchaseRequest): Promise<PurchaseRequest> {
    const pr: PurchaseRequest = {
      ...i,
      id: `pr-${++this.seq}`,
      status: 'DRAFT',
      version: 0,
      submittedAt: null,
      decidedAt: null,
      createdAt: new Date(this.seq),
      steps: [],
    };
    this.items.set(pr.id, structuredClone(pr));
    return pr;
  }
  async findById(companyId: string, id: string) {
    const pr = this.items.get(id);
    return pr && pr.companyId === companyId ? structuredClone(pr) : null;
  }
  async list(f: PrListFilter) {
    const all = [...this.items.values()].filter(
      (p) =>
        p.companyId === f.companyId &&
        (!f.requesterId || p.requesterId === f.requesterId) &&
        (!f.status || p.status === f.status),
    );
    return {
      total: all.length,
      items: all.map((p) => ({
        id: p.id,
        title: p.title,
        status: p.status,
        totalAmount: p.totalAmount,
        requesterId: p.requesterId,
        lineCount: p.lines.length,
        createdAt: p.createdAt,
      })),
    };
  }
  async save(pr: PurchaseRequest) {
    const cur = this.items.get(pr.id);
    if (!cur || cur.version !== pr.version) {
      throw new DomainError('CONCURRENT_MODIFICATION', 'conflict');
    }
    const next = { ...structuredClone(pr), version: pr.version + 1 };
    this.items.set(pr.id, next);
    return structuredClone(next);
  }
}
