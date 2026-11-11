import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { DomainError } from '../../../common/errors/domain-error';
import { db } from '../../../infrastructure/persistence/prisma-unit-of-work';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import type { QuoteLine, Rfq, RfqLine, RfqStatus } from '../domain/sourcing';
import {
  Invitation,
  NewPurchaseOrder,
  PurchaseOrder,
  SourcingRepository,
  Supplier,
} from '../application/ports';

type RfqRow = Prisma.RfqGetPayload<object>;
const toRfq = (r: RfqRow): Rfq => ({
  id: r.id,
  companyId: r.companyId,
  prId: r.prId,
  createdBy: r.createdBy,
  status: r.status,
  deadline: r.deadline,
  lines: r.lines as unknown as RfqLine[],
  version: r.version,
  closedAt: r.closedAt,
  createdAt: r.createdAt,
});

type PoRow = Prisma.PurchaseOrderGetPayload<object>;
const toPo = (r: PoRow): PurchaseOrder => ({
  ...r,
  totalAmount: r.totalAmount.toNumber(),
  lines: r.lines as unknown as PurchaseOrder['lines'],
});

const isUniqueViolation = (e: unknown) =>
  e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';

@Injectable()
export class PrismaSourcingRepository extends SourcingRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  private get c() {
    return db(this.prisma);
  }

  // ---------- Suppliers ----------
  async createSupplier(s: Omit<Supplier, 'id' | 'isActive'>): Promise<Supplier> {
    try {
      return await this.c.supplier.create({ data: s });
    } catch (e) {
      if (isUniqueViolation(e))
        throw new DomainError('SUPPLIER_EXISTS', 'Email NCC đã có trong danh bạ');
      throw e;
    }
  }

  listSuppliers(companyId: string): Promise<Supplier[]> {
    return this.c.supplier.findMany({ where: { companyId }, orderBy: { name: 'asc' } });
  }

  findSuppliers(companyId: string, ids: string[]): Promise<Supplier[]> {
    return this.c.supplier.findMany({ where: { companyId, id: { in: ids }, isActive: true } });
  }

  // ---------- RFQ ----------
  async createRfq(
    rfq: Omit<Rfq, 'id' | 'status' | 'version' | 'closedAt' | 'createdAt'>,
    supplierIds: string[],
  ): Promise<Rfq> {
    try {
      const row = await this.c.rfq.create({
        data: {
          companyId: rfq.companyId,
          prId: rfq.prId,
          createdBy: rfq.createdBy,
          deadline: rfq.deadline,
          lines: rfq.lines as unknown as Prisma.InputJsonArray,
          invitations: { create: supplierIds.map((supplierId) => ({ supplierId })) },
        },
      });
      return toRfq(row);
    } catch (e) {
      if (isUniqueViolation(e)) throw new DomainError('RFQ_EXISTS', 'PR này đã có RFQ');
      throw e;
    }
  }

  async findRfq(companyId: string, id: string): Promise<Rfq | null> {
    const row = await this.c.rfq.findFirst({ where: { id, companyId } });
    return row ? toRfq(row) : null;
  }

  async listRfqs(companyId: string, status?: RfqStatus): Promise<Rfq[]> {
    const rows = await this.c.rfq.findMany({
      where: { companyId, ...(status && { status }) },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return rows.map(toRfq);
  }

  async saveRfq(rfq: Rfq): Promise<Rfq> {
    const { count } = await this.c.rfq.updateMany({
      where: { id: rfq.id, companyId: rfq.companyId, version: rfq.version },
      data: { status: rfq.status, closedAt: rfq.closedAt, version: { increment: 1 } },
    });
    if (count === 0) {
      throw new DomainError('CONCURRENT_MODIFICATION', 'RFQ vừa được cập nhật, hãy tải lại');
    }
    return (await this.findRfq(rfq.companyId, rfq.id))!;
  }

  async listInvitations(rfqId: string): Promise<Invitation[]> {
    const rows = await this.c.$queryRaw<Invitation[]>`
      SELECT i.id::text AS id, i.rfq_id::text AS "rfqId", i.supplier_id::text AS "supplierId",
             s.name AS "supplierName", s.email AS "supplierEmail",
             i.sent_at AS "sentAt", i.responded_at AS "respondedAt"
      FROM rfq_invitations i JOIN suppliers s ON s.id = i.supplier_id
      WHERE i.rfq_id = ${rfqId}::uuid
      ORDER BY s.name`;
    return rows;
  }

  // ---------- Token & báo giá ----------
  async setInvitationToken(invitationId: string, tokenHash: string, sentAt: Date): Promise<void> {
    await this.c.rfqInvitation.update({ where: { id: invitationId }, data: { tokenHash, sentAt } });
  }

  async findInvitationByTokenHash(tokenHash: string) {
    const row = await this.c.rfqInvitation.findUnique({
      where: { tokenHash },
      include: { rfq: true },
    });
    if (!row) return null;
    const supplier = await this.c.supplier.findUniqueOrThrow({ where: { id: row.supplierId } });
    return {
      id: row.id,
      rfqId: row.rfqId,
      supplierId: row.supplierId,
      supplierName: supplier.name,
      supplierEmail: supplier.email,
      sentAt: row.sentAt,
      respondedAt: row.respondedAt,
      rfq: toRfq(row.rfq),
      companyId: row.rfq.companyId,
    };
  }

  async upsertQuote(
    invitationId: string,
    q: {
      totalAmount: number;
      leadTimeDays: number;
      validUntil: Date;
      note: string | null;
      lines: QuoteLine[];
    },
    at: Date,
  ): Promise<void> {
    const data = {
      totalAmount: q.totalAmount,
      leadTimeDays: q.leadTimeDays,
      validUntil: q.validUntil,
      note: q.note,
      lines: q.lines as unknown as Prisma.InputJsonArray,
      submittedAt: at,
    };
    await this.c.supplierQuote.upsert({
      where: { invitationId },
      create: { invitationId, ...data },
      update: data,
    });
    await this.c.rfqInvitation.update({ where: { id: invitationId }, data: { respondedAt: at } });
  }

  async listQuotes(rfqId: string) {
    const rows = await this.c.supplierQuote.findMany({
      where: { invitation: { rfqId } },
      include: { invitation: true },
    });
    const suppliers = await this.c.supplier.findMany({
      where: { id: { in: rows.map((r) => r.invitation.supplierId) } },
    });
    const name = new Map(suppliers.map((s) => [s.id, s.name]));
    return rows.map((r) => ({
      quoteId: r.id,
      invitationId: r.invitationId,
      supplierId: r.invitation.supplierId,
      supplierName: name.get(r.invitation.supplierId) ?? '',
      totalAmount: r.totalAmount.toNumber(),
      leadTimeDays: r.leadTimeDays,
      validUntil: r.validUntil,
      submittedAt: r.submittedAt,
      lines: r.lines as unknown as QuoteLine[],
    }));
  }

  // ---------- PO ----------
  async createPo(po: NewPurchaseOrder): Promise<PurchaseOrder> {
    const row = await this.c.purchaseOrder.create({
      data: { ...po, lines: po.lines as unknown as Prisma.InputJsonArray },
    });
    return toPo(row);
  }

  async findPo(companyId: string, id: string): Promise<PurchaseOrder | null> {
    const row = await this.c.purchaseOrder.findFirst({ where: { id, companyId } });
    return row ? toPo(row) : null;
  }

  async listPos(companyId: string): Promise<PurchaseOrder[]> {
    const rows = await this.c.purchaseOrder.findMany({
      where: { companyId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return rows.map(toPo);
  }

  async updateErpSync(
    id: string,
    patch: Pick<PurchaseOrder, 'erpSyncStatus'> &
      Partial<Pick<PurchaseOrder, 'erpRef' | 'erpLastError'>> & { incrementAttempts?: boolean },
  ): Promise<void> {
    const { incrementAttempts, ...rest } = patch;
    await this.c.purchaseOrder.update({
      where: { id },
      data: { ...rest, ...(incrementAttempts && { erpAttempts: { increment: 1 } }) },
    });
  }
}
