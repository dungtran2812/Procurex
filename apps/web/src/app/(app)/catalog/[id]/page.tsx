'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { use, useState } from 'react';
import { useCart } from '@/components/cart';
import { Badge, Button, Card, ErrorBox, Field, Input, Loading, Table } from '@/components/ui';
import { ApiError, api, errorMessage } from '@/lib/client/api';
import { useDebounced } from '@/lib/client/hooks';
import { specLabel, vnd } from '@/lib/format';
import type { Product, Quote } from '@/lib/types';

export default function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const cart = useCart();
  const [qty, setQty] = useState('1');
  const [added, setAdded] = useState(false);
  const quantity = Number(qty);
  const debouncedQty = useDebounced(quantity, 300);

  const product = useQuery({
    queryKey: ['product', id],
    queryFn: () => api<Product>(`products/${id}`),
  });

  // Báo giá theo CÔNG TY của người dùng (giá hợp đồng nếu có) — tính ở server, FE chỉ hiển thị.
  const quote = useQuery({
    queryKey: ['quote', id, debouncedQty],
    queryFn: () => api<Quote>(`products/${id}/quote?qty=${debouncedQty}`),
    enabled: Number.isInteger(debouncedQty) && debouncedQty > 0,
    placeholderData: keepPreviousData,
    retry: false,
  });

  if (product.isPending) return <Loading />;
  if (product.error) {
    return (
      <ErrorBox
        message={
          product.error instanceof ApiError && product.error.status === 404
            ? 'Sản phẩm không tồn tại hoặc đã ngừng bán.'
            : errorMessage(product.error)
        }
      />
    );
  }
  const p = product.data;
  const validQty = Number.isInteger(quantity) && quantity >= p.minOrderQty;

  return (
    <div className="space-y-5">
      <nav className="text-sm text-muted">
        <Link href={`/catalog?category=${p.categorySlug}`} className="hover:underline">
          ← Danh mục
        </Link>
      </nav>
      <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
        <div className="space-y-5">
          <div>
            <p className="text-sm text-muted">{p.sku}</p>
            <h1 className="mt-1 text-xl font-semibold">{p.name}</h1>
          </div>
          <Card title="Thông số kỹ thuật">
            <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
              {Object.entries(p.specs).map(([k, v]) => (
                <div key={k} className="contents">
                  <dt className="text-muted">{specLabel(k)}</dt>
                  <dd>{String(v)}</dd>
                </div>
              ))}
            </dl>
          </Card>
          <Card title="Bảng giá theo số lượng">
            <Table>
              <thead>
                <tr>
                  <th>Số lượng</th>
                  <th className="text-right">Đơn giá / {p.unit}</th>
                </tr>
              </thead>
              <tbody>
                {p.tiers.map((t, i) => (
                  <tr key={t.minQty}>
                    <td className="num">
                      {t.minQty}
                      {p.tiers[i + 1] ? ` – ${p.tiers[i + 1].minQty - 1}` : '+'}
                    </td>
                    <td className="text-right num">{vnd(t.unitPrice)}</td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Card>
        </div>

        <Card title="Báo giá cho công ty bạn" className="h-fit lg:sticky lg:top-20">
          <div className="space-y-4">
            <Field
              label={`Số lượng (${p.unit})`}
              error={qty && !validQty ? `Tối thiểu ${p.minOrderQty}, số nguyên` : undefined}
              hint={p.minOrderQty > 1 ? `Đặt tối thiểu ${p.minOrderQty}` : undefined}
            >
              <Input
                type="number"
                min={p.minOrderQty}
                step={1}
                value={qty}
                onChange={(e) => {
                  setQty(e.target.value);
                  setAdded(false);
                }}
                inputMode="numeric"
              />
            </Field>
            {validQty && quote.data && (
              <dl className={`space-y-1 text-sm ${quote.isPlaceholderData ? 'opacity-60' : ''}`}>
                <div className="flex justify-between">
                  <dt className="text-muted">Đơn giá</dt>
                  <dd className="num">{vnd(quote.data.unitPrice)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted">Nguồn giá</dt>
                  <dd>
                    {quote.data.source === 'CONTRACT' ? (
                      <Badge tone="ok">Giá hợp đồng</Badge>
                    ) : (
                      <Badge>Giá niêm yết</Badge>
                    )}
                  </dd>
                </div>
                <div className="flex justify-between border-t border-border pt-2 text-base font-semibold">
                  <dt>Thành tiền</dt>
                  <dd className="num">{vnd(quote.data.lineTotal)}</dd>
                </div>
              </dl>
            )}
            {validQty && quote.error && <ErrorBox message={errorMessage(quote.error)} />}
            <Button
              className="w-full"
              disabled={!validQty}
              onClick={() => {
                cart.add({
                  productId: p.id,
                  sku: p.sku,
                  name: p.name,
                  unit: p.unit,
                  minOrderQty: p.minOrderQty,
                  quantity,
                });
                setAdded(true);
              }}
            >
              Thêm vào giỏ
            </Button>
            {added && (
              <p className="text-center text-sm text-ok" role="status">
                Đã thêm.{' '}
                <Link href="/cart" className="underline">
                  Xem giỏ hàng
                </Link>
              </p>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
