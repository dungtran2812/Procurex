import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { AppShell } from '@/components/app-shell';
import { readTokens } from '@/lib/server/session';

/**
 * Mọi trang trong (app) cần đăng nhập. Kiểm tra ở SERVER trước khi render:
 * chưa có refresh token → về /login ngay, không nháy giao diện rỗng.
 * (Token hết hạn/bị thu hồi thì proxy trả 401 → client tự chuyển /login.)
 */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const { refreshToken } = await readTokens();
  if (!refreshToken) redirect('/login');
  return <AppShell>{children}</AppShell>;
}
