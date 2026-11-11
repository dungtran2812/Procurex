import { CatalogCache, Clock } from '../application/ports';
import type { CompanyPrice } from '../domain/pricing';
import type { Product, ProductSearchQuery, ProductSearchResult } from '../domain/product';
import { ProductRepository } from '../domain/product.repository';

/** Cache in-memory, đếm số lần hit/miss để test cache-aside. */
export class InMemoryCatalogCache extends CatalogCache {
  readonly store = new Map<string, string>();
  version = 0;

  async get<T>(key: string): Promise<T | null> {
    const raw = this.store.get(`v${this.version}:${key}`);
    return raw === undefined ? null : (JSON.parse(raw) as T);
  }
  async set<T>(key: string, value: T): Promise<void> {
    this.store.set(`v${this.version}:${key}`, JSON.stringify(value));
  }
  async invalidateAll(): Promise<void> {
    this.version += 1;
  }
}

export class FixedClock extends Clock {
  constructor(public current: Date) {
    super();
  }
  now(): Date {
    return this.current;
  }
}

export class InMemoryProductRepository extends ProductRepository {
  readonly products = new Map<string, Product>();
  /** key = `${companyId}:${productId}` */
  readonly companyPrices = new Map<string, CompanyPrice[]>();
  calls = { findById: 0, search: 0 };

  async findById(id: string): Promise<Product | null> {
    this.calls.findById += 1;
    return this.products.get(id) ?? null;
  }
  async search(query: ProductSearchQuery): Promise<ProductSearchResult> {
    this.calls.search += 1;
    return { items: [], total: 0, page: query.page, pageSize: query.pageSize, facets: {} };
  }
  async findCompanyPrices(companyId: string, productId: string): Promise<CompanyPrice[]> {
    return this.companyPrices.get(`${companyId}:${productId}`) ?? [];
  }
}
