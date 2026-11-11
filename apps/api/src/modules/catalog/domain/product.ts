import type { PriceTier } from './pricing';

/** Giá trị thông số: chuỗi ("CrV") hoặc số (12). Không lồng object để facet được. */
export type SpecValue = string | number;
export type Specs = Record<string, SpecValue>;

export interface Product {
  id: string;
  sku: string;
  name: string;
  categorySlug: string;
  unit: string;
  specs: Specs;
  minOrderQty: number;
  /** Bậc giá niêm yết, sắp theo minQty tăng dần. */
  tiers: PriceTier[];
}

/** Một dòng trong kết quả tìm kiếm: chỉ kèm giá "từ" (bậc rẻ nhất) để hiển thị danh sách. */
export interface ProductSummary {
  id: string;
  sku: string;
  name: string;
  categorySlug: string;
  unit: string;
  specs: Specs;
  fromPrice: number | null;
}

export interface ProductSearchQuery {
  /** Lọc theo danh mục VÀ mọi danh mục con (ltree). */
  categorySlug?: string;
  /** Tìm gần đúng theo tên hoặc SKU. */
  q?: string;
  /** Lọc chính xác theo thông số, AND giữa các key: { material: 'CrV', size_mm: '12' }. */
  specs?: Record<string, string>;
  page: number; // bắt đầu từ 1
  pageSize: number;
}

/** Facet: với mỗi key thông số, các giá trị xuất hiện trong tập kết quả và số sản phẩm. */
export type Facets = Record<string, Array<{ value: string; count: number }>>;

export interface ProductSearchResult {
  items: ProductSummary[];
  total: number;
  page: number;
  pageSize: number;
  facets: Facets;
}

/** Key thông số hợp lệ — dùng làm tên key jsonb nên giới hạn ký tự cho sạch. */
export const SPEC_KEY_PATTERN = /^[a-z][a-z0-9_]{0,39}$/;

/**
 * Chuẩn hoá filter từ query string thành filter đã kiểm tra:
 *  - "material:CrV" → { material: 'CrV' }
 *  - bỏ key sai định dạng, key trùng lấy giá trị sau cùng.
 */
export function parseSpecFilters(raw: string[] | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const item of raw ?? []) {
    const idx = item.indexOf(':');
    if (idx <= 0) continue;
    const key = item.slice(0, idx).trim().toLowerCase();
    const value = item.slice(idx + 1).trim();
    if (SPEC_KEY_PATTERN.test(key) && value) out[key] = value;
  }
  return out;
}
