'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';
import {
  Badge,
  ButtonLink,
  Card,
  Empty,
  ErrorBox,
  Loading,
  PageHeader,
  Pagination,
  STATUS_TONE,
  Select,
  Table,
} from '@/components/ui';
import { api, errorMessage } from '@/lib/client/api';
import { useMe } from '@/lib/client/hooks';
import { PR_STATUS_LABEL, dt, vnd } from '@/lib/format';
import type { Paged, PrSummary } from '@/lib/types';

export default function PurchaseRequestsPage() {
  const me = useMe();
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const qs = new URLSearchParams({ page: String(page), pageSize: '20', ...(status && { status }) });

  const list = useQuery({
    queryKey: ['purchase-requests', qs.toString()],
    queryFn: () => api<Paged<PrSummary>>(`purchase-requests?${qs}`),
    placeholderData: keepPreviousData,
  });

  return (
    <>
      <PageHeader
        title="Đề nghị mua"
        subtitle={me.data?.role === 'BUYER' ? 'Các PR bạn đã tạo.' : 'Mọi PR trong công ty.'}
        actions={
          <ButtonLink href="/catalog" variant="primary">
            + Tạo PR từ catalog
          </ButtonLink>
        }
      />
      <Card
        actions={
          <Select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
            aria-label="Lọc trạng thái"
            className="w-48"
          >
            <option value="">Mọi trạng thái</option>
            {Object.entries(PR_STATUS_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </Select>
        }
        title="Danh sách"
      >
        {list.isPending ? (
          <Loading />
        ) : list.error ? (
          <ErrorBox message={errorMessage(list.error)} onRetry={() => list.refetch()} />
        ) : list.data.items.length === 0 ? (
          <Empty>Chưa có PR nào.</Empty>
        ) : (
          <>
            <Table>
              <thead>
                <tr>
                  <th>Tiêu đề</th>
                  <th>Trạng thái</th>
                  <th className="text-right">Tổng tiền</th>
                  <th className="text-right">Số dòng</th>
                  <th>Tạo lúc</th>
                </tr>
              </thead>
              <tbody>
                {list.data.items.map((pr) => (
                  <tr key={pr.id}>
                    <td>
                      <Link
                        href={`/purchase-requests/${pr.id}`}
                        className="font-medium text-brand hover:underline"
                      >
                        {pr.title}
                      </Link>
                    </td>
                    <td>
                      <Badge tone={STATUS_TONE[pr.status]}>{PR_STATUS_LABEL[pr.status]}</Badge>
                    </td>
                    <td className="text-right num">{vnd(pr.totalAmount)}</td>
                    <td className="text-right num">{pr.lineCount}</td>
                    <td className="text-muted">{dt(pr.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </Table>
            <Pagination page={page} pageSize={20} total={list.data.total} onPage={setPage} />
          </>
        )}
      </Card>
    </>
  );
}
