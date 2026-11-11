'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { ApiError } from '@/lib/client/api';
import { CartProvider } from './cart';

/**
 * Server state = TanStack Query (cache, dedupe, invalidate sau mutation).
 * Không nhét dữ liệu từ API vào state toàn cục tự viết.
 */
export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            refetchOnWindowFocus: false,
            // Lỗi 4xx là lỗi nghiệp vụ/quyền → không thử lại; lỗi mạng/5xx thử lại 2 lần.
            retry: (count, e) => !(e instanceof ApiError && e.status < 500) && count < 2,
          },
        },
      }),
  );
  return (
    <QueryClientProvider client={client}>
      <CartProvider>{children}</CartProvider>
    </QueryClientProvider>
  );
}
