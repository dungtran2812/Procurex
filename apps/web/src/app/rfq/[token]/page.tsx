'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { use, useEffect, useState, type FormEvent } from 'react';
import {
  Badge,
  Button,
  Card,
  ErrorBox,
  Field,
  Input,
  Loading,
  STATUS_TONE,
  Table,
  Textarea,
} from '@/components/ui';
import { ApiError, api, errorMessage } from '@/lib/client/api';
import { RFQ_STATUS_LABEL, dt, vnd } from '@/lib/format';
import type { SupplierPortalView } from '@/lib/types';

/**
 * Cổng báo giá cho NHÀ CUNG CẤP — không đăng nhập, xác thực bằng token trong link mời.
 * Trang nằm ngoài nhóm (app) nên không yêu cầu cookie phiên.
 */
export default function SupplierQuotePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const qc = useQueryClient();
  const path = `supplier-portal/rfq/${encodeURIComponent(token)}`;

  const view = useQuery({
    queryKey: ['portal', token],
    queryFn: () => api<SupplierPortalView>(path),
    retry: false,
  });

  const [prices, setPrices] = useState<Record<number, string>>({});
  const [leadTimeDays, setLeadTime] = useState('7');
  const [validUntil, setValidUntil] = useState('');
  const [note, setNote] = useState('');
  const [done, setDone] = useState(false);

  // Điền sẵn báo giá cũ (NCC được sửa khi RFQ còn mở).
  useEffect(() => {
    const v = view.data;
    if (!v) return;
    if (v.myQuote) {
      setPrices(Object.fromEntries(v.myQuote.lines.map((l) => [l.lineNo, String(l.unitPrice)])));
      setLeadTime(String(v.myQuote.leadTimeDays));
      setValidUntil(v.myQuote.validUntil.slice(0, 10));
    } else {
      const d = new Date(v.rfq.deadline);
      d.setDate(d.getDate() + 30);
      setValidUntil(d.toISOString().slice(0, 10));
    }
  }, [view.data]);

  const submit = useMutation({
    mutationFn: () =>
      api<SupplierPortalView>(`${path}/quote`, {
        method: 'PUT',
        body: {
          leadTimeDays: Number(leadTimeDays),
          validUntil: new Date(`${validUntil}T23:59:59`).toISOString(),
          note: note || undefined,
          lines: view.data!.rfq.lines.map((l) => ({
            lineNo: l.lineNo,
            unitPrice: Number(prices[l.lineNo]),
          })),
        },
      }),
    onSuccess: (data) => {
      qc.setQueryData(['portal', token], data);
      setDone(true);
    },
  });

  const total =
    view.data?.rfq.lines.reduce((s, l) => s + (Number(prices[l.lineNo]) || 0) * l.quantity, 0) ?? 0;

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setDone(false);
    submit.mutate();
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <p className="mb-6 text-lg font-semibold">
        Procure<span className="text-brand">X</span> · Cổng báo giá nhà cung cấp
      </p>
      {view.isPending ? (
        <Loading />
      ) : view.error ? (
        <ErrorBox
          message={
            view.error instanceof ApiError && view.error.status === 404
              ? 'Link báo giá không hợp lệ hoặc đã bị thay thế. Vui lòng liên hệ bên mua.'
              : errorMessage(view.error)
          }
        />
      ) : (
        <form onSubmit={onSubmit} className="space-y-5">
          <Card
            title={`Kính gửi ${view.data.supplierName}`}
            actions={
              <Badge tone={STATUS_TONE[view.data.rfq.status]}>
                {RFQ_STATUS_LABEL[view.data.rfq.status]}
              </Badge>
            }
          >
            <p className="mb-4 text-sm text-muted">
              Hạn báo giá: <strong className="text-text">{dt(view.data.rfq.deadline)}</strong>. Nhập
              đơn giá (VND, chưa VAT) cho từng dòng.
            </p>
            <Table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Hàng hoá</th>
                  <th className="text-right">SL</th>
                  <th className="w-40">Đơn giá</th>
                  <th className="text-right">Thành tiền</th>
                </tr>
              </thead>
              <tbody>
                {view.data.rfq.lines.map((l) => (
                  <tr key={l.lineNo}>
                    <td className="num">{l.lineNo}</td>
                    <td>
                      {l.productName}
                      <p className="text-xs text-muted">{l.sku}</p>
                    </td>
                    <td className="text-right num">
                      {l.quantity} {l.unit}
                    </td>
                    <td>
                      <Input
                        type="number"
                        min={1}
                        step={1}
                        required
                        disabled={!view.data.rfq.acceptingQuotes}
                        value={prices[l.lineNo] ?? ''}
                        onChange={(e) => setPrices({ ...prices, [l.lineNo]: e.target.value })}
                        aria-label={`Đơn giá dòng ${l.lineNo}`}
                      />
                    </td>
                    <td className="text-right num">
                      {vnd((Number(prices[l.lineNo]) || 0) * l.quantity)}
                    </td>
                  </tr>
                ))}
                <tr>
                  <td colSpan={4} className="text-right font-semibold">
                    Tổng
                  </td>
                  <td className="text-right font-semibold num">{vnd(total)}</td>
                </tr>
              </tbody>
            </Table>
          </Card>

          {view.data.rfq.acceptingQuotes ? (
            <Card title="Điều kiện">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Thời gian giao hàng (ngày)">
                  <Input
                    type="number"
                    min={0}
                    max={365}
                    value={leadTimeDays}
                    onChange={(e) => setLeadTime(e.target.value)}
                    required
                  />
                </Field>
                <Field label="Báo giá có hiệu lực đến">
                  <Input
                    type="date"
                    value={validUntil}
                    onChange={(e) => setValidUntil(e.target.value)}
                    required
                  />
                </Field>
              </div>
              <div className="mt-4">
                <Field label="Ghi chú">
                  <Textarea
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    maxLength={2000}
                  />
                </Field>
              </div>
              <div className="mt-4 space-y-3">
                {submit.error && <ErrorBox message={errorMessage(submit.error)} />}
                {done && (
                  <p className="text-sm text-ok" role="status">
                    Đã gửi báo giá. Bạn có thể sửa và gửi lại trước hạn.
                  </p>
                )}
                <Button type="submit" loading={submit.isPending}>
                  {view.data.myQuote ? 'Cập nhật báo giá' : 'Gửi báo giá'}
                </Button>
              </div>
            </Card>
          ) : (
            <ErrorBox message="RFQ đã hết hạn nhận báo giá." />
          )}
        </form>
      )}
    </main>
  );
}
