import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import type { CompanyPrice } from '../domain/pricing';
import type {
  Facets,
  Product,
  ProductSearchQuery,
  ProductSearchResult,
  ProductSummary,
  Specs,
} from '../domain/product';
import { ProductRepository } from '../domain/product.repository';

/** Số giá trị tối đa trả về cho mỗi facet (giá trị hiếm bị cắt). */
const MAX_FACET_VALUES = 20;

/** Escape ký tự đại diện của LIKE để người dùng gõ "50%" không thành wildcard. */
const escapeLike = (s: string) => s.replace(/[\\%_]/g, (m) => `\\${m}`);

/**
 * ADAPTER đọc catalog.
 *
 * BÀI 8 – Faceted search trên specs jsonb + GIN:
 *  - Lọc thông số bằng `specs @> '{"material":"CrV"}'` — toán tử "chứa" của jsonb,
 *    được index GIN (products_specs_idx) hỗ trợ, nên không phải quét toàn bảng.
 *  - Query string luôn là chuỗi, còn specs có thể lưu số (12). jsonb phân biệt "12" và 12,
 *    nên giá trị trông như số được thử CẢ HAI dạng (OR) — vẫn dùng được GIN.
 *  - Facet = với tập kết quả hiện tại, đếm (key, value) bằng jsonb_each_text + GROUP BY.
 *  - Danh mục lọc theo cả cây con nhờ ltree `<@` (Bài 7).
 *  - Mọi điều kiện ghép bằng Prisma.sql / Prisma.join → vẫn là tham số, không ghép chuỗi.
 */
@Injectable()
export class PrismaProductRepository extends ProductRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async findById(id: string): Promise<Product | null> {
    const row = await this.prisma.product.findFirst({
      where: { id, isActive: true },
      include: {
        category: { select: { slug: true } },
        priceTiers: { orderBy: { minQty: 'asc' } },
      },
    });
    if (!row) return null;
    return {
      id: row.id,
      sku: row.sku,
      name: row.name,
      categorySlug: row.category.slug,
      unit: row.unit,
      specs: row.specs as Specs,
      minOrderQty: row.minOrderQty,
      tiers: row.priceTiers.map((t) => ({ minQty: t.minQty, unitPrice: t.unitPrice.toNumber() })),
    };
  }

  async search(query: ProductSearchQuery): Promise<ProductSearchResult> {
    const conds: Prisma.Sql[] = [Prisma.sql`p.is_active`];

    if (query.categorySlug) {
      conds.push(
        Prisma.sql`c.path <@ (SELECT path FROM categories WHERE slug = ${query.categorySlug})`,
      );
    }
    if (query.q) {
      const like = `%${escapeLike(query.q)}%`;
      conds.push(Prisma.sql`(p.name ILIKE ${like} OR p.sku ILIKE ${like})`);
    }
    for (const [key, value] of Object.entries(query.specs ?? {})) {
      const asText = JSON.stringify({ [key]: value });
      const num = Number(value);
      conds.push(
        Number.isFinite(num) && value.trim() !== ''
          ? Prisma.sql`(p.specs @> ${asText}::jsonb OR p.specs @> ${JSON.stringify({ [key]: num })}::jsonb)`
          : Prisma.sql`p.specs @> ${asText}::jsonb`,
      );
    }

    const from = Prisma.sql`FROM products p JOIN categories c ON c.id = p.category_id
      WHERE ${Prisma.join(conds, ' AND ')}`;
    const offset = (query.page - 1) * query.pageSize;

    const [items, [{ total }], facetRows] = await Promise.all([
      this.prisma.$queryRaw<ProductSummary[]>`
        SELECT p.id::text AS id, p.sku, p.name, c.slug AS "categorySlug", p.unit, p.specs,
               (SELECT MIN(t.unit_price) FROM price_tiers t WHERE t.product_id = p.id)::float8
                 AS "fromPrice"
        ${from}
        ORDER BY p.name, p.sku
        LIMIT ${query.pageSize} OFFSET ${offset}`,
      this.prisma.$queryRaw<[{ total: number }]>`SELECT count(*)::int AS total ${from}`,
      this.prisma.$queryRaw<Array<{ key: string; value: string; count: number }>>`
        SELECT kv.key, kv.value, count(*)::int AS count
        FROM products p
        JOIN categories c ON c.id = p.category_id
        CROSS JOIN LATERAL jsonb_each_text(p.specs) AS kv
        WHERE ${Prisma.join(conds, ' AND ')}
        GROUP BY kv.key, kv.value
        ORDER BY kv.key, count DESC, kv.value`,
    ]);

    const facets: Facets = {};
    for (const r of facetRows) {
      const list = (facets[r.key] ??= []);
      if (list.length < MAX_FACET_VALUES) list.push({ value: r.value, count: r.count });
    }

    return { items, total, page: query.page, pageSize: query.pageSize, facets };
  }

  async findCompanyPrices(companyId: string, productId: string): Promise<CompanyPrice[]> {
    const rows = await this.prisma.companyPrice.findMany({ where: { companyId, productId } });
    return rows.map((r) => ({
      unitPrice: r.unitPrice.toNumber(),
      validFrom: r.validFrom,
      validTo: r.validTo,
    }));
  }
}
