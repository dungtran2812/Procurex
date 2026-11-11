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
import { ApiBearerAuth, ApiHeader, ApiTags } from '@nestjs/swagger';
import type { AuthUser } from '../../../common/auth/auth.types';
import { CurrentUser, Roles } from '../../../common/auth/decorators';
import { IdempotencyInterceptor } from '../../../common/http/idempotency.interceptor';
import {
  ApprovalRuleService,
  PurchaseRequestService,
} from '../application/use-cases/purchase-request.use-cases';
import {
  CreatePrDto,
  DecisionDto,
  ListPrQueryDto,
  ReplaceApprovalRulesDto,
} from './dto/procurement.dto';

const IDEM = ApiHeader({ name: 'Idempotency-Key', required: false });

@ApiTags('purchase-requests')
@ApiBearerAuth()
@Controller('purchase-requests')
@UseInterceptors(IdempotencyInterceptor)
export class PurchaseRequestsController {
  constructor(private readonly service: PurchaseRequestService) {}

  @IDEM
  @Post()
  create(@CurrentUser() actor: AuthUser, @Body() dto: CreatePrDto) {
    return this.service.create(actor, dto);
  }

  @Get()
  list(@CurrentUser() actor: AuthUser, @Query() q: ListPrQueryDto) {
    return this.service.list(actor, q);
  }

  @Get(':id')
  get(@CurrentUser() actor: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.get(actor, id);
  }

  @Get(':id/history')
  history(@CurrentUser() actor: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.history(actor, id);
  }

  @IDEM
  @HttpCode(200)
  @Post(':id/submit')
  submit(@CurrentUser() actor: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.submit(actor, id);
  }

  @IDEM
  @HttpCode(200)
  @Roles('APPROVER', 'ADMIN')
  @Post(':id/approve')
  approve(
    @CurrentUser() actor: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DecisionDto,
  ) {
    return this.service.decide(actor, id, 'APPROVE', dto.comment);
  }

  @IDEM
  @HttpCode(200)
  @Roles('APPROVER', 'ADMIN')
  @Post(':id/reject')
  reject(
    @CurrentUser() actor: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DecisionDto,
  ) {
    return this.service.decide(actor, id, 'REJECT', dto.comment);
  }

  @IDEM
  @HttpCode(200)
  @Post(':id/cancel')
  cancel(@CurrentUser() actor: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.cancel(actor, id);
  }
}

@ApiTags('approval-rules')
@ApiBearerAuth()
@Controller('approval-rules')
export class ApprovalRulesController {
  constructor(private readonly service: ApprovalRuleService) {}

  @Get()
  list(@CurrentUser() actor: AuthUser) {
    return this.service.list(actor);
  }

  @Roles('ADMIN')
  @Put()
  replace(@CurrentUser() actor: AuthUser, @Body() dto: ReplaceApprovalRulesDto) {
    return this.service.replace(actor, dto.rules);
  }
}
