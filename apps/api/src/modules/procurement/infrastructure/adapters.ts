import { Injectable } from '@nestjs/common';
import type { AuthUser } from '../../../common/auth/auth.types';
import {
  GetProductUseCase,
  QuoteProductUseCase,
} from '../../catalog/application/use-cases/catalog-use-cases';
import { GetMeUseCase } from '../../identity/application/use-cases/get-me.use-case';
import type { Approver } from '../domain/purchase-request';
import { ApproverDirectory, PricedItem, PricingPort } from '../application/ports';

/**
 * ADAPTER in-process: gọi use case PUBLIC của module catalog (được CatalogModule export).
 * Không đọc bảng products/price_tiers trực tiếp → ranh giới module được giữ.
 */
@Injectable()
export class CatalogPricingAdapter extends PricingPort {
  constructor(
    private readonly getProduct: GetProductUseCase,
    private readonly quote: QuoteProductUseCase,
  ) {
    super();
  }

  async price(buyer: AuthUser, productId: string, quantity: number): Promise<PricedItem> {
    const [product, q] = await Promise.all([
      this.getProduct.execute(productId),
      this.quote.execute(buyer, productId, quantity),
    ]);
    return {
      productId,
      sku: product.sku,
      productName: product.name,
      unit: product.unit,
      quantity,
      unitPrice: q.unitPrice,
      priceSource: q.source,
      lineTotal: q.lineTotal,
    };
  }
}

@Injectable()
export class IdentityApproverDirectory extends ApproverDirectory {
  constructor(private readonly getMe: GetMeUseCase) {
    super();
  }

  async get(actor: AuthUser): Promise<Approver> {
    const u = await this.getMe.execute(actor);
    // role đọc từ DB (mới nhất), không lấy từ JWT có thể đã cũ tới 15 phút.
    return {
      id: u.id,
      companyId: u.companyId,
      role: u.role,
      approvalLimit: u.approvalLimit,
      isActive: u.isActive,
    };
  }
}
