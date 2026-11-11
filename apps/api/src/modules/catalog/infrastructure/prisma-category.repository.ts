import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { Category, childPath } from '../domain/category';
import { CategoryRepository, NewCategory } from '../domain/category.repository';

/** Dòng trả về từ $queryRaw (đã ép path về text). */
interface CategoryRow {
  id: string;
  name: string;
  slug: string;
  path: string;
  depth: number;
}

/**
 * Danh sách cột dùng chung. Prisma.raw chèn NGUYÊN VĂN vào SQL (không phải tham số) —
 * chỉ an toàn vì đây là hằng số do ta viết, tuyệt đối không ghép input người dùng vào đây.
 */
const COLUMNS = Prisma.raw(
  'id::text AS id, name, slug, path::text AS path, nlevel(path)::int AS depth',
);

/**
 * ============================================================
 *  BÀI 7 – Cây danh mục với ltree
 *  Kiểm tra: `pnpm test category`  (test chạy trên Postgres THẬT: cần `docker compose up -d`)
 * ============================================================
 * Prisma không hiểu kiểu ltree (schema khai báo Unsupported("ltree")) nên mọi truy vấn có `path`
 * phải dùng $queryRaw với tagged template: `this.prisma.$queryRaw<CategoryRow[]>\`... ${x} ...\``.
 *   - Giá trị trong ${} được gửi dạng THAM SỐ ($1, $2) → an toàn SQL injection.
 *   - Tham số đi vào là text → phải ép kiểu: ${p}::ltree
 *   - Khi SELECT, ép ra text để JS nhận string: path::text AS path
 *   - Số tầng: nlevel(path)::int AS depth   (nlevel trả int4; không ép thì vẫn ổn, ép cho chắc)
 *   - id phải tự sinh: gen_random_uuid() (cột id không có default ở DB, @default(uuid()) là của Prisma client)
 *
 * Toán tử ltree cần dùng:
 *   a <@ b   : a là b hoặc con cháu của b        ('x.y.z' <@ 'x.y' → true)
 *   a @> b   : a là b hoặc tổ tiên của b         ('x' @> 'x.y.z'   → true)
 *
 * Gợi ý từng hàm:
 *  create:        nếu có parentSlug → SELECT path của cha (không thấy → return null);
 *                 path = childPath(parentPath, slug) (đã viết sẵn ở domain/category.ts);
 *                 INSERT ... RETURNING các cột như CategoryRow.
 *  findSubtree:   một câu SQL: WHERE path <@ (SELECT path FROM categories WHERE slug = ${slug}) ORDER BY path
 *  findAncestors: tương tự nhưng dùng @> và ORDER BY nlevel(path)
 *
 * ❓ Vì sao findSubtree bằng ltree chỉ cần 1 câu SQL, còn với cột parent_id thì phải đệ quy (WITH RECURSIVE)?
 * ❓ Index GiST trên path (xem migration init_catalog) giúp toán tử nào chạy nhanh?
 * ❓ Nếu dùng $queryRawUnsafe(`... '${slug}' ...`) thì chuyện gì có thể xảy ra?
 */
@Injectable()
export class PrismaCategoryRepository extends CategoryRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async create(input: NewCategory): Promise<Category | null> {
    // 1. Tìm path của cha (nếu có). Không thấy cha → null, để use case quyết định lỗi gì.
    let parentPath: string | null = null;
    if (input.parentSlug) {
      const rows = await this.prisma.$queryRaw<{ path: string }[]>`
        SELECT path::text AS path FROM categories WHERE slug = ${input.parentSlug}`;
      if (!rows[0]) return null;
      parentPath = rows[0].path;
    }

    // 2. Ghép path con ở domain (thuần TS), rồi INSERT; RETURNING để khỏi SELECT lại.
    const path = childPath(parentPath, input.slug);
    const [row] = await this.prisma.$queryRaw<CategoryRow[]>`
      INSERT INTO categories (id, name, slug, path)
      VALUES (gen_random_uuid(), ${input.name}, ${input.slug}, ${path}::ltree)
      RETURNING ${COLUMNS}`;
    return row;
  }

  async findSubtree(slug: string): Promise<Category[]> {
    // path <@ X : chính X và mọi con cháu của X. Slug không tồn tại → subquery NULL → 0 dòng.
    return this.prisma.$queryRaw<CategoryRow[]>`
      SELECT ${COLUMNS} FROM categories
      WHERE path <@ (SELECT path FROM categories WHERE slug = ${slug})
      ORDER BY path`;
  }

  async findAncestors(slug: string): Promise<Category[]> {
    // path @> X : chính X và mọi tổ tiên của X → breadcrumb, gốc trước.
    return this.prisma.$queryRaw<CategoryRow[]>`
      SELECT ${COLUMNS} FROM categories
      WHERE path @> (SELECT path FROM categories WHERE slug = ${slug})
      ORDER BY nlevel(path)`;
  }
}
