'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useMemo, useState } from 'react';
import {
  Badge,
  Card,
  Empty,
  ErrorBox,
  Input,
  Loading,
  PageHeader,
  Pagination,
} from '@/components/ui';
import { api, errorMessage } from '@/lib/client/api';
import { useDebounced } from '@/lib/client/hooks';
import { specLabel, vnd } from '@/lib/format';
import {
  type CatalogFilters,
  parseFilters,
  toApiQuery,
  toSearchParams,
  toggleSpec,
} from '@/lib/search-params';
import type { Category, SearchResult } from '@/lib/types';

const PAGE_SIZE = 24;

function CatalogView() {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  // URL là nguồn sự thật cho bộ lọc.
  const filters = useMemo(() => parseFilters(new URLSearchParams(sp.toString())), [sp]);

  const go = (next: CatalogFilters) => {
    const qs = toSearchParams(next).toString();
    // replace (không push) cho thao tác lọc: nút Back không phải lùi qua từng lần bấm facet.
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  // Ô tìm kiếm: state cục bộ để gõ mượt, debounce 300ms rồi mới ghi lên URL.
  const [text, setText] = useState(filters.q ?? '');
  const debounced = useDebounced(text, 300);
  useEffect(() => {
    if ((debounced.trim() || undefined) !== filters.q) {
      go({ ...filters, q: debounced.trim() || undefined, page: 1 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- chỉ chạy khi giá trị debounce đổi
  }, [debounced]);

  const categories = useQuery({
    queryKey: ['categories'],
    queryFn: () => api<Category[]>('categories'),
    staleTime: 10 * 60_000,
  });

  const result = useQuery({
    queryKey: ['products', toApiQuery(filters, PAGE_SIZE)],
    queryFn: ({ signal }) =>
      api<SearchResult>(`products?${toApiQuery(filters, PAGE_SIZE)}`, { signal }),
    // Giữ kết quả cũ trong lúc tải bộ lọc mới → danh sách không nhấp nháy.
    placeholderData: keepPreviousData,
  });

  const selectedCategory = categories.data?.find((c) => c.slug === filters.category);

  return (
    <>
      <PageHeader
        title={selectedCategory?.name ?? 'Tất cả sản phẩm'}
        subtitle={
          result.data && (
            <span className="num">{result.data.total.toLocaleString('vi-VN')} sản phẩm</span>
          )
        }
      />
      <div className="grid gap-5 lg:grid-cols-[260px_1fr]">
        <aside className="space-y-4">
          <Input
            type="search"
            placeholder="Tìm theo tên hoặc SKU…"
            value={text}
            onChange={(e) => setText(e.target.value)}
            aria-label="Tìm sản phẩm"
          />
          <Card title="Danh mục">
            <ul className="space-y-0.5 text-sm">
              <li>
                <button
                  className={`w-full rounded px-2 py-1 text-left ${!filters.category ? 'bg-brand/10 text-brand' : 'hover:bg-surface-2'}`}
                  onClick={() => go({ ...filters, category: undefined, page: 1 })}
                >
                  Tất cả
                </button>
              </li>
              {categories.data?.map((c) => (
                <li key={c.id} style={{ paddingLeft: (c.depth - 1) * 12 }}>
                  <button
                    className={`w-full rounded px-2 py-1 text-left ${c.slug === filters.category ? 'bg-brand/10 text-brand' : 'hover:bg-surface-2'} ${c.depth === 1 ? 'font-medium' : ''}`}
                    onClick={() => go({ ...filters, category: c.slug, page: 1 })}
                  >
                    {c.name}
                  </button>
                </li>
              ))}
            </ul>
          </Card>
          {result.data &&
            Object.entries(result.data.facets).map(([key, values]) => (
              <Card key={key} title={specLabel(key)}>
                <ul className="max-h-56 space-y-1 overflow-y-auto text-sm">
                  {values.map((v) => {
                    const checked = filters.specs[key]?.includes(v.value) ?? false;
                    return (
                      <li key={v.value}>
                        <label className="flex cursor-pointer items-center gap-2">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => go(toggleSpec(filters, key, v.value))}
                          />
                          <span className="flex-1">{v.value}</span>
                          <span className="text-xs text-muted num">{v.count}</span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              </Card>
            ))}
        </aside>

        <section aria-busy={result.isFetching}>
          {result.isPending ? (
            <Loading />
          ) : result.error ? (
            <ErrorBox message={errorMessage(result.error)} onRetry={() => result.refetch()} />
          ) : result.data.items.length === 0 ? (
            <Empty>Không có sản phẩm khớp bộ lọc.</Empty>
          ) : (
            <>
              <ul
                className={`grid gap-3 sm:grid-cols-2 xl:grid-cols-3 ${result.isPlaceholderData ? 'opacity-60' : ''}`}
              >
                {result.data.items.map((p) => (
                  <li key={p.id}>
                    <Link
                      href={`/catalog/${p.id}`}
                      className="block h-full rounded-lg border border-border bg-surface p-4 transition hover:border-brand"
                    >
                      <p className="text-xs text-muted">{p.sku}</p>
                      <p className="mt-1 line-clamp-2 font-medium">{p.name}</p>
                      <div className="mt-2 flex flex-wrap gap-1">
                        {Object.entries(p.specs)
                          .slice(0, 3)
                          .map(([k, v]) => (
                            <Badge key={k}>{String(v)}</Badge>
                          ))}
                      </div>
                      <p className="mt-3 text-sm">
                        <span className="text-muted">Từ </span>
                        <span className="font-semibold num">{vnd(p.fromPrice)}</span>
                        <span className="text-muted"> / {p.unit}</span>
                      </p>
                    </Link>
                  </li>
                ))}
              </ul>
              <Pagination
                page={result.data.page}
                pageSize={result.data.pageSize}
                total={result.data.total}
                onPage={(page) => {
                  go({ ...filters, page });
                  window.scrollTo({ top: 0 });
                }}
              />
            </>
          )}
        </section>
      </div>
    </>
  );
}

export default function CatalogPage() {
  // useSearchParams cần Suspense boundary để Next render tĩnh phần còn lại.
  return (
    <Suspense fallback={<Loading />}>
      <CatalogView />
    </Suspense>
  );
}
