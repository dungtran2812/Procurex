'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState, type FormEvent } from 'react';
import { Button, Card, Empty, ErrorBox, Field, Input, Loading, PageHeader } from '@/components/ui';
import { api, errorMessage } from '@/lib/client/api';
import { useIdempotencyKey } from '@/lib/client/hooks';
import { vnd } from '@/lib/format';
import type { PurchaseRequest, RfqDetail, Supplier } from '@/lib/types';

/** Giá trị cho <input type="datetime-local"> theo giờ máy người dùng. */
function localInputValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function NewRfqForm() {
  const prId = useSearchParams().get('prId') ?? '';
  const router = useRouter();
  const qc = useQueryClient();
  const [selected, setSelected] = useState<string[]>([]);
  const [deadline, setDeadline] = useState(() =>
    localInputValue(new Date(Date.now() + 3 * 86400_000)),
  );
  const [idemKey] = useIdempotencyKey();

  const pr = useQuery({
    queryKey: ['purchase-request', prId],
    queryFn: () => api<PurchaseRequest>(`purchase-requests/${prId}`),
    enabled: !!prId,
  });
  const suppliers = useQuery({
    queryKey: ['suppliers'],
    queryFn: () => api<Supplier[]>('suppliers'),
  });

  const create = useMutation({
    mutationFn: () =>
      api<RfqDetail>('rfqs', {
        method: 'POST',
        idempotencyKey: idemKey,
        // datetime-local là giờ địa phương; new Date() hiểu đúng rồi toISOString() đổi sang UTC.
        body: { prId, supplierIds: selected, deadline: new Date(deadline).toISOString() },
      }),
    onSuccess: (rfq) => {
      qc.invalidateQueries({ queryKey: ['rfqs'] });
      router.push(`/rfqs/${rfq.id}`);
    },
  });

  if (!prId) return <ErrorBox message="Thiếu PR. Hãy tạo RFQ từ trang chi tiết PR đã duyệt." />;
  if (pr.isPending || suppliers.isPending) return <Loading />;
  if (pr.error) return <ErrorBox message={errorMessage(pr.error)} />;

  const toggle = (id: string) =>
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    create.mutate();
  }

  return (
    <>
      <PageHeader
        title="Tạo RFQ"
        subtitle={`Từ PR: ${pr.data.title} · ${vnd(pr.data.totalAmount)}`}
      />
      <form onSubmit={onSubmit} className="grid gap-5 lg:grid-cols-[1fr_340px]">
        <Card title="Mời nhà cung cấp">
          {suppliers.data?.length === 0 ? (
            <Empty>
              Chưa có nhà cung cấp.{' '}
              <Link href="/suppliers" className="text-brand underline">
                Thêm nhà cung cấp
              </Link>
            </Empty>
          ) : (
            <ul className="divide-y divide-border">
              {suppliers.data
                ?.filter((s) => s.isActive)
                .map((s) => (
                  <li key={s.id}>
                    <label className="flex cursor-pointer items-center gap-3 py-2.5 text-sm">
                      <input
                        type="checkbox"
                        checked={selected.includes(s.id)}
                        onChange={() => toggle(s.id)}
                      />
                      <span className="flex-1">
                        <span className="font-medium">{s.name}</span>
                        <span className="block text-xs text-muted">{s.email}</span>
                      </span>
                    </label>
                  </li>
                ))}
            </ul>
          )}
        </Card>
        <Card title="Thiết lập" className="h-fit">
          <div className="space-y-4">
            {create.error && <ErrorBox message={errorMessage(create.error)} />}
            <Field
              label="Hạn nhận báo giá"
              hint="Ít nhất 1 giờ kể từ bây giờ. Hết hạn hệ thống tự đóng RFQ."
            >
              <Input
                type="datetime-local"
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
                required
              />
            </Field>
            <p className="text-sm text-muted">
              Mỗi nhà cung cấp nhận 1 link riêng qua email để báo giá (không cần tài khoản).
            </p>
            <Button
              type="submit"
              className="w-full"
              disabled={selected.length === 0}
              loading={create.isPending}
            >
              Gửi RFQ cho {selected.length} nhà cung cấp
            </Button>
          </div>
        </Card>
      </form>
    </>
  );
}

export default function NewRfqPage() {
  return (
    <Suspense fallback={<Loading />}>
      <NewRfqForm />
    </Suspense>
  );
}
