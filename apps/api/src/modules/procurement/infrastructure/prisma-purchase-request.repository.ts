import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { DomainError } from '../../../common/errors/domain-error';
import { db } from '../../../infrastructure/persistence/prisma-unit-of-work';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import type { PurchaseRequest } from '../domain/purchase-request';
import {
  ApprovalRuleRepository,
  NewPurchaseRequest,
  PrListFilter,
  PrSummary,
  PurchaseRequestRepository,
} from '../application/ports';

const INCLUDE = {
  lines: { orderBy: { lineNo: 'asc' } },
  steps: { orderBy: { level: 'asc' } },
} satisfies Prisma.PurchaseRequestInclude;

type Row = Prisma.PurchaseRequestGetPayload<{ include: typeof INCLUDE }>;

function toDomain(r: Row): PurchaseRequest {
  return {
    id: r.id,
    companyId: r.companyId,
    requesterId: r.requesterId,
    title: r.title,
    note: r.note,
    status: r.status,
    totalAmount: r.totalAmount.toNumber(),
    version: r.version,
    submittedAt: r.submittedAt,
    decidedAt: r.decidedAt,
    createdAt: r.createdAt,
    lines: r.lines.map((l) => ({
      lineNo: l.lineNo,
      productId: l.productId,
      sku: l.sku,
      productName: l.productName,
      unit: l.unit,
      quantity: l.quantity,
      unitPrice: l.unitPrice.toNumber(),
      priceSource: l.priceSource as 'TIER' | 'CONTRACT',
      lineTotal: l.lineTotal.toNumber(),
    })),
    steps: r.steps.map((s) => ({
      level: s.level,
      minApproverLimit: s.minApproverLimit.toNumber(),
      decision: s.decision,
      decidedBy: s.decidedBy,
      comment: s.comment,
      decidedAt: s.decidedAt,
    })),
  };
}

@Injectable()
export class PrismaPurchaseRequestRepository extends PurchaseRequestRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async create(input: NewPurchaseRequest): Promise<PurchaseRequest> {
    const row = await db(this.prisma).purchaseRequest.create({
      data: {
        companyId: input.companyId,
        requesterId: input.requesterId,
        title: input.title,
        note: input.note,
        totalAmount: input.totalAmount,
        lines: { create: input.lines },
      },
      include: INCLUDE,
    });
    return toDomain(row);
  }

  async findById(companyId: string, id: string): Promise<PurchaseRequest | null> {
    const row = await db(this.prisma).purchaseRequest.findFirst({
      where: { id, companyId },
      include: INCLUDE,
    });
    return row ? toDomain(row) : null;
  }

  async list(f: PrListFilter): Promise<{ items: PrSummary[]; total: number }> {
    const where: Prisma.PurchaseRequestWhereInput = {
      companyId: f.companyId,
      ...(f.requesterId && { requesterId: f.requesterId }),
      ...(f.status && { status: f.status }),
    };
    const client = db(this.prisma);
    const [rows, total] = await Promise.all([
      client.purchaseRequest.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (f.page - 1) * f.pageSize,
        take: f.pageSize,
        include: { _count: { select: { lines: true } } },
      }),
      client.purchaseRequest.count({ where }),
    ]);
    return {
      total,
      items: rows.map((r) => ({
        id: r.id,
        title: r.title,
        status: r.status,
        totalAmount: r.totalAmount.toNumber(),
        requesterId: r.requesterId,
        lineCount: r._count.lines,
        createdAt: r.createdAt,
      })),
    };
  }

  async save(pr: PurchaseRequest): Promise<PurchaseRequest> {
    const client = db(this.prisma);
    // Điều kiện WHERE version = ? CHÍNH LÀ phép kiểm tra (giống DEL ở refresh token):
    // 2 request cùng đọc version 3 → chỉ request ghi trước thấy count = 1.
    const { count } = await client.purchaseRequest.updateMany({
      where: { id: pr.id, companyId: pr.companyId, version: pr.version },
      data: {
        status: pr.status,
        submittedAt: pr.submittedAt,
        decidedAt: pr.decidedAt,
        version: { increment: 1 },
      },
    });
    if (count === 0) {
      throw new DomainError(
        'CONCURRENT_MODIFICATION',
        'PR vừa được người khác cập nhật, hãy tải lại rồi thử lại',
      );
    }
    // Bước duyệt: ghi lại toàn bộ (ít dòng, cùng transaction nên an toàn).
    await client.approvalStep.deleteMany({ where: { prId: pr.id } });
    if (pr.steps.length) {
      await client.approvalStep.createMany({
        data: pr.steps.map((s) => ({ ...s, prId: pr.id })),
      });
    }
    return (await this.findById(pr.companyId, pr.id))!;
  }
}

@Injectable()
export class PrismaApprovalRuleRepository extends ApprovalRuleRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async list(companyId: string) {
    const rows = await db(this.prisma).approvalRule.findMany({
      where: { companyId },
      orderBy: { level: 'asc' },
    });
    return rows.map((r) => ({
      level: r.level,
      minTotal: r.minTotal.toNumber(),
      minApproverLimit: r.minApproverLimit.toNumber(),
    }));
  }

  async replace(
    companyId: string,
    rules: Array<{ level: number; minTotal: number; minApproverLimit: number }>,
  ) {
    const client = db(this.prisma);
    await client.approvalRule.deleteMany({ where: { companyId } });
    if (rules.length) {
      await client.approvalRule.createMany({ data: rules.map((r) => ({ ...r, companyId })) });
    }
  }
}
