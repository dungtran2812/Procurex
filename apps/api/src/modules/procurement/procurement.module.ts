import { Module } from '@nestjs/common';
import { CatalogModule } from '../catalog/catalog.module';
import { IdentityModule } from '../identity/identity.module';
import {
  ApprovalRuleRepository,
  ApproverDirectory,
  PricingPort,
  PurchaseRequestRepository,
} from './application/ports';
import {
  ApprovalRuleService,
  PurchaseRequestService,
} from './application/use-cases/purchase-request.use-cases';
import { CatalogPricingAdapter, IdentityApproverDirectory } from './infrastructure/adapters';
import {
  PrismaApprovalRuleRepository,
  PrismaPurchaseRequestRepository,
} from './infrastructure/prisma-purchase-request.repository';
import {
  ApprovalRulesController,
  PurchaseRequestsController,
} from './presentation/procurement.controller';

@Module({
  imports: [CatalogModule, IdentityModule],
  controllers: [PurchaseRequestsController, ApprovalRulesController],
  providers: [
    PurchaseRequestService,
    ApprovalRuleService,
    { provide: PurchaseRequestRepository, useClass: PrismaPurchaseRequestRepository },
    { provide: ApprovalRuleRepository, useClass: PrismaApprovalRuleRepository },
    { provide: PricingPort, useClass: CatalogPricingAdapter },
    { provide: ApproverDirectory, useClass: IdentityApproverDirectory },
  ],
  exports: [PurchaseRequestService],
})
export class ProcurementModule {}
