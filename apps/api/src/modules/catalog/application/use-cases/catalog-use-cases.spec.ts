import type { AuthUser } from '../../../../common/auth/auth.types';
import { DomainError } from '../../../../common/errors/domain-error';
import type { Product } from '../../domain/product';
import { FixedClock, InMemoryCatalogCache, InMemoryProductRepository } from '../../testing/fakes';
import {
  GetProductUseCase,
  QuoteProductUseCase,
  SearchProductsUseCase,
  searchCacheKey,
} from './catalog-use-cases';

const product: Product = {
  id: 'p1',
  sku: 'CL-12',
  name: 'Cờ lê 12mm',
  categorySlug: 'co-le',
  unit: 'cái',
  specs: { size_mm: 12, material: 'CrV' },
  minOrderQty: 1,
  tiers: [
    { minQty: 1, unitPrice: 100_000 },
    { minQty: 10, unitPrice: 90_000 },
  ],
};

describe('Catalog use cases', () => {
  let repo: InMemoryProductRepository;
  let cache: InMemoryCatalogCache;
  let getProduct: GetProductUseCase;

  beforeEach(() => {
    repo = new InMemoryProductRepository();
    repo.products.set(product.id, product);
    cache = new InMemoryCatalogCache();
    getProduct = new GetProductUseCase(repo, cache);
  });

  describe('GetProductUseCase (cache-aside)', () => {
    it('lần 2 đọc từ cache, không gọi repo', async () => {
      await getProduct.execute('p1');
      await getProduct.execute('p1');
      expect(repo.calls.findById).toBe(1);
    });

    it('invalidateAll → đọc lại DB và thấy dữ liệu mới', async () => {
      await getProduct.execute('p1');
      repo.products.set('p1', { ...product, name: 'Cờ lê 12mm (mới)' });
      expect((await getProduct.execute('p1')).name).toBe('Cờ lê 12mm');

      await cache.invalidateAll();
      expect((await getProduct.execute('p1')).name).toBe('Cờ lê 12mm (mới)');
      expect(repo.calls.findById).toBe(2);
    });

    it('không tồn tại → PRODUCT_NOT_FOUND, và không cache kết quả rỗng', async () => {
      await expect(getProduct.execute('nope')).rejects.toMatchObject({
        code: 'PRODUCT_NOT_FOUND',
      });
      repo.products.set('nope', { ...product, id: 'nope' });
      await expect(getProduct.execute('nope')).resolves.toMatchObject({ id: 'nope' });
    });
  });

  describe('SearchProductsUseCase', () => {
    it('cùng truy vấn (khác thứ tự specs) → cùng key → 1 lần gọi repo', async () => {
      const search = new SearchProductsUseCase(repo, cache);
      const base = { page: 1, pageSize: 20 };
      await search.execute({ ...base, specs: { a: '1', b: '2' } });
      await search.execute({ ...base, specs: { b: '2', a: '1' } });
      expect(repo.calls.search).toBe(1);
    });

    it('searchCacheKey phân biệt trang và không phân biệt hoa thường của q', () => {
      const k = (p: object) => searchCacheKey({ page: 1, pageSize: 20, ...p });
      expect(k({ q: 'Cờ Lê' })).toBe(k({ q: 'cờ lê' }));
      expect(k({ page: 2 })).not.toBe(k({}));
    });
  });

  describe('QuoteProductUseCase', () => {
    const buyer: AuthUser = { id: 'u1', companyId: 'acme', role: 'BUYER' };
    const clock = new FixedClock(new Date('2026-11-10T00:00:00Z'));
    let quote: QuoteProductUseCase;

    beforeEach(() => {
      quote = new QuoteProductUseCase(getProduct, repo, clock);
    });

    it('không có hợp đồng → giá bậc', async () => {
      await expect(quote.execute(buyer, 'p1', 10)).resolves.toEqual({
        productId: 'p1',
        quantity: 10,
        unitPrice: 90_000,
        lineTotal: 900_000,
        source: 'TIER',
      });
    });

    it('dùng hợp đồng của CHÍNH công ty người gọi, không phải công ty khác', async () => {
      const contract = { validFrom: new Date('2026-01-01'), validTo: null };
      repo.companyPrices.set('acme:p1', [{ ...contract, unitPrice: 85_000 }]);
      repo.companyPrices.set('other:p1', [{ ...contract, unitPrice: 1_000 }]);

      const r = await quote.execute(buyer, 'p1', 10);
      expect(r).toMatchObject({ unitPrice: 85_000, source: 'CONTRACT' });
    });

    it('lỗi domain (dưới MOQ) đi xuyên qua use case', async () => {
      repo.products.set('p2', { ...product, id: 'p2', minOrderQty: 5 });
      await expect(quote.execute(buyer, 'p2', 2)).rejects.toBeInstanceOf(DomainError);
    });
  });
});
