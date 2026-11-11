export interface Category {
  id: string;
  name: string;
  slug: string;
  /** ltree dạng chuỗi, ví dụ 'dung_cu.cam_tay.co_le'. */
  path: string;
  /** Số tầng: gốc = 1. */
  depth: number;
}

/**
 * Nhãn ltree chỉ chấp nhận [A-Za-z0-9_] (dấu '.' là ký tự phân tầng).
 * Slug 'dung-cu-cam-tay' → nhãn 'dung_cu_cam_tay'.
 */
export function slugToLabel(slug: string): string {
  const label = slug.trim().toLowerCase().replace(/-/g, '_');
  if (!/^[a-z0-9_]+$/.test(label)) {
    throw new Error(`Slug không hợp lệ cho ltree: "${slug}"`);
  }
  return label;
}

/** Ghép path của con: cha 'a.b' + slug 'c' → 'a.b.c'; không có cha → 'c'. */
export function childPath(parentPath: string | null, slug: string): string {
  const label = slugToLabel(slug);
  return parentPath ? `${parentPath}.${label}` : label;
}
