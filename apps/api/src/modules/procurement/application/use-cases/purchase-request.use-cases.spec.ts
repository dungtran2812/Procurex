import type { AuthUser } from '../../../../common/auth/auth.types';
import { FixedClock } from '../../../catalog/testing/fakes';
import {
  FakeApproverDirectory,
  FakeAuditLog,
  FakeOutbox,
  FakePricing,
  FakeUnitOfWork,
  InMemoryApprovalRules,
  InMemoryPurchaseRequests,
} from '../../testing/fakes';
import { ApprovalRuleService, PurchaseRequestService } from './purchase-request.use-cases';

describe('PurchaseRequestService', () => {
  const buyer: AuthUser = { id: 'buyer', companyId: 'acme', role: 'BUYER' };
  const buyer2: AuthUser = { id: 'buyer2', companyId: 'acme', role: 'BUYER' };
  const mgr: AuthUser = { id: 'mgr', companyId: 'acme', role: 'APPROVER' };
  const director: AuthUser = { id: 'dir', companyId: 'acme', role: 'APPROVER' };
  const outsider: AuthUser = { id: 'x', companyId: 'other', role: 'ADMIN' };

  let prs: InMemoryPurchaseRequests;
  let rules: InMemoryApprovalRules;
  let approvers: FakeApproverDirectory;
  let uow: FakeUnitOfWork;
  let audit: FakeAuditLog;
  let outbox: FakeOutbox;
  let service: PurchaseRequestService;

  beforeEach(() => {
    prs = new InMemoryPurchaseRequests();
    rules = new InMemoryApprovalRules();
    approvers = new FakeApproverDirectory();
    approvers.limits.set('dir', 1_000_000_000);
    uow = new FakeUnitOfWork();
    audit = new FakeAuditLog();
    outbox = new FakeOutbox();
    service = new PurchaseRequestService(
      prs,
      rules,
      new FakePricing(1_000_000),
      approvers,
      uow,
      audit,
      outbox,
      new FixedClock(new Date('2026-11-11T00:00:00Z')),
    );
    rules.byCompany.set('acme', [
      { level: 1, minTotal: 0, minApproverLimit: 0 },
      { level: 2, minTotal: 50_000_000, minApproverLimit: 500_000_000 },
    ]);
  });

  const create = (qty: number) =>
    service.create(buyer, { title: ' Vật tư ', lines: [{ productId: 'p1', quantity: qty }] });

  it('create: snapshot giá, tổng tiền, audit CREATE, chưa phát event, có allowedActions', async () => {
    const pr = await create(3);
    expect(pr).toMatchObject({ title: 'Vật tư', totalAmount: 3_000_000, status: 'DRAFT' });
    expect(pr.lines[0]).toMatchObject({ lineNo: 1, sku: 'SKU-p1', unitPrice: 1_000_000 });
    expect(pr.allowedActions).toEqual(['SUBMIT', 'CANCEL']);
    expect(audit.entries).toMatchObject([{ action: 'CREATE', toStatus: 'DRAFT' }]);
    expect(outbox.events).toEqual([]);
  });

  it('create: trùng sản phẩm trong 2 dòng → lỗi', async () => {
    await expect(
      service.create(buyer, {
        title: 'x',
        lines: [
          { productId: 'p1', quantity: 1 },
          { productId: 'p1', quantity: 2 },
        ],
      }),
    ).rejects.toMatchObject({ code: 'EMPTY_PR' });
  });

  it('luồng 2 cấp: event chỉ phát khi PR đổi trạng thái; audit đủ từng bước', async () => {
    const { id } = await create(60); // 60tr → 2 cấp
    await service.submit(buyer, id);
    expect(outbox.events.map((e) => e.type)).toEqual(['pr.pending_approval']);

    const afterL1 = await service.decide(mgr, id, 'APPROVE');
    expect(afterL1.status).toBe('PENDING_APPROVAL');
    expect(outbox.events).toHaveLength(1); // duyệt cấp 1 chưa đổi trạng thái PR

    const done = await service.decide(director, id, 'APPROVE', 'OK');
    expect(done.status).toBe('APPROVED');
    expect(outbox.events.map((e) => e.type)).toEqual(['pr.pending_approval', 'pr.approved']);
    expect(outbox.events[1].payload).toMatchObject({ prId: id, totalAmount: 60_000_000 });

    const history = await service.history(buyer, id);
    expect(history.map((h) => h.action)).toEqual(['CREATE', 'SUBMIT', 'APPROVE', 'APPROVE']);
    expect(history[3].data).toMatchObject({ level: 2, decision: 'APPROVED', comment: 'OK' });
  });

  it('mọi thay đổi trạng thái chạy trong UnitOfWork', async () => {
    const { id } = await create(1);
    const before = uow.runs;
    await service.submit(buyer, id);
    expect(uow.runs).toBe(before + 1);
  });

  it('BUYER chỉ thấy PR của mình; APPROVER thấy cả công ty; công ty khác → 404', async () => {
    const { id } = await create(1);
    await expect(service.get(buyer2, id)).rejects.toMatchObject({ code: 'PR_NOT_FOUND' });
    await expect(service.get(outsider, id)).rejects.toMatchObject({ code: 'PR_NOT_FOUND' });
    await expect(service.get(mgr, id)).resolves.toMatchObject({ id });

    expect((await service.list(buyer2, { page: 1, pageSize: 10 })).total).toBe(0);
    expect((await service.list(mgr, { page: 1, pageSize: 10 })).total).toBe(1);
  });

  it('APPROVER thấy allowedActions APPROVE/REJECT khi PR chờ duyệt', async () => {
    const { id } = await create(1);
    await service.submit(buyer, id);
    expect((await service.get(mgr, id)).allowedActions).toEqual(['APPROVE', 'REJECT']);
    expect((await service.get(buyer, id)).allowedActions).toEqual(['CANCEL']);
  });

  it('ApprovalRuleService: validate trước khi lưu, có audit', async () => {
    const svc = new ApprovalRuleService(rules, uow, audit);
    const admin: AuthUser = { id: 'adm', companyId: 'acme', role: 'ADMIN' };
    await expect(
      svc.replace(admin, [{ level: 2, minTotal: 0, minApproverLimit: 0 }]),
    ).rejects.toMatchObject({ code: 'INVALID_APPROVAL_RULES' });
    const saved = await svc.replace(admin, [{ level: 1, minTotal: 0, minApproverLimit: 10 }]);
    expect(saved).toEqual([{ level: 1, minTotal: 0, minApproverLimit: 10 }]);
    expect(audit.entries.at(-1)).toMatchObject({ entityType: 'ApprovalRules', action: 'REPLACE' });
  });
});
