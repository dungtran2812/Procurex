import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  UseInterceptors,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { AuthUser } from '../../../common/auth/auth.types';
import { CurrentUser, Public, Roles } from '../../../common/auth/decorators';
import { IdempotencyInterceptor } from '../../../common/http/idempotency.interceptor';
import { SourcingService } from '../application/sourcing.service';
import { AwardDto, CreateRfqDto, CreateSupplierDto, ListRfqQueryDto, SubmitQuoteDto } from './dto';

@ApiTags('sourcing')
@ApiBearerAuth()
@Controller()
@UseInterceptors(IdempotencyInterceptor)
export class SourcingController {
  constructor(private readonly service: SourcingService) {}

  // ---------- Nhà cung cấp ----------
  @Roles('ADMIN', 'BUYER')
  @Post('suppliers')
  createSupplier(@CurrentUser() actor: AuthUser, @Body() dto: CreateSupplierDto) {
    return this.service.createSupplier(actor, dto);
  }

  @Get('suppliers')
  listSuppliers(@CurrentUser() actor: AuthUser) {
    return this.service.listSuppliers(actor);
  }

  // ---------- RFQ ----------
  @Roles('ADMIN', 'BUYER')
  @Post('rfqs')
  createRfq(@CurrentUser() actor: AuthUser, @Body() dto: CreateRfqDto) {
    return this.service.createRfq(actor, dto);
  }

  @Get('rfqs')
  listRfqs(@CurrentUser() actor: AuthUser, @Query() q: ListRfqQueryDto) {
    return this.service.listRfqs(actor, q.status);
  }

  @Get('rfqs/:id')
  getRfq(@CurrentUser() actor: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.getRfq(actor, id);
  }

  @Roles('ADMIN', 'BUYER')
  @HttpCode(200)
  @Post('rfqs/:id/close')
  close(@CurrentUser() actor: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.closeRfq(actor, id);
  }

  @Roles('ADMIN', 'BUYER')
  @HttpCode(200)
  @Post('rfqs/:id/cancel')
  cancel(@CurrentUser() actor: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.cancelRfq(actor, id);
  }

  @Roles('ADMIN', 'BUYER')
  @Post('rfqs/:id/award')
  award(
    @CurrentUser() actor: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AwardDto,
  ) {
    return this.service.award(actor, id, dto.quoteId, dto.reason);
  }

  // ---------- PO ----------
  @Get('purchase-orders')
  listPos(@CurrentUser() actor: AuthUser) {
    return this.service.listPos(actor);
  }

  @Get('purchase-orders/:id')
  getPo(@CurrentUser() actor: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.getPo(actor, id);
  }

  @Roles('ADMIN')
  @HttpCode(200)
  @Post('purchase-orders/:id/erp-sync')
  retryErp(@CurrentUser() actor: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.retryErpSync(actor, id);
  }
}

/**
 * Cổng cho NHÀ CUNG CẤP: không đăng nhập, xác thực bằng token trong link mời.
 * Token 256-bit nên không dò được, nhưng vẫn siết rate limit để chặn quét.
 */
@ApiTags('supplier-portal')
@Public()
@Throttle({ default: { limit: 30, ttl: 60_000 } })
@Controller('supplier-portal/rfq')
export class SupplierPortalController {
  constructor(private readonly service: SourcingService) {}

  @Get(':token')
  view(@Param('token') token: string) {
    return this.service.viewInvitation(token);
  }

  @Put(':token/quote')
  submit(@Param('token') token: string, @Body() dto: SubmitQuoteDto) {
    return this.service.submitQuote(token, dto);
  }
}
