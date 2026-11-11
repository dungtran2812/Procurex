'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import {
  Badge,
  Button,
  Card,
  Empty,
  ErrorBox,
  Field,
  Input,
  Loading,
  PageHeader,
  Table,
} from '@/components/ui';
import { api, errorMessage } from '@/lib/client/api';
import type { Supplier } from '@/lib/types';

export default function SuppliersPage() {
  const qc = useQueryClient();
  const list = useQuery({ queryKey: ['suppliers'], queryFn: () => api<Supplier[]>('suppliers') });
  const [form, setForm] = useState({ name: '', email: '', taxCode: '' });

  const create = useMutation({
    mutationFn: () =>
      api<Supplier>('suppliers', {
        method: 'POST',
        body: { name: form.name, email: form.email, taxCode: form.taxCode || undefined },
      }),
    onSuccess: () => {
      setForm({ name: '', email: '', taxCode: '' });
      qc.invalidateQueries({ queryKey: ['suppliers'] });
    },
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    create.mutate();
  }

  return (
    <>
      <PageHeader title="Nhà cung cấp" subtitle="Danh bạ riêng của công ty bạn." />
      <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
        <Card title="Danh sách">
          {list.isPending ? (
            <Loading />
          ) : list.error ? (
            <ErrorBox message={errorMessage(list.error)} />
          ) : list.data.length === 0 ? (
            <Empty>Chưa có nhà cung cấp.</Empty>
          ) : (
            <Table>
              <thead>
                <tr>
                  <th>Tên</th>
                  <th>Email</th>
                  <th>MST</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {list.data.map((s) => (
                  <tr key={s.id}>
                    <td className="font-medium">{s.name}</td>
                    <td>{s.email}</td>
                    <td className="num">{s.taxCode ?? '—'}</td>
                    <td>{!s.isActive && <Badge>Ngừng</Badge>}</td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
        <Card title="Thêm nhà cung cấp" className="h-fit">
          <form onSubmit={onSubmit} className="space-y-4">
            {create.error && <ErrorBox message={errorMessage(create.error)} />}
            <Field label="Tên">
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
                minLength={2}
              />
            </Field>
            <Field label="Email nhận RFQ">
              <Input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                required
              />
            </Field>
            <Field label="Mã số thuế (tuỳ chọn)">
              <Input
                value={form.taxCode}
                onChange={(e) => setForm({ ...form, taxCode: e.target.value })}
                pattern="\d{10}(-\d{3})?"
              />
            </Field>
            <Button type="submit" className="w-full" loading={create.isPending}>
              Thêm
            </Button>
          </form>
        </Card>
      </div>
    </>
  );
}
