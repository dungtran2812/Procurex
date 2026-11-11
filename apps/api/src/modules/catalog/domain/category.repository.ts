import type { Category } from './category';

export interface NewCategory {
  name: string;
  slug: string;
  parentSlug: string | null; // null = danh mục gốc
}

/** PORT – xem giải thích abstract class ở identity.repository.ts. */
export abstract class CategoryRepository {
  /** Tạo danh mục; trả null nếu parentSlug không tồn tại. */
  abstract create(input: NewCategory): Promise<Category | null>;
  /** Danh mục `slug` và TOÀN BỘ con cháu, sắp theo path. Không tồn tại → []. */
  abstract findSubtree(slug: string): Promise<Category[]>;
  /** Breadcrumb: từ gốc xuống tới chính `slug`, sắp theo depth. Không tồn tại → []. */
  abstract findAncestors(slug: string): Promise<Category[]>;
  /** Toàn bộ cây, sắp theo path (cha trước con) — dùng cho menu/bộ lọc. */
  abstract findAll(): Promise<Category[]>;
}
