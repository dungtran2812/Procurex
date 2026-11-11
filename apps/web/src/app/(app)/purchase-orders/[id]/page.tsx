'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { use } from 'react';
import {
  Badge,
  Button,
  Card,
  ErrorBox,
  Loading,
  PageHeader,
  STATUS_TONE,
  Table,
} from '@/components/ui';
import { api, errorMessage } from '@/lib/client/api';
import { useMe } from '@/lib/client/hooks';
import { ERP_STATUS_LABEL, dt, vnd } from '@/lib/format';
import type { PurchaseOrder } from '@/lib/types';

export default function PurchaseOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const me = useMe();
  const qc = useQueryClient();

  const po = useQuery({
    queryKey: ['purchase-order', id],
    queryFn: () => api<PurchaseOrder>(`purchase-orders/${id}`),
    // Worker đồng bộ ERP chạy nền (có retry/backoff) → hỏi lại mỗi 2s cho tới khi xong.
    refetchInterval: (q) => (q.state.data?.erpSyncStatus === 'PENDING' ? 2000 : false),
  });

  const retry = useMutation({
    mutationFn: () => api<PurchaseOrder>(`purchase-orders/${id}/erp-sync`, { method: 'POST' }),
    onSuccess: (updated) => {
      qc.setQueryData(['purchase-order', id], updated);
      qc.invalidateQueries({ queryKey: ['purchase-orders'] });
    },
  });

  if (po.isPending) return <Loading />;
  if (po.error) return <ErrorBox message={errorMessage(po.error)} />;
  const p = po.data;

  return (
    <>
      <PageHeader
        title={<span className="num">{p.poNumber}</span>}
        subtitle={
          <span className="flex flex-wrap gap-2">
            <span>{p.supplierName}</span>
            <span>· {dt(p.createdAt)}</span>
            <Link href={`/rfqs/${p.rfqId}`} className="text-brand hover:underline">
              RFQ
            </Link>
            <Link href={`/purchase-requests/${p.prId}`} className="text-brand hover:underline">
              PR
            </Link>
          </span>
        }
      />
      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        <Card title="Dòng hàng">
          <Table>
            <thead>
              <tr>
                <th>#</th>
                <th>Sản phẩm</th>
                <th className="text-right">SL</th>
                <th className="text-right">Đơn giá</th>
                <th className="text-right">Thành tiền</th>
              </tr>
            </thead>
            <tbody>
              {p.lines.map((l) => (
                <tr key={l.lineNo}>
                  <td className="num">{l.lineNo}</td>
                  <td>
                    {l.productName}
                    <p className="text-xs text-muted">{l.sku}</p>
                  </td>
                  <td className="text-right num">
                    {l.quantity} {l.unit}
                  </td>
                  <td className="text-right num">{vnd(l.unitPrice)}</td>
                  <td className="text-right num">{vnd(l.lineTotal)}</td>
                </tr>
              ))}
              <tr>
                <td colSpan={4} className="text-right font-semibold">
                  Tổng
                </td>
                <td className="text-right font-semibold num">{vnd(p.totalAmount)}</td>
              </tr>
            </tbody>
          </Table>
        </Card>
        <Card title="Đồng bộ ERP" className="h-fit">
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted">Trạng thái</dt>
              <dd>
                <Badge tone={STATUS_TONE[p.erpSyncStatus]}>
                  {ERP_STATUS_LABEL[p.erpSyncStatus]}
                </Badge>
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted">Mã ERP</dt>
              <dd className="num">{p.erpRef ?? '—'}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted">Số lần thử</dt>
              <dd className="num">{p.erpAttempts}</dd>
            </div>
            {p.erpLastError && (
              <p className="rounded bg-danger/5 p-2 text-xs text-danger">
                Lỗi gần nhất: {p.erpLastError}
              </p>
            )}
          </dl>
          {p.erpSyncStatus === 'FAILED' && me.data?.role === 'ADMIN' && (
            <div className="mt-4 space-y-2">
              {retry.error && <ErrorBox message={errorMessage(retry.error)} />}
              <Button className="w-full" loading={retry.isPending} onClick={() => retry.mutate()}>
                Đồng bộ lại
              </Button>
            </div>
          )}
        </Card>
      </div>
    </>
  );
}
