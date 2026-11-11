import { EventBus, JobOptions, JobQueue } from '../../../common/events/ports';
import { Notifier, OutgoingNotification } from '../../../common/notifications/ports';
import type { Env } from '../../../config/env';
import { InMemoryPurchaseRequests } from '../testing/fakes';
import { ProcurementHandlers } from './procurement.handlers';

describe('ProcurementHandlers.remind (SLA duyệt)', () => {
  let prs: InMemoryPurchaseRequests;
  let sent: OutgoingNotification[];
  let scheduled: Array<{ data: Record<string, unknown>; opts?: JobOptions }>;
  let handlers: ProcurementHandlers;
  let prId: string;

  beforeEach(async () => {
    prs = new InMemoryPurchaseRequests();
    sent = [];
    scheduled = [];
    const queue = {
      add: async (_q: string, _n: string, data: Record<string, unknown>, opts?: JobOptions) =>
        void scheduled.push({ data, opts }),
    } as unknown as JobQueue;
    const notifier: Notifier = { send: async (n) => void sent.push(n) };
    handlers = new ProcurementHandlers({} as EventBus, queue, prs, notifier, {
      APPROVAL_SLA_HOURS: 24,
    } as Env);

    const pr = await prs.create({
      companyId: 'acme',
      requesterId: 'u1',
      title: 'Vật tư',
      note: null,
      totalAmount: 1,
      lines: [],
    });
    prId = pr.id;
  });

  const setStatus = (status: 'PENDING_APPROVAL' | 'APPROVED') => {
    const pr = prs.items.get(prId)!;
    prs.items.set(prId, {
      ...pr,
      status,
      steps: [
        {
          level: 1,
          minApproverLimit: 0,
          decision: 'PENDING',
          decidedBy: null,
          comment: null,
          decidedAt: null,
        },
      ],
    });
  };

  it('PR còn chờ: vòng 1 nhắc người duyệt và hẹn vòng 2 sau 24h', async () => {
    setStatus('PENDING_APPROVAL');
    await handlers.remind('acme', prId, 1);
    expect(sent).toMatchObject([{ recipient: 'approvers:acme', dedupeKey: `pr-sla-${prId}-1` }]);
    expect(scheduled).toMatchObject([
      { data: { round: 2 }, opts: { jobId: `pr-sla-${prId}-2`, delayMs: 24 * 3600 * 1000 } },
    ]);
  });

  it('vòng ≥ 2: escalate lên ADMIN; vòng 3 là cuối, không hẹn tiếp', async () => {
    setStatus('PENDING_APPROVAL');
    await handlers.remind('acme', prId, 3);
    expect(sent[0]).toMatchObject({ recipient: 'admins:acme' });
    expect(sent[0].subject).toContain('ESCALATE');
    expect(scheduled).toEqual([]);
  });

  it('PR đã được xử lý → không nhắc gì (timer hết ý nghĩa)', async () => {
    setStatus('APPROVED');
    await handlers.remind('acme', prId, 1);
    expect(sent).toEqual([]);
    expect(scheduled).toEqual([]);
  });
});
