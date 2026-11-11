'use client';

import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import type { Me } from '../types';
import { api } from './api';

/** Người dùng hiện tại (dùng chung cache cho mọi component). */
export const useMe = () =>
  useQuery({ queryKey: ['me'], queryFn: () => api<Me>('auth/me'), staleTime: 5 * 60_000 });

/** Trả giá trị sau khi người dùng ngừng gõ `ms` mili-giây (tránh gọi API mỗi phím). */
export function useDebounced<T>(value: T, ms = 300): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

/** Key idempotency cố định trong vòng đời 1 form; gọi reset() sau khi gửi thành công. */
export function useIdempotencyKey(): [string, () => void] {
  const [key, setKey] = useState(() => crypto.randomUUID());
  return [key, () => setKey(crypto.randomUUID())];
}
