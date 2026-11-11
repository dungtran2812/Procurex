'use client';

import { useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { ApiError, authCall } from '@/lib/client/api';
import { useMe } from '@/lib/client/hooks';
import { ROLE_LABEL } from '@/lib/format';
import type { Role } from '@/lib/types';
import { useCart } from './cart';
import { ErrorBox, Loading } from './ui';

/** Menu theo vai trò: ẩn mục không dùng được cho gọn — quyền thật vẫn do API kiểm tra. */
const NAV: Array<{ href: string; label: string; roles?: Role[] }> = [
  { href: '/catalog', label: 'Sản phẩm' },
  { href: '/purchase-requests', label: 'Đề nghị mua' },
  { href: '/rfqs', label: 'RFQ', roles: ['ADMIN', 'BUYER'] },
  { href: '/purchase-orders', label: 'Đơn đặt hàng' },
  { href: '/suppliers', label: 'Nhà cung cấp', roles: ['ADMIN', 'BUYER'] },
  { href: '/settings', label: 'Cài đặt', roles: ['ADMIN'] },
];

export function AppShell({ children }: { children: ReactNode }) {
  const me = useMe();
  const cart = useCart();
  const pathname = usePathname();
  const router = useRouter();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  // Hết phiên (proxy đã thử refresh mà vẫn 401) → về trang đăng nhập, giữ lại trang đang xem.
  useEffect(() => {
    if (me.error instanceof ApiError && me.error.status === 401) {
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    }
  }, [me.error, pathname, router]);

  useEffect(() => setOpen(false), [pathname]);

  async function logout() {
    await authCall('logout').catch(() => undefined);
    qc.clear();
    router.replace('/login');
    router.refresh();
  }

  const items = NAV.filter((n) => !n.roles || (me.data && n.roles.includes(me.data.role)));
  const navLink = (n: (typeof NAV)[number]) => {
    const active = pathname === n.href || pathname.startsWith(`${n.href}/`);
    return (
      <Link
        key={n.href}
        href={n.href}
        aria-current={active ? 'page' : undefined}
        className={`rounded-md px-3 py-1.5 text-sm ${active ? 'bg-brand/10 font-medium text-brand' : 'text-muted hover:text-text'}`}
      >
        {n.label}
      </Link>
    );
  };

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-20 border-b border-border bg-surface/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-4 px-4">
          <Link href="/catalog" className="text-lg font-semibold tracking-tight">
            Procure<span className="text-brand">X</span>
          </Link>
          <nav className="hidden gap-1 md:flex" aria-label="Chính">
            {items.map(navLink)}
          </nav>
          <div className="ml-auto flex items-center gap-3">
            <Link
              href="/cart"
              className="relative rounded-md px-2 py-1 text-sm text-muted hover:text-text"
            >
              Giỏ hàng
              {cart.items.length > 0 && (
                <span className="ml-1 rounded-full bg-brand px-1.5 text-xs text-brand-fg num">
                  {cart.items.length}
                </span>
              )}
            </Link>
            {me.data && (
              <span className="hidden text-right text-xs leading-tight lg:block">
                <span className="block font-medium">{me.data.fullName}</span>
                <span className="text-muted">{ROLE_LABEL[me.data.role]}</span>
              </span>
            )}
            <button onClick={logout} className="text-sm text-muted hover:text-text">
              Đăng xuất
            </button>
            <button
              className="rounded-md border border-border px-2 py-1 text-sm md:hidden"
              aria-expanded={open}
              onClick={() => setOpen((o) => !o)}
            >
              Menu
            </button>
          </div>
        </div>
        {open && (
          <nav className="flex flex-col gap-1 border-t border-border px-4 py-2 md:hidden">
            {items.map(navLink)}
          </nav>
        )}
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6">
        {me.isPending ? (
          <Loading />
        ) : me.error && !(me.error instanceof ApiError && me.error.status === 401) ? (
          <ErrorBox message="Không tải được thông tin người dùng." onRetry={() => me.refetch()} />
        ) : (
          children
        )}
      </main>
    </div>
  );
}
