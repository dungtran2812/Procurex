import { Module } from '@nestjs/common';
import { CatalogCache, Clock, SystemClock } from './application/ports';
import {
  GetCategoryTreeUseCase,
  GetProductUseCase,
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
    SearchProductsUseCase,
    GetProductUseCase,
    QuoteProductUseCase,
    { provide: CategoryRepository, useClass: PrismaCategoryRepository },
    { provide: ProductRepository, useClass: PrismaProductRepository },
    { provide: CatalogCache, useClass: RedisCatalogCache },
    { provide: Clock, useClass: SystemClock },
  ],
})
export class CatalogModule {}
