'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState, type FormEvent } from 'react';
import {
  Button,
  Card,
  ErrorBox,
  Field,
  Input,
  Loading,
  PageHeader,
  Select,
  Table,
} from '@/components/ui';
import { api, errorMessage } from '@/lib/client/api';
import { useMe } from '@/lib/client/hooks';
import { ROLE_LABEL, vnd } from '@/lib/format';
import type { ApprovalRule, Role } from '@/lib/types';

function ApprovalRules() {
  const qc = useQueryClient();
  const rules = useQuery({
    queryKey: ['approval-rules'],
    queryFn: () => api<ApprovalRule[]>('approval-rules'),
  });
  const [draft, setDraft] = useState<ApprovalRule[]>([]);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (rules.data) {
      setDraft(rules.data.length ? rules.data : [{ level: 1, minTotal: 0, minApproverLimit: 0 }]);
    }
  }, [rules.data]);

  const save = useMutation({
    mutationFn: () =>
      api<ApprovalRule[]>('approval-rules', {
        method: 'PUT',
        body: { rules: draft.map((r, i) => ({ ...r, level: i + 1 })) },
      }),
    onSuccess: (data) => {
      qc.setQueryData(['approval-rules'], data);
      setSaved(true);
    },
  });

  const update = (i: number, patch: Partial<ApprovalRule>) => {
    setSaved(false);
    setDraft((d) => d.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  };

  if (rules.isPending) return <Loading />;

  return (
    <Card
      title="Quy tắc duyệt nhiều cấp"
      actions={
        <Button
          variant="secondary"
          disabled={draft.length >= 10}
          onClick={() => {
            setSaved(false);
            const last = draft.at(-1);
            setDraft([
              ...draft,
              {
                level: draft.length + 1,
                minTotal: last?.minTotal ?? 0,
                minApproverLimit: last?.minApproverLimit ?? 0,
              },
            ]);
          }}
        >
          + Thêm cấp
        </Button>
      }
    >
      <p className="mb-3 text-sm text-muted">
        PR có tổng tiền ≥ “Áp dụng từ” sẽ cần thêm cấp đó. Người duyệt cấp đó phải có hạn mức ≥ “Hạn
        mức tối thiểu”.
      </p>
      {save.error && (
        <div className="mb-3">
          <ErrorBox message={errorMessage(save.error)} />
        </div>
      )}
      <Table>
        <thead>
          <tr>
            <th>Cấp</th>
            <th>Áp dụng từ (VND)</th>
            <th>Hạn mức tối thiểu người duyệt (VND)</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {draft.map((r, i) => (
            <tr key={i}>
              <td className="num">{i + 1}</td>
              <td>
                <Input
                  type="number"
                  min={0}
                  step={1000}
                  value={r.minTotal}
                  onChange={(e) => update(i, { minTotal: Number(e.target.value) })}
                  aria-label={`Ngưỡng cấp ${i + 1}`}
                />
                <span className="text-xs text-muted">{vnd(r.minTotal)}</span>
              </td>
              <td>
                <Input
                  type="number"
                  min={0}
                  step={1000}
                  value={r.minApproverLimit}
                  onChange={(e) => update(i, { minApproverLimit: Number(e.target.value) })}
                  aria-label={`Hạn mức cấp ${i + 1}`}
                />
                <span className="text-xs text-muted">{vnd(r.minApproverLimit)}</span>
              </td>
              <td>
                {draft.length > 1 && (
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setSaved(false);
                      setDraft(draft.filter((_, j) => j !== i));
                    }}
                    aria-label={`Xoá cấp ${i + 1}`}
                  >
                    ✕
                  </Button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </Table>
      <div className="mt-4 flex items-center gap-3">
        <Button loading={save.isPending} onClick={() => save.mutate()}>
          Lưu quy tắc
        </Button>
        {saved && (
          <span className="text-sm text-ok" role="status">
            Đã lưu.
          </span>
        )}
      </div>
    </Card>
  );
}

function CreateUser() {
  const [form, setForm] = useState({
    email: '',
    password: '',
    fullName: '',
    role: 'BUYER' as Role,
    approvalLimit: 0,
  });
  const [created, setCreated] = useState<string>();
  const create = useMutation({
    mutationFn: () => api<{ email: string }>('users', { method: 'POST', body: form }),
    onSuccess: (u) => {
      setCreated(u.email);
      setForm({ email: '', password: '', fullName: '', role: 'BUYER', approvalLimit: 0 });
    },
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setCreated(undefined);
    create.mutate();
  }

  return (
    <Card title="Thêm người dùng">
      <form onSubmit={onSubmit} className="space-y-4">
        {create.error && <ErrorBox message={errorMessage(create.error)} />}
        {created && (
          <p className="text-sm text-ok" role="status">
            Đã tạo {created}.
          </p>
        )}
        <Field label="Họ tên">
          <Input
            value={form.fullName}
            onChange={(e) => setForm({ ...form, fullName: e.target.value })}
            required
          />
        </Field>
        <Field label="Email">
          <Input
            type="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            required
          />
        </Field>
        <Field label="Mật khẩu tạm" hint="Tối thiểu 8 ký tự">
          <Input
            type="password"
            autoComplete="new-password"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            required
            minLength={8}
          />
        </Field>
        <Field label="Vai trò">
          <Select
            value={form.role}
            onChange={(e) => setForm({ ...form, role: e.target.value as Role })}
          >
            {Object.entries(ROLE_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </Select>
        </Field>
        {form.role !== 'BUYER' && (
          <Field label="Hạn mức duyệt (VND)">
            <Input
              type="number"
              min={0}
              step={1000}
              value={form.approvalLimit}
              onChange={(e) => setForm({ ...form, approvalLimit: Number(e.target.value) })}
            />
          </Field>
        )}
        <Button type="submit" loading={create.isPending}>
          Tạo người dùng
        </Button>
      </form>
    </Card>
  );
}

export default function SettingsPage() {
  const me = useMe();
  if (me.data && me.data.role !== 'ADMIN') {
    return <ErrorBox message="Chỉ quản trị viên được truy cập trang này." />;
  }
  return (
    <>
      <PageHeader title="Cài đặt công ty" />
      <div className="grid gap-5 xl:grid-cols-[1fr_380px]">
        <ApprovalRules />
        <CreateUser />
      </div>
    </>
  );
}
