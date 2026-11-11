import type { CompanyPrice } from './pricing';
import type { Product, ProductSearchQuery, ProductSearchResult } from './product';

/** PORT đọc catalog. Ghi catalog chỉ qua seed (xem prisma/seed-catalog.ts). */
export abstract class ProductRepository {
  /** Sản phẩm đang bán (isActive) kèm bậc giá; không có → null. */
  abstract findById(id: string): Promise<Product | null>;
  abstract search(query: ProductSearchQuery): Promise<ProductSearchResult>;
  /** Mọi hợp đồng giá của 1 công ty cho 1 sản phẩm (kể cả hết hạn – domain tự lọc theo thời điểm). */
  abstract findCompanyPrices(companyId: string, productId: string): Promise<CompanyPrice[]>;
}
