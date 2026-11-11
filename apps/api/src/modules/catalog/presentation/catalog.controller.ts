import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { AuthUser } from '../../../common/auth/auth.types';
import { CurrentUser } from '../../../common/auth/decorators';
import {
  GetCategoryTreeUseCase,
  GetProductUseCase,
  ListCategoriesUseCase,
  QuoteProductUseCase,
  SearchProductsUseCase,
} from '../application/use-cases/catalog-use-cases';
import { parseSpecFilters } from '../domain/product';
import { QuoteQueryDto, SearchProductsQueryDto } from './dto/catalog.dto';

/**
 * Catalog chỉ ĐỌC qua HTTP. Mọi user đã đăng nhập (mọi role) đều xem được.
 * Ghi catalog là việc của nền tảng (seed/import), không phải của admin từng công ty —
 * nếu cho admin công ty sửa thì một tenant sửa được dữ liệu mọi tenant khác thấy.
 */
@ApiTags('catalog')
@ApiBearerAuth()
@Controller()
export class CatalogController {
  constructor(
    private readonly categoryTree: GetCategoryTreeUseCase,
    private readonly listCategories: ListCategoriesUseCase,
    private readonly searchProducts: SearchProductsUseCase,
    private readonly getProduct: GetProductUseCase,
    private readonly quoteProduct: QuoteProductUseCase,
  ) {}

  @Get('categories')
  categories() {
    return this.listCategories.execute();
  }

  @Get('categories/:slug')
  category(@Param('slug') slug: string) {
    return this.categoryTree.execute(slug);
  }

  @Get('products')
  search(@Query() dto: SearchProductsQueryDto) {
    return this.searchProducts.execute({
      categorySlug: dto.category,
      q: dto.q?.trim() || undefined,
      specs: parseSpecFilters(dto.spec),
      page: dto.page,
      pageSize: dto.pageSize,
    });
  }

  @Get('products/:id')
  product(@Param('id', ParseUUIDPipe) id: string) {
    return this.getProduct.execute(id);
  }

  @Get('products/:id/quote')
  quote(
    @CurrentUser() actor: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() dto: QuoteQueryDto,
  ) {
    return this.quoteProduct.execute(actor, id, dto.qty);
  }
}
