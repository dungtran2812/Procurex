'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

/**
 * Giỏ hàng = CLIENT state thuần (chưa gửi server cho tới khi tạo PR).
 * Lưu localStorage để reload không mất; giá KHÔNG lưu ở đây — giá luôn lấy từ API lúc tạo PR
 * (server snapshot giá), tránh hiển thị giá cũ như thể là giá chốt.
 */
export interface CartItem {
  productId: string;
  sku: string;
  name: string;
  unit: string;
  minOrderQty: number;
  quantity: number;
}

interface CartCtx {
  items: CartItem[];
  add: (item: CartItem) => void;
  setQuantity: (productId: string, quantity: number) => void;
  remove: (productId: string) => void;
  clear: () => void;
}

const Ctx = createContext<CartCtx | null>(null);
const KEY = 'px_cart_v1';

function load(): CartItem[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as CartItem[]) : [];
  } catch {
    return [];
  }
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);

  // Đọc localStorage sau khi mount (server render không có localStorage → tránh lệch hydrate).
  useEffect(() => setItems(load()), []);

  const persist = useCallback((next: CartItem[]) => {
    setItems(next);
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      /* chế độ riêng tư/đầy bộ nhớ: vẫn chạy, chỉ không nhớ */
    }
  }, []);

  const value = useMemo<CartCtx>(
    () => ({
      items,
      add: (item) => {
        const existing = items.find((i) => i.productId === item.productId);
        persist(
          existing
            ? items.map((i) =>
                i.productId === item.productId ? { ...i, quantity: i.quantity + item.quantity } : i,
              )
            : [...items, item],
        );
      },
      setQuantity: (productId, quantity) =>
        persist(items.map((i) => (i.productId === productId ? { ...i, quantity } : i))),
      remove: (productId) => persist(items.filter((i) => i.productId !== productId)),
      clear: () => persist([]),
    }),
    [items, persist],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useCart(): CartCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useCart phải nằm trong CartProvider');
  return ctx;
}
