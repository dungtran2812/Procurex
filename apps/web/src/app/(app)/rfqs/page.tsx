'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';
import {
  Badge,
  Card,
  Empty,
  ErrorBox,
  Loading,
  PageHeader,
  STATUS_TONE,
  Select,
  Table,
} from '@/components/ui';
import { api, errorMessage } from '@/lib/client/api';
import { RFQ_STATUS_LABEL, dt } from '@/lib/format';
import type { Rfq } from '@/lib/types';

export default function RfqsPage() {
  const [status, setStatus] = useState('');
  const list = useQuery({
    queryKey: ['rfqs', status],
    queryFn: () => api<Rfq[]>(`rfqs${status ? `?status=${status}` : ''}`),
  });

  return (
    <>
      <PageHeader
        title="Yêu cầu báo giá (RFQ)"
        subtitle="Tạo RFQ từ một PR đã được duyệt (trang chi tiết PR → Tạo RFQ)."
      />
      <Card
        title="Danh sách"
        actions={
          <Select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="w-52"
            aria-label="Lọc trạng thái"
          >
            <option value="">Mọi trạng thái</option>
            {Object.entries(RFQ_STATUS_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </Select>
        }
      >
        {list.isPending ? (
          <Loading />
        ) : list.error ? (
          <ErrorBox message={errorMessage(list.error)} onRetry={() => list.refetch()} />
        ) : list.data.length === 0 ? (
          <Empty>Chưa có RFQ.</Empty>
        ) : (
          <Table>
            <thead>
              <tr>
                <th>RFQ</th>
                <th>Trạng thái</th>
                <th className="text-right">Số dòng</th>
                <th>Hạn báo giá</th>
                <th>Tạo lúc</th>
              </tr>
            </thead>
            <tbody>
              {list.data.map((r) => (
                <tr key={r.id}>
                  <td>
                    <Link href={`/rfqs/${r.id}`} className="font-medium text-brand hover:underline">
                      {r.lines[0]?.productName ?? r.id.slice(0, 8)}
                      {r.lines.length > 1 && ` +${r.lines.length - 1}`}
                    </Link>
                  </td>
                  <td>
                    <Badge tone={STATUS_TONE[r.status]}>{RFQ_STATUS_LABEL[r.status]}</Badge>
                  </td>
                  <td className="text-right num">{r.lines.length}</td>
                  <td>{dt(r.deadline)}</td>
                  <td className="text-muted">{dt(r.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}
