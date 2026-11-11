import { Module } from '@nestjs/common';
import { CatalogCache } from './application/ports';
import {
  GetCategoryTreeUseCase,
  GetProductUseCase,
  ListCategoriesUseCase,
  QuoteProductUseCase,
  SearchProductsUseCase,
} from './application/use-cases/catalog-use-cases';
import { CategoryRepository } from './domain/category.repository';
import { ProductRepository } from './domain/product.repository';
import { PrismaCategoryRepository } from './infrastructure/prisma-category.repository';
import { PrismaProductRepository } from './infrastructure/prisma-product.repository';
import { RedisCatalogCache } from './infrastructure/redis-catalog-cache';
import { CatalogController } from './presentation/catalog.controller';

@Module({
  controllers: [CatalogController],
  providers: [
    GetCategoryTreeUseCase,
    ListCategoriesUseCase,
    SearchProductsUseCase,
    GetProductUseCase,
    QuoteProductUseCase,
    { provide: CategoryRepository, useClass: PrismaCategoryRepository },
    { provide: ProductRepository, useClass: PrismaProductRepository },
    { provide: CatalogCache, useClass: RedisCatalogCache },
  ],
  // API công khai của module cho module khác (procurement) — chỉ use case, không lộ repository.
  exports: [QuoteProductUseCase, GetProductUseCase],
})
export class CatalogModule {}
