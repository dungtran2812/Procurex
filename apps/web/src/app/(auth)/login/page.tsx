'use client';

import { useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState, type FormEvent } from 'react';
import { Button, Card, ErrorBox, Field, Input } from '@/components/ui';
import { authCall, errorMessage } from '@/lib/client/api';

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const qc = useQueryClient();
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setLoading(true);
    setError(undefined);
    try {
      await authCall('login', { email: form.get('email'), password: form.get('password') });
      qc.clear(); // không giữ cache của phiên trước
      // Chỉ cho chuyển hướng nội bộ (chống open redirect: ?next=https://evil.com).
      const next = params.get('next');
      router.replace(next?.startsWith('/') && !next.startsWith('//') ? next : '/catalog');
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
      setLoading(false);
    }
  }

  return (
    <Card title="Đăng nhập">
      <form onSubmit={onSubmit} className="space-y-4">
        {error && <ErrorBox message={error} />}
        <Field label="Email">
          <Input name="email" type="email" autoComplete="username" required autoFocus />
        </Field>
        <Field label="Mật khẩu">
          <Input name="password" type="password" autoComplete="current-password" required />
        </Field>
        <Button type="submit" loading={loading} className="w-full">
          Đăng nhập
        </Button>
        <p className="text-center text-sm text-muted">
          Doanh nghiệp mới?{' '}
          <Link href="/register" className="text-brand underline">
            Đăng ký
          </Link>
        </p>
      </form>
    </Card>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
