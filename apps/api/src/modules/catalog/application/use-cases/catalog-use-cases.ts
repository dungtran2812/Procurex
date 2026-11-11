import { Injectable } from '@nestjs/common';
import type { AuthUser } from '../../../../common/auth/auth.types';
import { DomainError } from '../../../../common/errors/domain-error';
import type { Category } from '../../domain/category';
import { CategoryRepository } from '../../domain/category.repository';
import { PriceQuote, quotePrice } from '../../domain/pricing';
import type { Product, ProductSearchQuery, ProductSearchResult } from '../../domain/product';
import { ProductRepository } from '../../domain/product.repository';
import { CatalogCache, Clock } from '../ports';

/** TTL cache (giây). Catalog đổi chủ yếu qua seed, và seed gọi invalidateAll(). */
export const CATALOG_TTL = {
  product: 600,
  search: 120,
  category: 3600,
} as const;

/**
 * Key cache phải XÁC ĐỊNH: cùng truy vấn → cùng key bất kể thứ tự field.
 * Sắp xếp key của specs để {a,b} và {b,a} trùng nhau.
 */
export function searchCacheKey(q: ProductSearchQuery): string {
  const specs = Object.keys(q.specs ?? {})
    .sort()
    .map((k) => `${k}=${q.specs![k]}`)
    .join('&');
  return `search:${q.categorySlug ?? ''}|${(q.q ?? '').toLowerCase()}|${specs}|${q.page}|${q.pageSize}`;
}

@Injectable()
export class GetProductUseCase {
  constructor(
    private readonly products: ProductRepository,
    private readonly cache: CatalogCache,
  ) {}

  async execute(id: string): Promise<Product> {
    const product = await this.cache.wrap(`product:${id}`, CATALOG_TTL.product, () =>
      this.products.findById(id),
    );
    if (!product) throw new DomainError('PRODUCT_NOT_FOUND', 'Không tìm thấy sản phẩm');
    return product;
  }
}

@Injectable()
export class SearchProductsUseCase {
  constructor(
    private readonly products: ProductRepository,
    private readonly cache: CatalogCache,
  ) {}

  execute(query: ProductSearchQuery): Promise<ProductSearchResult> {
    // Kết quả search KHÔNG chứa giá hợp đồng riêng → dùng chung cho mọi công ty, cache được.
    return this.cache.wrap(searchCacheKey(query), CATALOG_TTL.search, () =>
      this.products.search(query),
    );
  }
}

@Injectable()
export class QuoteProductUseCase {
  constructor(
    private readonly getProduct: GetProductUseCase,
    private readonly products: ProductRepository,
    private readonly clock: Clock,
  ) {}

  async execute(
    actor: AuthUser,
    productId: string,
    quantity: number,
  ): Promise<PriceQuote & { productId: string; quantity: number }> {
    // Bậc giá đi qua cache (dùng chung); giá hợp đồng thì đọc thẳng theo công ty của NGƯỜI GỌI
    // (lấy từ JWT, không nhận companyId từ client – cùng nguyên tắc Bài 5).
    const product = await this.getProduct.execute(productId);
    const companyPrices = await this.products.findCompanyPrices(actor.companyId, productId);
    const quote = quotePrice({
      minOrderQty: product.minOrderQty,
      tiers: product.tiers,
      companyPrices,
      quantity,
      at: this.clock.now(),
    });
    return { productId, quantity, ...quote };
  }
}

@Injectable()
export class GetCategoryTreeUseCase {
  constructor(
    private readonly categories: CategoryRepository,
    private readonly cache: CatalogCache,
  ) {}

  /** Danh mục + toàn bộ con cháu, và breadcrumb từ gốc tới nó. */
  async execute(slug: string): Promise<{ breadcrumb: Category[]; subtree: Category[] }> {
    const result = await this.cache.wrap(`category:${slug}`, CATALOG_TTL.category, async () => {
      const subtree = await this.categories.findSubtree(slug);
      if (subtree.length === 0) return null;
      return { breadcrumb: await this.categories.findAncestors(slug), subtree };
    });
    if (!result) throw new DomainError('CATEGORY_NOT_FOUND', 'Không tìm thấy danh mục');
    return result;
  }
}
