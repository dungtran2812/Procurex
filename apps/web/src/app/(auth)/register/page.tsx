'use client';

import { useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Button, Card, ErrorBox, Field, Input } from '@/components/ui';
import { authCall, errorMessage } from '@/lib/client/api';

export default function RegisterPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setLoading(true);
    setError(undefined);
    try {
      await authCall('register', {
        companyName: f.get('companyName'),
        taxCode: f.get('taxCode'),
        adminFullName: f.get('adminFullName'),
        adminEmail: f.get('adminEmail'),
        adminPassword: f.get('adminPassword'),
      });
      qc.clear();
      router.replace('/settings');
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
      setLoading(false);
    }
  }

  return (
    <Card title="Đăng ký doanh nghiệp">
      <form onSubmit={onSubmit} className="space-y-4">
        {error && <ErrorBox message={error} />}
        <Field label="Tên công ty">
          <Input name="companyName" required minLength={2} autoFocus />
        </Field>
        <Field label="Mã số thuế" hint="10 số, hoặc 10 số + -xxx cho chi nhánh">
          <Input name="taxCode" required pattern="\d{10}(-\d{3})?" inputMode="numeric" />
        </Field>
        <Field label="Họ tên quản trị viên">
          <Input name="adminFullName" required />
        </Field>
        <Field label="Email quản trị viên">
          <Input name="adminEmail" type="email" autoComplete="username" required />
        </Field>
        <Field label="Mật khẩu" hint="Tối thiểu 8 ký tự">
          <Input
            name="adminPassword"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
          />
        </Field>
        <Button type="submit" loading={loading} className="w-full">
          Tạo tài khoản
        </Button>
        <p className="text-center text-sm text-muted">
          Đã có tài khoản?{' '}
          <Link href="/login" className="text-brand underline">
            Đăng nhập
          </Link>
        </p>
      </form>
    </Card>
  );
}
