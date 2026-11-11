'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import {
  Badge,
  Card,
  Empty,
  ErrorBox,
  Loading,
  PageHeader,
  STATUS_TONE,
  Table,
} from '@/components/ui';
import { api, errorMessage } from '@/lib/client/api';
import { ERP_STATUS_LABEL, dt, vnd } from '@/lib/format';
import type { PurchaseOrder } from '@/lib/types';

export default function PurchaseOrdersPage() {
  const list = useQuery({
    queryKey: ['purchase-orders'],
    queryFn: () => api<PurchaseOrder[]>('purchase-orders'),
    // Còn PO đang đồng bộ ERP → tự làm mới để thấy trạng thái cập nhật.
    refetchInterval: (q) =>
      q.state.data?.some((p) => p.erpSyncStatus === 'PENDING') ? 3000 : false,
  });

  return (
    <>
      <PageHeader title="Đơn đặt hàng (PO)" />
      <Card>
        {list.isPending ? (
          <Loading />
        ) : list.error ? (
          <ErrorBox message={errorMessage(list.error)} />
        ) : list.data.length === 0 ? (
          <Empty>Chưa có PO. PO được tạo khi chọn thầu một RFQ.</Empty>
        ) : (
          <Table>
            <thead>
              <tr>
                <th>Số PO</th>
                <th>Nhà cung cấp</th>
                <th className="text-right">Tổng</th>
                <th>ERP</th>
                <th>Ngày</th>
              </tr>
            </thead>
            <tbody>
              {list.data.map((po) => (
                <tr key={po.id}>
                  <td>
                    <Link
                      href={`/purchase-orders/${po.id}`}
                      className="font-medium text-brand hover:underline num"
                    >
                      {po.poNumber}
                    </Link>
                  </td>
                  <td>{po.supplierName}</td>
                  <td className="text-right num">{vnd(po.totalAmount)}</td>
                  <td>
                    <Badge tone={STATUS_TONE[po.erpSyncStatus]}>
                      {ERP_STATUS_LABEL[po.erpSyncStatus]}
                    </Badge>
                  </td>
                  <td className="text-muted">{dt(po.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}
