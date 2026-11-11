'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { use, useState } from 'react';
import {
  Badge,
  Button,
  ButtonLink,
  Card,
  ErrorBox,
  Field,
  Loading,
  PageHeader,
  STATUS_TONE,
  Table,
  Textarea,
} from '@/components/ui';
import { ApiError, api, errorMessage } from '@/lib/client/api';
import { useIdempotencyKey, useMe } from '@/lib/client/hooks';
import { PR_STATUS_LABEL, dt, shortId, vnd } from '@/lib/format';
import type { AuditEntry, PrAction, PurchaseRequest } from '@/lib/types';

const ACTION_LABEL: Record<PrAction, string> = {
  SUBMIT: 'Gửi duyệt',
  APPROVE: 'Duyệt',
  REJECT: 'Từ chối',
  CANCEL: 'Hủy PR',
};

const AUDIT_LABEL: Record<string, string> = {
  CREATE: 'Tạo PR',
  SUBMIT: 'Gửi duyệt',
  APPROVE: 'Duyệt',
  REJECT: 'Từ chối',
  CANCEL: 'Hủy',
};

export default function PurchaseRequestPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const me = useMe();
  const qc = useQueryClient();
  const [comment, setComment] = useState('');
  const [idemKey, resetKey] = useIdempotencyKey();

  const pr = useQuery({
    queryKey: ['purchase-request', id],
    queryFn: () => api<PurchaseRequest>(`purchase-requests/${id}`),
  });
  const history = useQuery({
    queryKey: ['purchase-request', id, 'history'],
    queryFn: () => api<AuditEntry[]>(`purchase-requests/${id}/history`),
  });

  const act = useMutation({
    mutationFn: (action: PrAction) =>
      api<PurchaseRequest>(`purchase-requests/${id}/${action.toLowerCase()}`, {
        method: 'POST',
        idempotencyKey: idemKey,
        body:
          action === 'APPROVE' || action === 'REJECT'
            ? { comment: comment || undefined }
            : undefined,
      }),
    onSuccess: (updated) => {
      // Server trả PR mới (kèm allowedActions mới) → ghi thẳng vào cache, không cần tải lại.
      qc.setQueryData(['purchase-request', id], updated);
      qc.invalidateQueries({ queryKey: ['purchase-request', id, 'history'] });
      qc.invalidateQueries({ queryKey: ['purchase-requests'] });
      setComment('');
      resetKey();
    },
    onError: (e) => {
      // Người khác vừa đổi PR (optimistic locking) → tải lại để thấy trạng thái thật.
      if (
        e instanceof ApiError &&
        (e.code === 'CONCURRENT_MODIFICATION' || e.code === 'INVALID_TRANSITION')
      ) {
        qc.invalidateQueries({ queryKey: ['purchase-request', id] });
      }
      resetKey();
    },
  });

  if (pr.isPending) return <Loading />;
  if (pr.error) return <ErrorBox message={errorMessage(pr.error)} />;
  const p = pr.data;
  const who = (userId: string | null) =>
    userId === me.data?.id ? 'Bạn' : userId ? shortId(userId) : '—';
  const canDecide = p.allowedActions.includes('APPROVE');
  const canSource = p.status === 'APPROVED' && me.data && me.data.role !== 'APPROVER';

  return (
    <>
      <PageHeader
        title={p.title}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <Badge tone={STATUS_TONE[p.status]}>{PR_STATUS_LABEL[p.status]}</Badge>
            <span>Người tạo: {who(p.requesterId)}</span>
            <span>· Tạo {dt(p.createdAt)}</span>
          </span>
        }
        actions={
          canSource && (
            <ButtonLink href={`/rfqs/new?prId=${p.id}`} variant="primary">
              Tạo RFQ
            </ButtonLink>
          )
        }
      />
      <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
        <div className="space-y-5">
          <Card title="Dòng hàng (giá đã chốt)">
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
                      <p className="text-xs text-muted">
                        {l.sku} · {l.priceSource === 'CONTRACT' ? 'giá hợp đồng' : 'giá niêm yết'}
                      </p>
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
            {p.note && <p className="mt-3 text-sm text-muted">Ghi chú: {p.note}</p>}
          </Card>

          <Card title="Lịch sử">
            {history.isPending ? (
              <Loading />
            ) : (
              <ol className="space-y-3 text-sm">
                {history.data?.map((h) => (
                  <li key={h.id} className="flex gap-3">
                    <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand" aria-hidden />
                    <div>
                      <p>
                        <span className="font-medium">{AUDIT_LABEL[h.action] ?? h.action}</span>
                        {typeof h.data.level === 'number' && ` cấp ${h.data.level}`} ·{' '}
                        {who(h.actorId)}
                      </p>
                      <p className="text-xs text-muted">
                        {dt(h.createdAt)}
                        {h.fromStatus &&
                          h.toStatus &&
                          h.fromStatus !== h.toStatus &&
                          ` · ${PR_STATUS_LABEL[h.fromStatus]} → ${PR_STATUS_LABEL[h.toStatus]}`}
                      </p>
                      {typeof h.data.comment === 'string' && (
                        <p className="mt-1 text-muted">“{h.data.comment}”</p>
                      )}
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </Card>
        </div>

        <div className="space-y-5">
          <Card title="Các cấp duyệt">
            {p.steps.length === 0 ? (
              <p className="text-sm text-muted">Sinh ra khi gửi duyệt, theo quy tắc của công ty.</p>
            ) : (
              <ol className="space-y-3 text-sm">
                {p.steps.map((s) => (
                  <li key={s.level} className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-medium">Cấp {s.level}</p>
                      <p className="text-xs text-muted">
                        Hạn mức người duyệt ≥ {vnd(s.minApproverLimit)}
                      </p>
                      {s.decidedBy && (
                        <p className="text-xs text-muted">
                          {who(s.decidedBy)} · {dt(s.decidedAt)}
                        </p>
                      )}
                    </div>
                    <Badge tone={STATUS_TONE[s.decision === 'PENDING' ? 'PENDING' : s.decision]}>
                      {s.decision === 'PENDING'
                        ? 'Chờ'
                        : s.decision === 'APPROVED'
                          ? 'Đã duyệt'
                          : 'Từ chối'}
                    </Badge>
                  </li>
                ))}
              </ol>
            )}
          </Card>

          {p.allowedActions.length > 0 && (
            <Card title="Thao tác">
              {/* Nút hiển thị theo allowedActions do SERVER tính — FE không tự đoán luật duyệt. */}
              <div className="space-y-3">
                {act.error && <ErrorBox message={errorMessage(act.error)} />}
                {canDecide && (
                  <Field label="Ý kiến" hint="Bắt buộc khi từ chối">
                    <Textarea
                      value={comment}
                      onChange={(e) => setComment(e.target.value)}
                      maxLength={1000}
                    />
                  </Field>
                )}
                <div className="flex flex-wrap gap-2">
                  {p.allowedActions.map((a) => (
                    <Button
                      key={a}
                      variant={
                        a === 'REJECT' || a === 'CANCEL'
                          ? a === 'REJECT'
                            ? 'danger'
                            : 'secondary'
                          : 'primary'
                      }
                      loading={act.isPending && act.variables === a}
                      disabled={act.isPending || (a === 'REJECT' && !comment.trim())}
                      onClick={() => act.mutate(a)}
                    >
                      {ACTION_LABEL[a]}
                    </Button>
                  ))}
                </div>
              </div>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
