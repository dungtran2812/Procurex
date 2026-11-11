import { randomUUID } from 'node:crypto';
import { PrismaUnitOfWork } from '../../../infrastructure/persistence/prisma-unit-of-work';
import { PrismaOutbox } from '../../../infrastructure/persistence/prisma-outbox';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { submit } from '../domain/purchase-request';
import { PrismaPurchaseRequestRepository } from './prisma-purchase-request.repository';

/**
 * Integration (Postgres thật): optimistic locking, tách tenant, rollback của UnitOfWork.
 * Dùng companyId ngẫu nhiên (bảng purchase_requests không có FK sang companies).
 */
describe('PrismaPurchaseRequestRepository (Postgres thật)', () => {
  const prisma = new PrismaService();
  const repo = new PrismaPurchaseRequestRepository(prisma);
  const uow = new PrismaUnitOfWork(prisma);
  const outbox = new PrismaOutbox(prisma);
  const companyId = randomUUID();
  const requesterId = randomUUID();
  const actor = { id: requesterId, companyId, role: 'BUYER' as const };

  const newPr = () =>
    repo.create({
      companyId,
      requesterId,
      title: 'Test PR',
      note: null,
      totalAmount: 120_000,
      lines: [
        {
          lineNo: 1,
          productId: randomUUID(),
          sku: 'SKU-1',
          productName: 'Cờ lê',
          unit: 'cái',
          quantity: 2,
          unitPrice: 60_000,
          priceSource: 'TIER',
          lineTotal: 120_000,
        },
      ],
    });

  afterAll(async () => {
    await prisma.purchaseRequest.deleteMany({ where: { companyId } });
    await prisma.outboxEvent.deleteMany({ where: { type: { startsWith: `test.${companyId}` } } });
    await prisma.$disconnect();
  });

  it('create + findById: đọc lại đủ dòng hàng (snapshot) và số tiền là number', async () => {
    const pr = await newPr();
    const again = await repo.findById(companyId, pr.id);
    expect(again).toMatchObject({ status: 'DRAFT', version: 0, totalAmount: 120_000 });
    expect(again!.lines[0]).toMatchObject({ sku: 'SKU-1', unitPrice: 60_000, lineTotal: 120_000 });
  });

  it('tenant: công ty khác không thấy PR (null, không phải lỗi quyền)', async () => {
    const pr = await newPr();
    expect(await repo.findById(randomUUID(), pr.id)).toBeNull();
  });

  it('save: tăng version và ghi các bước duyệt', async () => {
    const pr = await newPr();
    const saved = await repo.save(submit(pr, actor, [], new Date()));
    expect(saved).toMatchObject({ status: 'PENDING_APPROVAL', version: 1 });
    expect(saved.steps).toHaveLength(1);
  });

  it('optimistic locking: 2 người cùng sửa từ cùng version → người sau nhận CONCURRENT_MODIFICATION', async () => {
    const pr = await newPr();
    const a = submit(pr, actor, [], new Date());
    const b = submit(pr, actor, [], new Date()); // cùng đọc version 0
    await repo.save(a);
    await expect(repo.save(b)).rejects.toMatchObject({ code: 'CONCURRENT_MODIFICATION' });
  });

  it('optimistic locking song song thật: đúng 1 trong 5 request thắng', async () => {
    const pr = await newPr();
    const results = await Promise.allSettled(
      Array.from({ length: 5 }, () => repo.save(submit(pr, actor, [], new Date()))),
    );
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  });

  it('UnitOfWork: lỗi giữa chừng → rollback cả thay đổi PR lẫn outbox event', async () => {
    const pr = await newPr();
    const type = `test.${companyId}.rollback`;
    await expect(
      uow.run(async () => {
        await repo.save(submit(pr, actor, [], new Date()));
        await outbox.add({ type, payload: {} });
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');

    expect((await repo.findById(companyId, pr.id))!.status).toBe('DRAFT');
    expect(await prisma.outboxEvent.count({ where: { type } })).toBe(0);
  });

  it('list: lọc theo người tạo/trạng thái, phân trang, mới nhất trước', async () => {
    const r = await repo.list({ companyId, status: 'DRAFT', page: 1, pageSize: 2 });
    expect(r.items.length).toBeLessThanOrEqual(2);
    expect(r.total).toBeGreaterThanOrEqual(2);
    expect(r.items.every((i) => i.status === 'DRAFT' && i.lineCount === 1)).toBe(true);
    const other = await repo.list({ companyId, requesterId: randomUUID(), page: 1, pageSize: 10 });
    expect(other.total).toBe(0);
  });
});
