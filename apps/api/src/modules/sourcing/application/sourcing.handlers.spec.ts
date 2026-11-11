import type { Env } from '../../../config/env';
import { FixedClock } from '../../catalog/testing/fakes';
import { FakeUnitOfWork } from '../../procurement/testing/fakes';
import { ErpPort, PurchaseOrder, SourcingRepository } from './ports';
import { SourcingHandlers } from './sourcing.handlers';
import { SourcingService } from './sourcing.service';
import { EventBus, JobQueue } from '../../../common/events/ports';
import { Notifier, OutgoingNotification } from '../../../common/notifications/ports';

const po: PurchaseOrder = {
  id: 'po1',
  companyId: 'acme',
  poNumber: 'PO-20261111-ABCDEF',
  rfqId: 'r1',
  prId: 'pr1',
  supplierId: 's1',
  supplierName: 'NCC',
  quoteId: 'q1',
  totalAmount: 1000,
  lines: [],
  status: 'ISSUED',
  erpSyncStatus: 'PENDING',
  erpRef: null,
  erpAttempts: 0,
  erpLastError: null,
  issuedBy: 'u1',
  createdAt: new Date(0),
};

describe('SourcingHandlers.syncPoToErp (retry & dead-letter)', () => {
  let current: PurchaseOrder;
  let updates: Array<Record<string, unknown>>;
  let sent: OutgoingNotification[];
  let erpCalls: number;
  let erpFails: boolean;
  let handlers: SourcingHandlers;

  beforeEach(() => {
    current = { ...po };
    updates = [];
    sent = [];
    erpCalls = 0;
    erpFails = true;
    const repo = {
      findPo: async () => current,
      updateErpSync: async (_id: string, patch: Record<string, unknown>) => {
        updates.push(patch);
        current = { ...current, ...(patch as Partial<PurchaseOrder>) };
      },
    } as unknown as SourcingRepository;
    const erp: ErpPort = {
      pushPurchaseOrder: async () => {
        erpCalls++;
        if (erpFails) throw new Error('503');
        return { erpRef: 'ERP-1' };
      },
    };
    const notifier: Notifier = { send: async (n) => void sent.push(n) };
    handlers = new SourcingHandlers(
      {} as EventBus,
      {} as JobQueue,
      repo,
      {} as SourcingService,
      erp,
      notifier,
      new FakeUnitOfWork(),
      new FixedClock(new Date()),
      {} as Env,
    );
  });

  it('lỗi chưa phải lần cuối → giữ PENDING, ghi lỗi, ném lại để BullMQ retry, chưa báo ai', async () => {
    await expect(handlers.syncPoToErp('acme', 'po1', false)).rejects.toThrow('503');
    expect(updates).toEqual([
      { erpSyncStatus: 'PENDING', erpLastError: '503', incrementAttempts: true },
    ]);
    expect(sent).toEqual([]);
  });

  it('lần cuối vẫn lỗi → FAILED + báo ADMIN', async () => {
    await expect(handlers.syncPoToErp('acme', 'po1', true)).rejects.toThrow();
    expect(current.erpSyncStatus).toBe('FAILED');
    expect(sent).toMatchObject([{ recipient: 'admins:acme' }]);
  });

  it('thành công → SYNCED + erpRef; chạy lại (job giao trùng) không gọi ERP lần 2', async () => {
    erpFails = false;
    await handlers.syncPoToErp('acme', 'po1', false);
    expect(current).toMatchObject({ erpSyncStatus: 'SYNCED', erpRef: 'ERP-1' });
    await handlers.syncPoToErp('acme', 'po1', false);
    expect(erpCalls).toBe(1);
  });
});
