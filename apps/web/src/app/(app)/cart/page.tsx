'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { useCart } from '@/components/cart';
import {
  Button,
  ButtonLink,
  Card,
  Empty,
  ErrorBox,
  Field,
  Input,
  PageHeader,
  Table,
  Textarea,
} from '@/components/ui';
import { api, errorMessage } from '@/lib/client/api';
import { useIdempotencyKey } from '@/lib/client/hooks';
import type { PurchaseRequest } from '@/lib/types';

export default function CartPage() {
  const cart = useCart();
  const router = useRouter();
  const qc = useQueryClient();
  const [title, setTitle] = useState('');
  const [note, setNote] = useState('');
  // 1 key cho 1 lần "tạo PR": bấm 2 lần / mạng chập chờn gửi lại → server trả đúng PR cũ.
  const [idemKey, resetKey] = useIdempotencyKey();

  const create = useMutation({
    mutationFn: () =>
      api<PurchaseRequest>('purchase-requests', {
        method: 'POST',
        idempotencyKey: idemKey,
        body: {
          title,
          note: note || undefined,
          lines: cart.items.map((i) => ({ productId: i.productId, quantity: i.quantity })),
        },
      }),
    onSuccess: (pr) => {
      cart.clear();
      resetKey();
      qc.invalidateQueries({ queryKey: ['purchase-requests'] });
      router.push(`/purchase-requests/${pr.id}`);
    },
  });

  const invalid = cart.items.some(
    (i) => !Number.isInteger(i.quantity) || i.quantity < i.minOrderQty,
  );

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    create.mutate();
  }

  if (cart.items.length === 0) {
    return (
      <>
        <PageHeader title="Giỏ hàng" />
        <Card>
          <Empty>
            Giỏ hàng trống.{' '}
            <Link href="/catalog" className="text-brand underline">
              Tìm sản phẩm
            </Link>
          </Empty>
        </Card>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Giỏ hàng"
        subtitle="Giá được chốt (snapshot) tại thời điểm tạo đề nghị mua."
      />
      <form onSubmit={onSubmit} className="grid gap-5 lg:grid-cols-[1fr_340px]">
        <Card title={`${cart.items.length} sản phẩm`}>
          <Table>
            <thead>
              <tr>
                <th>Sản phẩm</th>
                <th className="w-32">Số lượng</th>
                <th className="w-16" />
              </tr>
            </thead>
            <tbody>
              {cart.items.map((i) => (
                <tr key={i.productId}>
                  <td>
                    <Link href={`/catalog/${i.productId}`} className="font-medium hover:underline">
                      {i.name}
                    </Link>
                    <p className="text-xs text-muted">{i.sku}</p>
                  </td>
                  <td>
                    <Input
                      type="number"
                      min={i.minOrderQty}
                      step={1}
                      value={i.quantity}
                      aria-label={`Số lượng ${i.sku}`}
                      onChange={(e) => cart.setQuantity(i.productId, Number(e.target.value))}
                    />
                    <span className="text-xs text-muted">{i.unit}</span>
                  </td>
                  <td>
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => cart.remove(i.productId)}
                      aria-label={`Xoá ${i.sku}`}
                    >
                      ✕
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
        <Card title="Tạo đề nghị mua (PR)" className="h-fit">
          <div className="space-y-4">
            {create.error && <ErrorBox message={errorMessage(create.error)} />}
            <Field label="Tiêu đề">
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                minLength={3}
                maxLength={200}
                placeholder="VD: Vật tư bảo trì dây chuyền 2"
              />
            </Field>
            <Field label="Ghi chú">
              <Textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000} />
            </Field>
            {invalid && (
              <p className="text-sm text-danger">Có dòng có số lượng dưới mức tối thiểu.</p>
            )}
            <Button type="submit" className="w-full" loading={create.isPending} disabled={invalid}>
              Tạo PR (bản nháp)
            </Button>
            <ButtonLink href="/catalog">Tiếp tục chọn hàng</ButtonLink>
          </div>
        </Card>
      </form>
    </>
  );
}
