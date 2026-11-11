/**
 * Trạng thái bộ lọc catalog nằm TRÊN URL (nguồn sự thật):
 *   /catalog?category=co-le&q=12&spec=material:CrV&spec=size_mm:12&page=2
 * → chia sẻ link, reload, nút Back đều giữ đúng bộ lọc.
 * Định dạng `spec=key:value` lặp lại khớp đúng DTO của API (catalog.dto.ts).
 */
export interface CatalogFilters {
  category?: string;
  q?: string;
  specs: Record<string, string[]>; // nhiều giá trị cùng key: hiển thị được, gửi API giá trị đầu
  page: number;
}

export function parseFilters(sp: URLSearchParams): CatalogFilters {
  const specs: Record<string, string[]> = {};
  for (const raw of sp.getAll('spec')) {
    const i = raw.indexOf(':');
    if (i <= 0) continue;
    const key = raw.slice(0, i);
    const value = raw.slice(i + 1);
    if (!value) continue;
    (specs[key] ??= []).includes(value) || specs[key].push(value);
  }
  const page = Number(sp.get('page'));
  return {
    category: sp.get('category') || undefined,
    q: sp.get('q')?.trim() || undefined,
    specs,
    page: Number.isInteger(page) && page > 0 ? page : 1,
  };
}

/** Ngược lại parseFilters. Thứ tự key ổn định → URL ổn định → cache key ổn định. */
export function toSearchParams(f: CatalogFilters): URLSearchParams {
  const sp = new URLSearchParams();
  if (f.category) sp.set('category', f.category);
  if (f.q) sp.set('q', f.q);
  for (const key of Object.keys(f.specs).sort()) {
    for (const v of f.specs[key]) sp.append('spec', `${key}:${v}`);
  }
  if (f.page > 1) sp.set('page', String(f.page));
  return sp;
}

/**
 * Đổi bộ lọc thì quay về trang 1 (trang 5 của bộ lọc cũ thường không tồn tại với bộ lọc mới).
 * API hiện AND giữa các key và lọc 1 giá trị mỗi key → chọn giá trị mới thay giá trị cũ cùng key.
 */
export function toggleSpec(f: CatalogFilters, key: string, value: string): CatalogFilters {
  const current = f.specs[key] ?? [];
  const specs = { ...f.specs };
  if (current.includes(value)) delete specs[key];
  else specs[key] = [value];
  return { ...f, specs, page: 1 };
}

/** Chuỗi query gửi API (/products?...) — API cần pageSize, không cần spec trùng. */
export function toApiQuery(f: CatalogFilters, pageSize: number): string {
  const sp = toSearchParams(f);
  sp.set('page', String(f.page));
  sp.set('pageSize', String(pageSize));
  return sp.toString();
}
