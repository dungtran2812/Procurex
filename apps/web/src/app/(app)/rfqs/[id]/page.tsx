'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { use, useState } from 'react';
import {
  Badge,
  Button,
  Card,
  Empty,
  ErrorBox,
  Field,
  Loading,
  PageHeader,
  STATUS_TONE,
  Table,
  Textarea,
} from '@/components/ui';
import { api, errorMessage } from '@/lib/client/api';
import { useIdempotencyKey } from '@/lib/client/hooks';
import { RFQ_STATUS_LABEL, dt, vnd } from '@/lib/format';
import type { PurchaseOrder, RfqDetail } from '@/lib/types';

export default function RfqPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const qc = useQueryClient();
  const router = useRouter();
  const [picked, setPicked] = useState<string>();
  const [reason, setReason] = useState('');
  const [idemKey, resetKey] = useIdempotencyKey();

  const rfq = useQuery({
    queryKey: ['rfq', id],
    queryFn: () => api<RfqDetail>(`rfqs/${id}`),
    // RFQ đang mở: tự cập nhật khi NCC gửi báo giá / worker gửi lời mời.
    refetchInterval: (q) => (q.state.data?.status === 'OPEN' ? 10_000 : false),
  });

  const change = useMutation({
    mutationFn: (action: 'close' | 'cancel') => api(`rfqs/${id}/${action}`, { method: 'POST' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['rfq', id] });
      qc.invalidateQueries({ queryKey: ['rfqs'] });
    },
  });

  const award = useMutation({
    mutationFn: () =>
      api<PurchaseOrder>(`rfqs/${id}/award`, {
        method: 'POST',
        idempotencyKey: idemKey,
        body: { quoteId: chosen, reason: reason || undefined },
      }),
    onSuccess: (po) => {
      qc.invalidateQueries({ queryKey: ['rfq', id] });
      qc.invalidateQueries({ queryKey: ['purchase-orders'] });
      router.push(`/purchase-orders/${po.id}`);
    },
    onError: () => resetKey(),
  });

  if (rfq.isPending) return <Loading />;
  if (rfq.error) return <ErrorBox message={errorMessage(rfq.error)} />;
  const r = rfq.data;
  const now = Date.now();
  const canAward =
    r.status === 'CLOSED' || (r.status === 'OPEN' && now >= new Date(r.deadline).getTime());
  const cheapestId = r.quotes[0]?.quoteId; // API đã xếp hạng
  // Mặc định chọn sẵn báo giá rẻ nhất; người dùng bấm dòng khác để đổi.
  const chosen = picked ?? (canAward ? cheapestId : undefined);
  const chosenQuote = r.quotes.find((q) => q.quoteId === chosen);
  const needsReason = !!chosen && chosen !== cheapestId;

  return (
    <>
      <PageHeader
        title="Chi tiết RFQ"
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <Badge tone={STATUS_TONE[r.status]}>{RFQ_STATUS_LABEL[r.status]}</Badge>
            <span>Hạn: {dt(r.deadline)}</span>
            <Link href={`/purchase-requests/${r.prId}`} className="text-brand hover:underline">
              Xem PR gốc
            </Link>
          </span>
        }
        actions={
          (r.status === 'OPEN' || r.status === 'CLOSED') && (
            <>
              {r.status === 'OPEN' && (
                <Button
                  variant="secondary"
                  loading={change.isPending && change.variables === 'close'}
                  onClick={() => change.mutate('close')}
                >
                  Đóng nhận báo giá
                </Button>
              )}
              <Button
                variant="ghost"
                loading={change.isPending && change.variables === 'cancel'}
                onClick={() => change.mutate('cancel')}
              >
                Hủy RFQ
              </Button>
            </>
          )
        }
      />
      {change.error && (
        <div className="mb-4">
          <ErrorBox message={errorMessage(change.error)} />
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
        <div className="space-y-5">
          <Card title={`Báo giá (${r.quotes.length}/${r.invitations.length})`}>
            {r.quotes.length === 0 ? (
              <Empty>Chưa có báo giá. Trang tự cập nhật mỗi 10 giây.</Empty>
            ) : (
              <Table>
                <thead>
                  <tr>
                    {canAward && <th className="w-10" />}
                    <th>Hạng</th>
                    <th>Nhà cung cấp</th>
                    <th className="text-right">Tổng</th>
                    <th className="text-right">Giao (ngày)</th>
                    <th>Hiệu lực tới</th>
                  </tr>
                </thead>
                <tbody>
                  {r.quotes.map((q, i) => (
                    <tr
                      key={q.quoteId}
                      onClick={canAward ? () => setPicked(q.quoteId) : undefined}
                      className={`${chosen === q.quoteId ? 'bg-brand/5' : ''} ${canAward ? 'cursor-pointer hover:bg-surface-2' : ''}`}
                    >
                      {canAward && (
                        <td>
                          <input
                            type="radio"
                            name="quote"
                            aria-label={`Chọn ${q.supplierName}`}
                            checked={chosen === q.quoteId}
                            onChange={() => setPicked(q.quoteId)}
                          />
                        </td>
                      )}
                      <td className="num">{i === 0 ? <Badge tone="ok">#1</Badge> : `#${i + 1}`}</td>
                      <td>{q.supplierName}</td>
                      <td className="text-right font-medium num">{vnd(q.totalAmount)}</td>
                      <td className="text-right num">{q.leadTimeDays}</td>
                      <td>{dt(q.validUntil)}</td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Card>

          <Card title="Dòng hàng">
            <Table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Sản phẩm</th>
                  <th className="text-right">Số lượng</th>
                </tr>
              </thead>
              <tbody>
                {r.lines.map((l) => (
                  <tr key={l.lineNo}>
                    <td className="num">{l.lineNo}</td>
                    <td>
                      {l.productName}
                      <p className="text-xs text-muted">{l.sku}</p>
                    </td>
                    <td className="text-right num">
                      {l.quantity} {l.unit}
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Card>
        </div>

        <div className="space-y-5">
          {canAward && (
            <Card title="Chọn nhà cung cấp">
              <div className="space-y-3">
                {award.error && <ErrorBox message={errorMessage(award.error)} />}
                {r.quotes.length === 0 ? (
                  <p className="text-sm text-muted">Chưa có báo giá nào để chọn.</p>
                ) : chosenQuote ? (
                  <dl className="space-y-1 text-sm">
                    <div className="flex justify-between gap-2">
                      <dt className="text-muted">Nhà cung cấp</dt>
                      <dd className="font-medium">{chosenQuote.supplierName}</dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt className="text-muted">Tổng</dt>
                      <dd className="num">{vnd(chosenQuote.totalAmount)}</dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt className="text-muted">Giao hàng</dt>
                      <dd className="num">{chosenQuote.leadTimeDays} ngày</dd>
                    </div>
                    <p className="pt-1 text-xs text-muted">
                      {chosen === cheapestId ? 'Giá thấp nhất. ' : ''}Bấm một dòng trong bảng Báo
                      giá để chọn nhà cung cấp khác.
                    </p>
                  </dl>
                ) : (
                  <p className="text-sm text-muted">Bấm một dòng trong bảng Báo giá để chọn.</p>
                )}
                {needsReason && (
                  <Field
                    label="Lý do không chọn giá thấp nhất"
                    hint="Bắt buộc, được lưu vào lịch sử."
                  >
                    <Textarea
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      maxLength={1000}
                    />
                  </Field>
                )}
                <Button
                  className="w-full"
                  disabled={!chosen || (needsReason && !reason.trim())}
                  loading={award.isPending}
                  onClick={() => award.mutate()}
                >
                  Chọn thầu & phát hành PO
                </Button>
              </div>
            </Card>
          )}
          <Card title="Lời mời">
            <ul className="space-y-2 text-sm">
              {r.invitations.map((inv) => (
                <li key={inv.id} className="flex items-start justify-between gap-2">
                  <span>
                    {inv.supplierName}
                    <span className="block text-xs text-muted">{inv.supplierEmail}</span>
                  </span>
                  {inv.respondedAt ? (
                    <Badge tone="ok">Đã báo giá</Badge>
                  ) : inv.sentAt ? (
                    <Badge tone="info">Đã gửi</Badge>
                  ) : (
                    <Badge>Đang gửi…</Badge>
                  )}
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </>
  );
}
